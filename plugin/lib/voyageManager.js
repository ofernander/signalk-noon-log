/**
 * Voyage Management Module (Backend)
 * Handles all voyage-related operations
 */

class VoyageManager {
    constructor(storage) {
      this.storage = storage;
    }
  
    /**
     * Get all voyages with stats
     * @returns {Array} Array of voyage objects
     */
    getAllVoyages() {
      try {
        return this.storage.getAllVoyages();
      } catch (error) {
        // FIX #8: Better error handling
        throw new Error(`Failed to get all voyages: ${error.message}`);
      }
    }
  
    /**
     * Get voyage by ID with logs
     * @param {number} voyageId - Voyage ID
     * @returns {Object} Object with voyage and logs
     */
    getVoyageById(voyageId) {
      try {
        // FIX #11: Input validation
        if (!voyageId || typeof voyageId !== 'number' || voyageId < 1) {
          throw new Error('Invalid voyage ID');
        }
  
        const logs = this.storage.getLogsByVoyage(voyageId);
        const voyages = this.storage.getAllVoyages();
        const voyage = voyages.find(v => v.id === voyageId);
        
        if (!voyage) {
          throw new Error(`Voyage ${voyageId} not found`);
        }
  
        return {
          voyage: voyage,
          logs: logs
        };
      } catch (error) {
        // FIX #8: Better error handling with context
        throw new Error(`Failed to get voyage ${voyageId}: ${error.message}`);
      }
    }
  
    /**
     * Rename voyage
     * @param {number} voyageId - Voyage ID
     * @param {string} newName - New voyage name
     * @returns {Object} Result object
     */
    renameVoyage(voyageId, newName) {
      try {
        // FIX #11: Input validation
        if (!voyageId || typeof voyageId !== 'number' || voyageId < 1) {
          throw new Error('Invalid voyage ID');
        }
        
        if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
          throw new Error('Voyage name cannot be empty');
        }
        
        if (newName.length > 100) {
          throw new Error('Voyage name too long (max 100 characters)');
        }
  
        return this.storage.renameVoyage(voyageId, newName.trim());
      } catch (error) {
        throw new Error(`Failed to rename voyage: ${error.message}`);
      }
    }
  
    /**
     * Delete voyage
     * @param {number} voyageId - Voyage ID
     * @returns {Object} Result object
     */
    deleteVoyage(voyageId) {
      try {
        // FIX #11: Input validation
        if (!voyageId || typeof voyageId !== 'number' || voyageId < 1) {
          throw new Error('Invalid voyage ID');
        }
  
        return this.storage.deleteVoyage(voyageId);
      } catch (error) {
        throw new Error(`Failed to delete voyage: ${error.message}`);
      }
    }
  
    /**
     * Generate GPX track file
     * @param {number} voyageId - Voyage ID
     * @returns {string} GPX XML string
     */
    generateGPX(voyageId) {
      try {
        const { voyage, logs } = this.getVoyageById(voyageId);
        
        // FIX #14: Correct GPX XML tags - was <n>, should be <name>
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
  <gpx version="1.1" creator="SignalK Noon Log" xmlns="http://www.topografix.com/GPX/1/1">
    <metadata>
      <name>${this.escapeXml(voyage.name)}</name>
      <time>${new Date(voyage.startTimestamp * 1000).toISOString()}</time>
    </metadata>
    <trk>
      <name>${this.escapeXml(voyage.name)}</name>
      <trkseg>
  `;
        
        // Sort logs chronologically (oldest first for GPX track)
        const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
        
        sortedLogs.forEach(log => {
          if (log.latitude && log.longitude) {
            gpx += `      <trkpt lat="${log.latitude}" lon="${log.longitude}">
          <time>${new Date(log.timestamp * 1000).toISOString()}</time>
        </trkpt>
  `;
          }
        });
        
        gpx += `    </trkseg>
    </trk>
  </gpx>`;
        
        return gpx;
      } catch (error) {
        // FIX #8: Better error handling
        throw new Error(`Failed to generate GPX: ${error.message}`);
      }
    }
  
    /**
     * Generate formatted logbook text
     * @param {number} voyageId - Voyage ID
     * @returns {string} Formatted logbook text
     */
    generateLogbook(voyageId) {
      try {
        const { voyage, logs } = this.getVoyageById(voyageId);
        
        let logbook = `${voyage.name.toUpperCase()}
  ${'='.repeat(80)}
  
  Voyage Start: ${new Date(voyage.startTimestamp * 1000).toLocaleString()}
  Total Distance: ${voyage.totalDistance.toFixed(1)} nm
  Log Entries: ${voyage.logCount}
  
  ${'='.repeat(80)}
  
  `;
        
        // Sort logs chronologically (oldest first)
        const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
        
        sortedLogs.forEach((log, index) => {
          const date = new Date(log.timestamp * 1000);
          logbook += `\nENTRY ${index + 1} - ${date.toLocaleString()}\n`;
          logbook += `${'-'.repeat(80)}\n`;
          logbook += `Position: ${log.latitude?.toFixed(6)}, ${log.longitude?.toFixed(6)}\n`;
          
          // FIX #10: Inconsistent naming - handle both snake_case and camelCase
          const distanceSinceLast = log.distance_since_last || log.distanceSinceLast;
          if (distanceSinceLast) {
            logbook += `Distance Since Last: ${distanceSinceLast.toFixed(1)} nm\n`;
          }
          
          if (log.data && log.data.length > 0) {
            logbook += `\nConditions:\n`;
            log.data.forEach(data => {
              // FIX #10: Handle both naming conventions
              const label = data.data_label || data.label;
              const value = data.data_value || data.value;
              const unit = data.data_unit || data.unit;
              logbook += `  ${label}: ${value}${unit ? ' ' + unit : ''}\n`;
            });
          }
          
          // FIX #10: Handle both naming conventions
          const logText = log.log_text || log.logText;
          if (logText) {
            logbook += `\nLog:\n${logText}\n`;
          }
          
          logbook += `\n`;
        });
        
        return logbook;
      } catch (error) {
        // FIX #8: Better error handling
        throw new Error(`Failed to generate logbook: ${error.message}`);
      }
    }
  
    /**
     * Get filename for export
     * @param {Object} voyage - Voyage object
     * @param {string} extension - File extension
     * @returns {string} Safe filename
     */
    getExportFilename(voyage, extension) {
      try {
        // FIX #11: Input validation and safer filename generation
        if (!voyage || !voyage.name) {
          return `voyage_export.${extension}`;
        }
        
        // More thorough sanitization
        const safeName = voyage.name
          .replace(/[^a-z0-9\s-]/gi, '') // Remove special chars except space and dash
          .trim()
          .replace(/\s+/g, '_') // Replace spaces with underscores
          .substring(0, 50); // Limit length
        
        return safeName ? `${safeName}.${extension}` : `voyage_export.${extension}`;
      } catch (error) {
        return `voyage_export.${extension}`;
      }
    }
  
    /**
     * Escape XML special characters
     * @param {string} unsafe - Unsafe string
     * @returns {string} XML-safe string
     */
    escapeXml(unsafe) {
      if (!unsafe) return '';
      
      // FIX #8: More robust XML escaping
      return String(unsafe).replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case "'": return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
    }
  }
  
  module.exports = VoyageManager;