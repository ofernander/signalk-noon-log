/**
 * Handles scheduling of reports at configured intervals
 */

// FIX #9: Define time constants
const TIME_CONSTANTS = {
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  SECONDS_PER_MINUTE: 60,
  SECONDS_PER_HOUR: 60 * 60,
  MINUTES_PER_HOUR: 60,
  DEFAULT_REPORT_INTERVAL_HOURS: 24,
  CHECK_INTERVAL_MS: 60 * 1000, // Check every minute
  REPORT_TRIGGER_WINDOW_MS: 60 * 1000 // Trigger within 1 minute of scheduled time
};

class ReportScheduler {
  constructor(app, options, onReportCallback) {
    this.app = app;
    this.options = options;
    this.onReportCallback = onReportCallback;
    this.checkInterval = null;
    this.lastReportTime = null;
  }

  /**
   * Start the scheduler
   */
  start() {
    this.app.debug('Starting report scheduler');
    
    // Check every minute for scheduled reports
    this.checkInterval = setInterval(() => {
      this.checkForScheduledReport();
    }, TIME_CONSTANTS.CHECK_INTERVAL_MS);
    
    // Also check immediately
    this.checkForScheduledReport();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.app.debug('Report scheduler stopped');
  }

  /**
   * Parse time string "HH:MM" to get hours and minutes
   * @param {string} timeStr - Time string in HH:MM format
   * @returns {Object} Object with hours and minutes
   */
  parseTime(timeStr) {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      
      // FIX #8: Validate parsed values
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        this.app.error(`Invalid time format: ${timeStr}, using default 12:00`);
        return { hours: 12, minutes: 0 };
      }
      
      return { hours, minutes };
    } catch (error) {
      this.app.error(`Error parsing time ${timeStr}: ${error.message}, using default 12:00`);
      return { hours: 12, minutes: 0 };
    }
  }

  /**
   * Get the next scheduled report time based on first report time and interval
   * @returns {Date} Next report time
   */
  getNextReportTime() {
    const now = new Date();
    const intervalMs = (this.options.reportInterval || TIME_CONSTANTS.DEFAULT_REPORT_INTERVAL_HOURS) * TIME_CONSTANTS.MS_PER_HOUR;
    const firstReportTime = this.options.firstReportTime || '12:00';
    const { hours, minutes } = this.parseTime(firstReportTime);

    // Create today's first report time
    let nextReport = new Date(now);
    
    // Check timezone mode - 'gps' means UTC, 'fixed' means local/offset
    const useGpsTime = (this.options.timezoneMode === 'gps' || this.options.timezoneMode === undefined);
    
    if (useGpsTime) {
      // Use UTC time (GPS time)
      nextReport.setUTCHours(hours, minutes, 0, 0);
    } else {
      // Use local time
      nextReport.setHours(hours, minutes, 0, 0);
    }

    // If we've passed today's first report, add intervals until we find the next one
    if (nextReport <= now) {
      const timeSinceFirst = now - nextReport;
      const intervalsPassed = Math.floor(timeSinceFirst / intervalMs);
      nextReport = new Date(nextReport.getTime() + (intervalsPassed + 1) * intervalMs);
    }

    return nextReport;
  }

  /**
   * Check if it's time for a scheduled report
   */
  checkForScheduledReport() {
    try {
      const now = new Date();
      const nextReport = this.getNextReportTime();
      const timeDiff = Math.abs(now - nextReport);

      // Trigger if within 1 minute of scheduled time
      if (timeDiff < TIME_CONSTANTS.REPORT_TRIGGER_WINDOW_MS) {
        // Check if we already triggered this report (prevent duplicates)
        if (this.lastReportTime && Math.abs(this.lastReportTime - nextReport) < TIME_CONSTANTS.REPORT_TRIGGER_WINDOW_MS) {
          return;
        }

        this.app.debug(`Triggering scheduled report at ${now.toISOString()}`);
        this.triggerReport();
        this.lastReportTime = nextReport;
      }
    } catch (error) {
      // FIX #8: Better error handling
      this.app.error(`Error checking for scheduled report: ${error.message}`);
    }
  }

  /**
   * Trigger the report
   */
  triggerReport() {
    if (typeof this.onReportCallback === 'function') {
      try {
        this.onReportCallback();
      } catch (error) {
        // FIX #8: Handle callback errors
        this.app.error(`Error in report callback: ${error.message}`);
      }
    }
  }

  /**
   * Manually trigger a report (for testing)
   */
  manualTrigger() {
    this.app.debug('Manual report trigger');
    this.triggerReport();
  }

  /**
   * Get time until next report
   * @returns {Object} Object with hours and minutes until next report
   */
  getTimeUntilNextReport() {
    try {
      const nextReport = this.getNextReportTime();
      const now = new Date();
      const msUntil = nextReport - now;

      if (msUntil < 0) {
        return { hours: 0, minutes: 0, nextReport };
      }

      const hours = Math.floor(msUntil / TIME_CONSTANTS.MS_PER_HOUR);
      const minutes = Math.floor((msUntil / TIME_CONSTANTS.MS_PER_MINUTE) % TIME_CONSTANTS.MINUTES_PER_HOUR);

      return { hours, minutes, nextReport };
    } catch (error) {
      // FIX #8: Return safe default on error
      this.app.error(`Error calculating time until next report: ${error.message}`);
      return { hours: 0, minutes: 0, nextReport: new Date() };
    }
  }
}

module.exports = ReportScheduler;