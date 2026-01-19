const path = require('path');
const schema = require('./lib/schema');
const LogStorage = require('./lib/storage');
const DistanceCalculator = require('./lib/distance');
const DataCollector = require('./lib/data/collector');
const ReportScheduler = require('./lib/scheduler');
const Mailer = require('./lib/email/mailer');

module.exports = function (app) {
  let plugin = {
    id: 'signalk-noon-log',
    name: 'signalk-noon-log',
    description: 'Semi-automatic logbook and vessel tracker - creates daily noon position reports with weather data, distances, and custom log entries',
    
    schema: schema,
    uiSchema: {},

    // Plugin components
    storage: null,
    distanceCalculator: null,
    dataCollector: null,
    scheduler: null,
    mailer: null,
    publisher: null,

    // Current options
    options: {},

    // Pending log text (submitted before noon)
    pendingLogText: null,

    start: async function (options) {
      plugin.options = options;
      
      app.debug('Starting Noon Log plugin');

      try {
        // Initialize storage (async with sql.js)
        plugin.storage = new LogStorage(app);
        const storageInit = await plugin.storage.init();
        if (!storageInit) {
          app.setPluginError('Failed to initialize storage');
          return;
        }

        // Check if we need to start a new voyage (first time setup)
        const activeVoyage = plugin.storage.getActiveVoyage();
        if (!activeVoyage) {
          app.debug('No active voyage found, starting new voyage');
          plugin.storage.startNewVoyage('First Voyage');
        }

        // Initialize distance calculator
        plugin.distanceCalculator = new DistanceCalculator(app, plugin.storage);

        // Initialize data collector
        plugin.dataCollector = new DataCollector(app, options);

        // Initialize publisher
        const DeltaPublisher = require('./lib/publisher');
        plugin.publisher = new DeltaPublisher(app, plugin);

        // Initialize email if enabled
        if (options.emailSettings?.enabled) {
          plugin.mailer = new Mailer(app, options);
          plugin.mailer.init();
        }

        // Wait for position data before starting scheduler
        app.setPluginStatus('Waiting for position data...');
        app.debug('Waiting for position data before starting scheduler...');
        
        let positionCheckCount = 0;
        const maxPositionChecks = 24; // 24 checks * 5 seconds = 120 seconds timeout
        
        const positionCheckInterval = setInterval(() => {
          positionCheckCount++;
          
          const position = plugin.dataCollector.collectNoonData().position;
          
          if (position && position.latitude) {
            // Position available - start scheduler
            clearInterval(positionCheckInterval);
            
            plugin.scheduler = new ReportScheduler(app, options, plugin.handleNoonReport.bind(plugin));
            plugin.scheduler.start();
            
            // Publish initial status to SignalK
            if (plugin.publisher) {
              plugin.publisher.publishStatus();
            }
            
            app.setPluginStatus('Running');
            app.debug('Position acquired, scheduler started');
          } else if (positionCheckCount >= maxPositionChecks) {
            // Timeout - start anyway but warn
            clearInterval(positionCheckInterval);
            
            plugin.scheduler = new ReportScheduler(app, options, plugin.handleNoonReport.bind(plugin));
            plugin.scheduler.start();
            
            if (plugin.publisher) {
              plugin.publisher.publishStatus();
            }
            
            app.setPluginStatus('Running (No position data)');
            app.setPluginError('Started without position data - reports will fail until GPS is available');
          }
        }, 5000); // Check every 5 seconds

        // Don't set "Running" status until position is acquired or timeout

      } catch (error) {
        app.setPluginError(`Startup error: ${error.message}`);
        app.error('Noon Log startup error:', error);
      }
    },

    stop: function () {
      app.debug('Stopping Noon Log plugin');

      if (plugin.scheduler) {
        plugin.scheduler.stop();
      }

      if (plugin.mailer) {
        plugin.mailer.close();
      }

      if (plugin.storage) {
        plugin.storage.close();
      }

      app.setPluginStatus('Stopped');
    },

    /**
     * Handle noon report - called by scheduler
     */
    handleNoonReport: async function () {
      app.debug('Creating noon report');

      try {
        // Collect current data
        const noonData = plugin.dataCollector.collectNoonData();

        if (!noonData.position || !noonData.position.latitude) {
          app.setPluginError('No position data available for report');
          return;
        }

        // Calculate distance
        const distanceData = plugin.distanceCalculator.calculateDistanceData(
          noonData.position.latitude,
          noonData.position.longitude
        );

        // Create log entry in database
        const logId = plugin.storage.createLogEntry({
          timestamp: noonData.timestamp,
          dateStr: noonData.dateStr,
          latitude: noonData.position.latitude,
          longitude: noonData.position.longitude,
          logText: plugin.pendingLogText,
          emailSent: false
        });

        // Add custom data
        for (const data of noonData.customData) {
          plugin.storage.addLogData(
            logId,
            data.path,
            data.label,
            data.value,
            data.unit
          );
        }

        // Add distance data
        plugin.storage.addDistanceData(
          logId,
          distanceData.distanceSinceLast,
          distanceData.totalDistance
        );

        // Prepare complete log data for email
        const completeLogData = {
          ...noonData,
          logText: plugin.pendingLogText,
          distance: distanceData
        };

        // Send email if enabled
        let emailResult = null;
        if (plugin.mailer) {
          emailResult = await plugin.mailer.sendNoonLog(completeLogData);
          
          if (emailResult.success) {
            plugin.storage.markEmailSent(logId);
            app.debug('Noon report email sent successfully');
          } else {
            app.setPluginError(`Email failed: ${emailResult.error}`);
          }
        }

        // Clear pending log text
        plugin.pendingLogText = null;

        // Publish deltas to SignalK
        if (plugin.publisher) {
          plugin.publisher.publishNoonReport(completeLogData, distanceData, logId);
        }

        app.debug(`Noon report created successfully (ID: ${logId})`);

      } catch (error) {
        app.setPluginError(`Noon report error: ${error.message}`);
        app.error('Error creating noon report:', error);
      }
    },

    /**
     * Create a log entry (called from UI)
     */
    createLogEntry: function (logText) {
      app.debug('Log entry submitted:', logText ? 'with text' : 'without text');
      
      // Store the log text for the next noon report
      plugin.pendingLogText = logText;

      // Publish pending log entry to SignalK
      if (plugin.publisher) {
        plugin.publisher.publishPendingLog(logText);
      }

      return {
        success: true,
        message: 'Log entry saved. It will be included in the next noon report.',
        logText: logText
      };
    },

    /**
     * Register routes for the web interface
     */
    registerWithRouter: function (router) {
      const express = require('express');
      
      // Serve static files from public directory
      router.use(express.static(path.join(__dirname, '../public')));

      // API endpoints
      router.post('/api/submitLog', express.json(), (req, res) => {
        try {
          const { logText } = req.body;
          const result = plugin.createLogEntry(logText);
          res.json(result);
        } catch (error) {
          res.json({ success: false, error: error.message });
        }
      });

      // API endpoint: Get history
      router.get('/api/history', (req, res) => {
        try {
          const limit = parseInt(req.query.limit) || 30;
          const logs = plugin.storage.getAllLogs().slice(0, limit);
          res.json(logs);
        } catch (error) {
          res.json({ success: false, error: error.message });
        }
      });

      // API endpoint: Reset voyage
      router.post('/api/resetVoyage', require('express').json(), (req, res) => {
        try {
          const { voyageName } = req.body;
          const result = plugin.storage.startNewVoyage(voyageName);
          
          // Publish voyage reset
          if (plugin.publisher) {
            plugin.publisher.publishVoyageReset();
          }
          
          res.json({ success: true, data: result });
        } catch (error) {
          res.json({ success: false, error: error.message });
        }
      });

      // API endpoint: Export logs
      router.get('/api/export', (req, res) => {
        try {
          const logs = plugin.storage.exportLogs();
          res.json(logs);
        } catch (error) {
          res.json({ success: false, error: error.message });
        }
      });

      // API endpoint: Send log now (manual trigger)
      router.post('/api/sendNow', async (req, res) => {
        try {
          if (!plugin.scheduler) {
            res.json({ success: false, error: 'Scheduler not initialized' });
            return;
          }
          
          // Trigger report immediately
          plugin.scheduler.manualTrigger();
          
          res.json({ success: true, message: 'Report sent' });
        } catch (error) {
          res.json({ success: false, error: error.message });
        }
      });

      app.debug('Noon Log routes registered');
    }
  };

  return plugin;
};