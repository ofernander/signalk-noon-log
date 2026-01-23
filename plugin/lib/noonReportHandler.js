/**
 * Noon Report Handler
 * 
 * Handles the creation and sending of noon reports
 * Called by the scheduler at scheduled times or manually triggered
 */

class NoonReportHandler {
    constructor(app, plugin) {
      this.app = app;
      this.plugin = plugin;
    }
  
    /**
     * Handle noon report generation
     * This is the main entry point called by the scheduler
     */
    async handleNoonReport() {
      this.app.debug('Creating noon report');
  
      try {
        // Collect current data
        const noonData = this.plugin.dataCollector.collectNoonData();
  
        if (!noonData.position || !noonData.position.latitude) {
          this.app.setPluginError('No position data available for report');
          return;
        }
  
        // Calculate distance
        const distanceData = this.plugin.distanceCalculator.calculateDistanceData(
          noonData.position.latitude,
          noonData.position.longitude
        );
  
        // Create log entry in database
        const logId = this.createDatabaseEntry(noonData, distanceData);
  
        // Prepare complete log data for email
        const completeLogData = {
          ...noonData,
          logText: this.plugin.pendingLogText,
          distance: distanceData
        };
  
        // Send email if enabled
        await this.sendEmail(logId, completeLogData);
  
        // Clear pending log text
        this.plugin.pendingLogText = null;
  
        // Publish deltas to SignalK
        this.publishDeltas(completeLogData, distanceData, logId);
        
        // Clear pending log delta (so UI removes the yellow card)
        if (this.plugin.publisher) {
          this.plugin.publisher.publishPendingLog(null);
        }
  
        this.app.debug(`Noon report created successfully (ID: ${logId})`);
  
      } catch (error) {
        this.app.setPluginError(`Noon report error: ${error.message}`);
        this.app.error('Error creating noon report:', error);
      }
    }
  
    /**
     * Create database entry for the noon report
     */
    createDatabaseEntry(noonData, distanceData) {
      // Create main log entry
      const logId = this.plugin.storage.createLogEntry({
        timestamp: noonData.timestamp,
        dateStr: noonData.dateStr,
        latitude: noonData.position.latitude,
        longitude: noonData.position.longitude,
        logText: this.plugin.pendingLogText,
        emailSent: false
      });
  
      // Add custom data (weather, etc.)
      for (const data of noonData.customData) {
        this.plugin.storage.addLogData(
          logId,
          data.path,
          data.label,
          data.value,
          data.unit
        );
      }
  
      // Add distance data
      this.plugin.storage.addDistanceData(
        logId,
        distanceData.distanceSinceLast,
        distanceData.totalDistance
      );
  
      return logId;
    }
  
    /**
     * Send email for the noon report
     */
    async sendEmail(logId, completeLogData) {
      if (!this.plugin.mailer) {
        return; // Email not enabled
      }
  
      const emailResult = await this.plugin.mailer.sendNoonLog(completeLogData);
      
      if (emailResult.success) {
        this.plugin.storage.markEmailSent(logId);
        this.app.debug('Noon report email sent successfully');
      } else {
        this.app.setPluginError(`Email failed: ${emailResult.error}`);
      }
    }
  
    /**
     * Publish deltas to SignalK
     */
    publishDeltas(completeLogData, distanceData, logId) {
      if (this.plugin.publisher) {
        this.plugin.publisher.publishNoonReport(completeLogData, distanceData, logId);
      }
    }
  }
  
  module.exports = NoonReportHandler;