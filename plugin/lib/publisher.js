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

      // Position track count for current voyage
      const positionCount = this.plugin.storage.getPositionTrackCount();
      deltas.push({
        path: 'navigation.log.positionsTracked',
        value: positionCount
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

      // Position track count for current voyage
      const positionCount = this.plugin.storage.getPositionTrackCount();
      deltas.push({
        path: 'navigation.log.positionsTracked',
        value: positionCount
      });
    }

    this.sendDeltas(deltas);
  }

  /**
   * Publish pending log entry status (before noon)
   * Pass true/false or the log text - we'll convert to boolean
   */
  publishPendingLog(logText) {
    const deltas = [{
      path: 'navigation.log.pendingEntry',
      value: logText ? true : false
    }];

    this.sendDeltas(deltas);
    this.app.debug(`Published pending log status to SignalK: ${logText ? 'pending' : 'cleared'}`);
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
      },
      {
        path: 'navigation.log.positionsTracked',
        value: 0
      }
    ];

    this.sendDeltas(deltas);
    this.app.debug('Published voyage reset to SignalK');
  }
}

module.exports = DeltaPublisher;