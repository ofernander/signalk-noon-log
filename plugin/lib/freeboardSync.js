/**
 * Freeboard-SK Integration Module
 * Syncs voyage tracks to SignalK Resources API for display in Freeboard-SK
 * 
 * Creates:
 * 1. Track (LineString) - All positions for continuous path
 * 2. Notes (Points) - Clickable markers for noon reports with log data
 */

class FreeboardSync {
  constructor(app, plugin, storage) {
    this.app = app;
    this.plugin = plugin;
    this.storage = storage;
    this.syncTimer = null;
  }

  /**
   * Start automatic syncing based on position tracking interval
   */
  start() {
    const options = this.plugin.options;
    
    if (!options.positionTracking?.enabled) {
      this.app.debug('Freeboard sync: Position tracking not enabled');
      return;
    }

    if (!options.freeboardSync?.enabled) {
      this.app.debug('Freeboard sync: Not enabled in settings');
      return;
    }

    // Use the same interval as position tracking
    const intervalMinutes = options.positionTracking.interval || 60;
    const intervalMs = intervalMinutes * 60 * 1000;

    this.app.debug(`Starting Freeboard sync with ${intervalMinutes} minute interval`);

    // Sync immediately on start
    this.syncActiveVoyage();

    // Then sync on interval
    this.syncTimer = setInterval(() => {
      this.syncActiveVoyage();
    }, intervalMs);
  }

  /**
   * Stop automatic syncing
   */
  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      this.app.debug('Freeboard sync stopped');
    }
  }

  /**
   * Sync the currently active voyage to Freeboard-SK
   */
  async syncActiveVoyage() {
    try {
      const activeVoyage = this.storage.getActiveVoyage();
      
      if (!activeVoyage) {
        this.app.debug('Freeboard sync: No active voyage');
        return;
      }

      await this.syncVoyage(activeVoyage.id);
      
    } catch (error) {
      this.app.error('Freeboard sync error:', error);
    }
  }

  /**
   * Sync a specific voyage to Freeboard-SK
   * Creates/updates track and note resources
   * 
   * @param {number} voyageId - Voyage ID to sync
   */
  async syncVoyage(voyageId) {
    try {
      // Get voyage info
      let voyage = null;
      const activeVoyage = this.storage.getActiveVoyage();
      
      if (activeVoyage && activeVoyage.id === voyageId) {
        voyage = activeVoyage;
      } else {
        // Try to get from all voyages
        const allVoyages = this.storage.getAllVoyages();
        voyage = allVoyages.find(v => v.id === voyageId);
      }

      const voyageName = voyage?.voyage_name || `Voyage ${voyageId}`;
      
      this.app.debug(`Syncing voyage ${voyageId}, name: "${voyageName}"`);
      
      // Get all logs for this voyage (includes auto-track and noon reports)
      const logs = this.storage.getLogsByVoyage(voyageId);
      
      if (!logs || logs.length === 0) {
        this.app.debug(`Freeboard sync: No logs for voyage ${voyageId}`);
        return;
      }

      // Separate noon reports from auto-track positions
      const noonReports = logs.filter(log => !log.is_auto_track);
      const allPositions = logs.filter(log => log.latitude && log.longitude);

      this.app.debug(`Freeboard sync: Voyage ${voyageId} - ${allPositions.length} positions`);

      // Create/update track (all positions)
      await this.syncTrack(voyageId, voyageName, allPositions);

      this.app.debug(`Freeboard sync: Completed for voyage ${voyageId}`);

    } catch (error) {
      this.app.error(`Freeboard sync error for voyage ${voyageId}:`, error);
    }
  }

  /**
   * Create/update track resource showing voyage path
   * 
   * @param {number} voyageId - Voyage ID
   * @param {string} voyageName - Voyage name
   * @param {Array} positions - Array of log entries with positions
   */
  async syncTrack(voyageId, voyageName, positions) {
    if (!positions || positions.length === 0) {
      this.app.debug('No positions to sync for track');
      return;
    }

    // Filter out any positions with invalid coordinates
    const validPositions = positions.filter(log => {
      const isValid = log.longitude != null && 
                      log.latitude != null && 
                      !isNaN(log.longitude) && 
                      !isNaN(log.latitude) &&
                      typeof log.longitude === 'number' &&
                      typeof log.latitude === 'number';
      
      if (!isValid) {
        this.app.debug(`Skipping invalid position from log ${log.id}: lat=${log.latitude}, lon=${log.longitude}`);
      }
      return isValid;
    });

    if (validPositions.length === 0) {
      this.app.debug('No valid positions to sync for track after filtering');
      return;
    }

    // Log first few coordinates for debugging

    // Create GeoJSON Feature with MultiLineString (what Freeboard expects for tracks)
    // MultiLineString wraps the coordinates in an extra array level
    const coordinates = validPositions.map(log => [log.longitude, log.latitude]);
    
    // IMPORTANT: Must wrap the Feature in a "feature" property like GPX imports do!
    const track = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'MultiLineString',
          coordinates: [coordinates]
        },
        properties: {
          name: voyageName || `Voyage ${voyageId}`,
          description: `Voyage track with ${validPositions.length} position${validPositions.length !== 1 ? 's' : ''}`,
          source: 'signalk-noon-log'
        },
        id: ''  // GPX imports have empty id
      }
    };

    // Validate JSON before sending
    const jsonString = JSON.stringify(track);
    
    // Try parsing it back to ensure it's valid JSON
    try {
      const parsed = JSON.parse(jsonString);
    } catch (e) {
      this.app.error(`Invalid JSON generated for track: ${e.message}`);
      this.app.error(`First 500 chars: ${jsonString.substring(0, 500)}`);
      return;
    }

    // PUT to SignalK resources API
    const resourceId = `noon-log-voyage-${voyageId}`;
    await this.putResource('tracks', resourceId, track);
    
    this.app.debug(`Track synced: ${resourceId} with ${validPositions.length} points, name="${voyageName}"`);
  }

  /**
   * Create/update note resources for noon reports
   * Each noon report becomes a clickable marker
   * 
   * @param {number} voyageId - Voyage ID
   * @param {Array} noonReports - Array of noon report log entries
   */
  async syncNotes(voyageId, noonReports) {
    if (!noonReports || noonReports.length === 0) {
      this.app.debug('No noon reports to sync as notes');
      return;
    }

    this.app.debug(`Syncing ${noonReports.length} noon report notes`);

    // Create a note for each noon report
    for (const report of noonReports) {
      try {
        await this.syncNote(voyageId, report);
      } catch (error) {
        this.app.error(`Failed to sync note for log ${report.id}:`, error.message);
      }
    }

    this.app.debug(`Synced ${noonReports.length} noon report notes`);
  }

  /**
   * Create/update a single note resource for a noon report
   * 
   * @param {number} voyageId - Voyage ID
   * @param {Object} report - Log entry object with full data
   */
  async syncNote(voyageId, report) {
    if (!report.latitude || !report.longitude) {
      return; // Skip if no position
    }

    // Format the note description with all available data
    const description = this.formatNoteDescription(report);
    
    // Format date for note name
    const date = new Date(report.date_str);
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

    // Create note with feature wrapper (like tracks)
    const note = {
      feature: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [report.longitude, report.latitude]
        },
        properties: {
          name: `Noon Report - ${dateStr}`,
          description: description,
          mimeType: 'text/plain',
          source: 'signalk-noon-log'
        },
        id: ''
      }
    };

    // PUT to SignalK resources API
    // Use log ID for unique resource name (multiple entries per day possible)
    const resourceId = `noon-log-${voyageId}-log-${report.id}`;
    await this.putResource('notes', resourceId, note);
    
    this.app.debug(`Note synced: ${resourceId}`);
  }

  /**
   * Format note description with log text and data
   * 
   * @param {Object} report - Log entry with data
   * @returns {string} Formatted description
   */
  formatNoteDescription(report) {
    let description = '';

    // Add log text if present
    if (report.log_text) {
      description += '=== LOG ENTRY ===\n';
      description += report.log_text.trim() + '\n\n';
    }

    // Add weather/environmental data if present
    if (report.data && report.data.length > 0) {
      description += '=== CONDITIONS ===\n';
      for (const dataPoint of report.data) {
        const value = dataPoint.data_value || 'N/A';
        const unit = dataPoint.data_unit || '';
        description += `${dataPoint.data_label}: ${value}${unit}\n`;
      }
      description += '\n';
    }

    // Add distance data if present
    if (report.distance) {
      description += '=== PROGRESS ===\n';
      if (report.distance.distance_since_last) {
        description += `Distance today: ${report.distance.distance_since_last.toFixed(1)}nm\n`;
      }
      if (report.distance.total_distance) {
        description += `Total distance: ${report.distance.total_distance.toFixed(1)}nm\n`;
      }
    }

    // Add position
    description += `\n=== POSITION ===\n`;
    description += this.formatPosition(report.latitude, report.longitude);

    return description.trim();
  }

  /**
   * Format position as degrees and minutes
   * 
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {string} Formatted position
   */
  formatPosition(lat, lon) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';

    const latDeg = Math.floor(Math.abs(lat));
    const latMin = ((Math.abs(lat) - latDeg) * 60).toFixed(3);

    const lonDeg = Math.floor(Math.abs(lon));
    const lonMin = ((Math.abs(lon) - lonDeg) * 60).toFixed(3);

    return `${latDeg}°${latMin}'${latDir}, ${lonDeg}°${lonMin}'${lonDir}`;
  }

  /**
   * PUT resource to SignalK Resources API
   * 
   * @param {string} resourceType - 'tracks', 'notes', 'waypoints', etc.
   * @param {string} resourceId - Unique resource identifier
   * @param {Object} data - Resource data (GeoJSON)
   */
  async putResource(resourceType, resourceId, data) {
    try {
      // Use SignalK's built-in resource API if available
      if (this.app.resourcesApi && this.app.resourcesApi.setResource) {
        await this.app.resourcesApi.setResource(resourceType, resourceId, data);
        this.app.debug(`Resource PUT successful via resourcesApi: ${resourceType}/${resourceId}`);
        return;
      }

      // Fallback: Use Node.js http module
      const http = require('http');
      const url = `/signalk/v2/api/resources/${resourceType}/${resourceId}`;
      const postData = JSON.stringify(data);
      
      
      const options = {
        hostname: 'localhost',
        port: 3000, // Default SignalK port
        path: url,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              this.app.debug(`Resource PUT successful: ${resourceType}/${resourceId}`);
              resolve();
            } else {
              const errorMsg = `HTTP ${res.statusCode}: ${responseData}`;
              this.app.error(`PUT ${resourceType}/${resourceId} failed: ${errorMsg}`);
              reject(new Error(errorMsg));
            }
          });
        });

        req.on('error', (error) => {
          this.app.error(`PUT ${resourceType}/${resourceId} request error:`, error.message);
          reject(error);
        });

        req.write(postData);
        req.end();
      });

    } catch (error) {
      this.app.error(`Failed to PUT resource ${resourceType}/${resourceId}:`, error.message || error);
      throw error;
    }
  }

  /**
   * Delete all resources for a voyage (when voyage is deleted)
   * 
   * @param {number} voyageId - Voyage ID to delete resources for
   */
  async deleteVoyageResources(voyageId) {
    try {
      // Delete track
      const trackId = `noon-log-voyage-${voyageId}`;
      await this.deleteResource('tracks', trackId);

      // Delete all notes for this voyage
      // Get all logs to find their IDs
      const logs = this.storage.getLogsByVoyage(voyageId);
      for (const log of logs) {
        if (!log.is_auto_track) {
          const noteId = `noon-log-${voyageId}-log-${log.id}`;
          await this.deleteResource('notes', noteId);
        }
      }

      this.app.debug(`Deleted Freeboard-SK resources for voyage ${voyageId}`);

    } catch (error) {
      this.app.error(`Failed to delete resources for voyage ${voyageId}:`, error);
    }
  }

  /**
   * DELETE resource from SignalK Resources API
   * 
   * @param {string} resourceType - 'tracks', 'notes', etc.
   * @param {string} resourceId - Resource identifier
   */
  async deleteResource(resourceType, resourceId) {
    try {
      // Use SignalK's built-in resource API if available
      if (this.app.resourcesApi && this.app.resourcesApi.deleteResource) {
        await this.app.resourcesApi.deleteResource(resourceType, resourceId);
        this.app.debug(`Resource deleted: ${resourceType}/${resourceId}`);
        return;
      }

      // Fallback: Use Node.js http module
      const http = require('http');
      const url = `/signalk/v2/api/resources/${resourceType}/${resourceId}`;
      
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: url,
        method: 'DELETE'
      };

      return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 404) {
            // 404 is OK - resource already doesn't exist
            this.app.debug(`Resource deleted: ${resourceType}/${resourceId}`);
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });

        req.on('error', (error) => {
          // Don't throw on delete errors, just log
          this.app.debug(`Error deleting resource ${resourceType}/${resourceId}:`, error.message);
          resolve(); // Resolve anyway
        });

        req.end();
      });

    } catch (error) {
      this.app.error(`Failed to DELETE resource ${resourceType}/${resourceId}:`, error);
    }
  }

  /**
   * Manually sync all voyages (useful for initial setup or repair)
   */
  async syncAllVoyages() {
    try {
      const allVoyages = this.storage.getAllVoyages();
      
      this.app.debug(`Syncing ${allVoyages.length} voyages to Freeboard-SK`);

      for (const voyage of allVoyages) {
        await this.syncVoyage(voyage.id);
      }

      this.app.debug('All voyages synced to Freeboard-SK');

    } catch (error) {
      this.app.error('Failed to sync all voyages:', error);
    }
  }
}

module.exports = FreeboardSync;