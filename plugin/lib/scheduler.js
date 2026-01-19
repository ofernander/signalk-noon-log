/**
 * Handles scheduling of reports at configured intervals
 */
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
    }, 60000); // 60 seconds
    
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
   */
  parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
  }

  /**
   * Get the next scheduled report time based on first report time and interval
   */
  getNextReportTime() {
    const now = new Date();
    const intervalMs = (this.options.reportInterval || 24) * 60 * 60 * 1000;
    const firstReportTime = this.options.firstReportTime || '12:00';
    const { hours, minutes } = this.parseTime(firstReportTime);

    // Create today's first report time
    let nextReport = new Date(now);
    
    if (this.options.useLocalTime) {
      // Use local time
      nextReport.setHours(hours, minutes, 0, 0);
    } else {
      // Use UTC time
      nextReport.setUTCHours(hours, minutes, 0, 0);
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
    const now = new Date();
    const nextReport = this.getNextReportTime();
    const timeDiff = Math.abs(now - nextReport);

    // Trigger if within 1 minute of scheduled time
    if (timeDiff < 60000) {
      // Check if we already triggered this report (prevent duplicates)
      if (this.lastReportTime && Math.abs(this.lastReportTime - nextReport) < 60000) {
        return;
      }

      this.app.debug(`Triggering scheduled report at ${now.toISOString()}`);
      this.triggerReport();
      this.lastReportTime = nextReport;
    }
  }

  /**
   * Trigger the report
   */
  triggerReport() {
    if (typeof this.onReportCallback === 'function') {
      this.onReportCallback();
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
    const nextReport = this.getNextReportTime();
    const now = new Date();
    const msUntil = nextReport - now;

    if (msUntil < 0) {
      return { hours: 0, minutes: 0, nextReport };
    }

    const hours = Math.floor(msUntil / 1000 / 60 / 60);
    const minutes = Math.floor((msUntil / 1000 / 60) % 60);

    return { hours, minutes, nextReport };
  }
}

module.exports = ReportScheduler;
