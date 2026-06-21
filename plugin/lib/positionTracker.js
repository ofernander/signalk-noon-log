/**
 * Position Tracker Module
 * Handles high-frequency position logging separate from noon reports
 */

class PositionTracker {
  constructor(app, plugin, storage, dataCollector, options) {
    this.app = app;
    this.plugin = plugin;
    this.storage = storage;
    this.dataCollector = dataCollector;
    this.options = options;
    this.interval = null;
    this.lastPosition = null;
    this.recordedWhileStopped = false; // allows one position record when vessel first stops
  }

  /**
   * Start position tracking
   */
  start() {
    if (!this.options.positionTracking?.enabled) {
      this.app.debug('[PositionTracker] not enabled in options');
      return;
    }

    const intervalMinutes = this.options.positionTracking.interval || 60;
    const intervalMs = intervalMinutes * 60 * 1000;

    this.app.debug(`[PositionTracker] starting with ${intervalMinutes} minute interval`);

    // Track immediately
    this.app.debug('[PositionTracker] calling recordPosition() immediately on start');
    this.recordPosition();

    // Then track at intervals
    this.interval = setInterval(() => {
      this.recordPosition();
    }, intervalMs);
  }

  /**
   * Stop position tracking
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.app.debug('Position tracker stopped');
    }
  }

  /**
   * Record current position to database
   */
  recordPosition() {
    try {
      // Get current position
      const noonData = this.dataCollector.collectNoonData();

      this.app.debug(`[PositionTracker.recordPosition] position=${JSON.stringify(noonData.position)}`);
      
      if (!noonData.position || !noonData.position.latitude) {
        this.app.debug('Position record skipped — no GPS data available');
        return;
      }

      // Speed check — require minimum SOG to record position
      // One record is always allowed when vessel first stops (captures dock/anchor position)
      const minSpeed = this.options.positionTracking?.minSpeed ?? 0.5;
      if (minSpeed > 0) {
        const sog = this.dataCollector.getValue('navigation.speedOverGround');
        const sogKnots = sog != null ? sog * 1.94384 : null;
        const isMoving = sogKnots != null && sogKnots >= minSpeed;

        if (isMoving) {
          // Vessel moving — reset flag so next stop gets its one allowed record
          this.recordedWhileStopped = false;
        } else {
          if (this.recordedWhileStopped) {
            this.app.debug(`Position record skipped — SOG ${sogKnots != null ? sogKnots.toFixed(2) + ' kts' : 'unavailable'} below minimum ${minSpeed} kts (stopped position already recorded)`);
            return;
          }
          // First record while stopped — allow it then set flag
          this.app.debug(`Position recorded at stop — SOG ${sogKnots != null ? sogKnots.toFixed(2) + ' kts' : 'unavailable'} below minimum ${minSpeed} kts`);
          this.recordedWhileStopped = true;
        }
      }

      // Position threshold check
      if (this.shouldSkipPosition(noonData.position)) {
        this.app.debug('[PositionTracker.recordPosition] position unchanged, skipping');
        return;
      }

      // Store position
      this.lastPosition = noonData.position;

      // Create log entry with special flag for auto-tracked positions
      const logId = this.storage.createLogEntry({
        timestamp: noonData.timestamp,
        dateStr: noonData.dateStr,
        latitude: noonData.position.latitude,
        longitude: noonData.position.longitude,
        logText: null, // No log text for auto-tracked positions
        emailSent: false,
        isAutoTrack: true // Flag to distinguish from manual noon reports
      });

      // Add weather/environmental data from the collector
      if (noonData.customData && noonData.customData.length > 0) {
        for (const data of noonData.customData) {
          this.storage.addLogData(
            logId,
            data.path,
            data.label,
            data.value,
            data.unit
          );
        }
      }

      this.app.debug(`Position tracked: ${noonData.position.latitude.toFixed(6)}, ${noonData.position.longitude.toFixed(6)} (ID: ${logId})`);


      // Publish updated position count to SignalK
      if (this.plugin && this.plugin.publisher) {
        this.plugin.publisher.publishStatus();
      }

    } catch (error) {
      this.app.error('Position tracker error:', error);
    }
  }

  /**
   * Check if position has changed enough to warrant recording
   * Returns true if position should be skipped (hasn't moved significantly)
   * 
   * @param {Object} position - Current position
   * @returns {boolean} True if position should be skipped
   */
  shouldSkipPosition(position) {
    if (!this.lastPosition) return false;

    // Calculate distance moved (simple approximation)
    const latDiff = Math.abs(position.latitude - this.lastPosition.latitude);
    const lonDiff = Math.abs(position.longitude - this.lastPosition.longitude);

    // Skip if moved less than ~100 meters (0.001 degrees ≈ 111 meters at equator)
    const threshold = 0.001;
    
    return (latDiff < threshold && lonDiff < threshold);
  }

  /**
   * Get statistics about tracked positions
   * @returns {Object} Statistics object
   */
  getStatistics() {
    // This could be expanded to show:
    // - Total positions tracked
    // - Tracking uptime
    // - Storage used
    // - etc.
    
    return {
      enabled: this.options.positionTracking?.enabled || false,
      interval: this.options.positionTracking?.interval || 0,
      isRunning: this.interval !== null
    };
  }
}

module.exports = PositionTracker;