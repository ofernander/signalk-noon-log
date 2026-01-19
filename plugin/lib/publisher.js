/**
 * Publishes noon log data as SignalK deltas
 */
class DeltaPublisher {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * Publish noon report data to SignalK
   */
  publishNoonReport(logData, distanceData, logId) {
    const deltas = [];

    // Publish the log entry text
    if (logData.logText) {
      deltas.push({
        path: 'navigation.log.lastEntry',
        value: logData.logText
      });
    }

    // Publish distance data
    if (distanceData) {
      deltas.push({
        path: 'navigation.log.distance.sinceLast',
        value: distanceData.distanceSinceLast
      });
      deltas.push({
        path: 'navigation.log.distance.total',
        value: distanceData.totalDistance
      });
    }

    // Publish full log object
    deltas.push({
      path: 'navigation.log',
      value: {
        timestamp: logData.timestamp,
        dateStr: logData.dateStr,
        position: logData.position,
        logText: logData.logText || null,
        distance: distanceData,
        customData: logData.customData,
        logId: logId
      }
    });

    // Calculate and publish next report time
    if (this.plugin.scheduler) {
      const timeUntilReport = this.plugin.scheduler.getTimeUntilNextReport();
      if (timeUntilReport && timeUntilReport.nextReport) {
        deltas.push({
          path: 'navigation.log.nextReport',
          value: timeUntilReport.nextReport.toISOString()
        });
      }
    }

    // Get and publish total reports sent count
    if (this.plugin.storage) {
      const allLogs = this.plugin.storage.getAllLogs();
      const reportsSent = allLogs.filter(log => log.email_sent).length;
      deltas.push({
        path: 'navigation.log.reportsSent',
        value: reportsSent
      });
    }

    // Send deltas to SignalK
    this.sendDeltas(deltas);
  }

  /**
   * Send delta array to SignalK
   */
  sendDeltas(deltas) {
    if (deltas.length === 0) return;

    this.app.handleMessage(this.plugin.id, {
      updates: [
        {
          values: deltas
        }
      ]
    });

    this.app.debug(`Published ${deltas.length} log deltas to SignalK`);
  }

  /**
   * Publish status update (for periodic updates)
   */
  publishStatus() {
    const deltas = [];

    // Next report time
    if (this.plugin.scheduler) {
      const timeUntilReport = this.plugin.scheduler.getTimeUntilNextReport();
      if (timeUntilReport && timeUntilReport.nextReport) {
        deltas.push({
          path: 'navigation.log.nextReport',
          value: timeUntilReport.nextReport.toISOString()
        });
      }
    }

    // Total voyage distance
    if (this.plugin.distanceCalculator && this.plugin.storage) {
      const totalDistance = this.plugin.distanceCalculator.getTotalVoyageDistance();
      deltas.push({
        path: 'navigation.log.distance.total',
        value: totalDistance
      });
    }

    // Reports sent count
    if (this.plugin.storage) {
      const allLogs = this.plugin.storage.getAllLogs();
      const reportsSent = allLogs.filter(log => log.email_sent).length;
      deltas.push({
        path: 'navigation.log.reportsSent',
        value: reportsSent
      });
      
      // Current voyage name
      const voyage = this.plugin.storage.getCurrentVoyage();
      deltas.push({
        path: 'navigation.log.voyageName',
        value: voyage.name
      });
    }

    this.sendDeltas(deltas);
  }

  /**
   * Publish pending log entry (before noon)
   */
  publishPendingLog(logText) {
    const deltas = [];

    if (logText) {
      deltas.push({
        path: 'navigation.log.pendingEntry',
        value: logText
      });
    }

    this.sendDeltas(deltas);
    this.app.debug('Published pending log entry to SignalK');
  }

  /**
   * Publish voyage reset (distance back to 0)
   */
  publishVoyageReset() {
    // Get new voyage info
    const voyage = this.plugin.storage.getCurrentVoyage();
    
    const deltas = [
      {
        path: 'navigation.log.distance.total',
        value: 0
      },
      {
        path: 'navigation.log.distance.sinceLast',
        value: 0
      },
      {
        path: 'navigation.log.voyageName',
        value: voyage.name
      }
    ];

    this.sendDeltas(deltas);
    this.app.debug('Published voyage reset to SignalK');
  }
}

module.exports = DeltaPublisher;