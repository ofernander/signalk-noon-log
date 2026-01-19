const path = require('path');
const schema = require('./lib/schema');
const LogStorage = require('./lib/storage');
const DistanceCalculator = require('./lib/distance');
const DataCollector = require('./lib/data/collector');
const ReportScheduler = require('./lib/scheduler');
const Mailer = require('./lib/email/mailer');
const VoyageManager = require('./lib/voyageManager');

// FIX #9: Define constants
const CONSTANTS = {
  MAX_LOG_TEXT_LENGTH: 10000,
  MAX_VOYAGE_NAME_LENGTH: 100,
  DEFAULT_HISTORY_LIMIT: 30,
  MAX_HISTORY_LIMIT: 1000
};

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

    // Track intervals for proper cleanup
    intervals: [],

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

        // Initialize voyage manager
        plugin.voyageManager = new VoyageManager(plugin.storage);

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
        
        // Store interval in plugin.intervals array for proper cleanup
        const positionCheckInterval = setInterval(() => {
          positionCheckCount++;
          
          const position = plugin.dataCollector.collectNoonData().position;
          
          if (position && position.latitude) {
            // Position available - start scheduler
            clearInterval(positionCheckInterval);
            const index = plugin.intervals.indexOf(positionCheckInterval);
            if (index > -1) plugin.intervals.splice(index, 1);
            
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
            const index = plugin.intervals.indexOf(positionCheckInterval);
            if (index > -1) plugin.intervals.splice(index, 1);
            
            plugin.scheduler = new ReportScheduler(app, options, plugin.handleNoonReport.bind(plugin));
            plugin.scheduler.start();
            
            if (plugin.publisher) {
              plugin.publisher.publishStatus();
            }
            
            app.setPluginStatus('Running (No position data)');
            app.setPluginError('Started without position data - reports will fail until GPS is available');
          }
        }, 5000); // Check every 5 seconds
        
        plugin.intervals.push(positionCheckInterval);

      } catch (error) {
        app.setPluginError(`Startup error: ${error.message}`);
        app.error('Noon Log startup error:', error);
      }
    },

    stop: function () {
      app.debug('Stopping Noon Log plugin');

      // Clean up all intervals
      plugin.intervals.forEach(interval => clearInterval(interval));
      plugin.intervals = [];

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
      const jsonParser = express.json();
      
      // Serve static files from public directory
      router.use(express.static(path.join(__dirname, '../public')));

      // FIX #11: Add input validation to API endpoints
      // API endpoint: Submit log
      router.post('/api/submitLog', jsonParser, (req, res) => {
        try {
          const { logText } = req.body;
          
          // Validate input
          if (logText && typeof logText !== 'string') {
            return res.status(400).json({ 
              success: false, 
              error: 'Log text must be a string' 
            });
          }
          
          if (logText && logText.length > CONSTANTS.MAX_LOG_TEXT_LENGTH) {
            return res.status(400).json({ 
              success: false, 
              error: `Log text too long (max ${CONSTANTS.MAX_LOG_TEXT_LENGTH} characters)` 
            });
          }
          
          const result = plugin.createLogEntry(logText);
          res.json(result);
        } catch (error) {
          app.error('Error in submitLog:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Get history
      router.get('/api/history', (req, res) => {
        try {
          let limit = parseInt(req.query.limit) || CONSTANTS.DEFAULT_HISTORY_LIMIT;
          
          // Validate limit
          if (isNaN(limit) || limit < 1) {
            limit = CONSTANTS.DEFAULT_HISTORY_LIMIT;
          }
          if (limit > CONSTANTS.MAX_HISTORY_LIMIT) {
            limit = CONSTANTS.MAX_HISTORY_LIMIT;
          }
          
          const logs = plugin.storage.getAllLogs().slice(0, limit);
          res.json(logs);
        } catch (error) {
          app.error('Error in history:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Get current voyage
      router.get('/api/voyage', (req, res) => {
        try {
          const voyage = plugin.storage.getCurrentVoyage();
          res.json({ success: true, data: voyage });
        } catch (error) {
          app.error('Error in voyage:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Get all voyages
      router.get('/api/voyages', (req, res) => {
        try {
          const voyages = plugin.voyageManager.getAllVoyages();
          res.json({ success: true, data: voyages });
        } catch (error) {
          app.error('Error in voyages:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Get voyage by ID
      router.get('/api/voyages/:id', (req, res) => {
        try {
          const voyageId = parseInt(req.params.id);
          
          // Validate ID
          if (isNaN(voyageId) || voyageId < 1) {
            return res.status(400).json({ 
              success: false, 
              error: 'Invalid voyage ID' 
            });
          }
          
          const data = plugin.voyageManager.getVoyageById(voyageId);
          res.json({ success: true, data });
        } catch (error) {
          app.error('Error in getVoyage:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Delete voyage
      router.delete('/api/voyages/:id', (req, res) => {
        try {
          const voyageId = parseInt(req.params.id);
          
          // Validate ID
          if (isNaN(voyageId) || voyageId < 1) {
            return res.status(400).json({ 
              success: false, 
              error: 'Invalid voyage ID' 
            });
          }
          
          const result = plugin.voyageManager.deleteVoyage(voyageId);
          res.json({ success: true, data: result });
        } catch (error) {
          app.error('Error in deleteVoyage:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Rename voyage
      router.put('/api/voyages/:id/rename', jsonParser, (req, res) => {
        try {
          const voyageId = parseInt(req.params.id);
          const { name } = req.body;
          
          // Validate ID
          if (isNaN(voyageId) || voyageId < 1) {
            return res.status(400).json({ 
              success: false, 
              error: 'Invalid voyage ID' 
            });
          }
          
          // Validate name
          if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ 
              success: false, 
              error: 'Voyage name is required' 
            });
          }
          
          if (name.length > CONSTANTS.MAX_VOYAGE_NAME_LENGTH) {
            return res.status(400).json({ 
              success: false, 
              error: `Voyage name too long (max ${CONSTANTS.MAX_VOYAGE_NAME_LENGTH} characters)` 
            });
          }
          
          const result = plugin.voyageManager.renameVoyage(voyageId, name);
          
          // Publish updated voyage name if it's the active voyage
          const currentVoyage = plugin.storage.getCurrentVoyage();
          if (currentVoyage.startTimestamp) {
            const voyages = plugin.voyageManager.getAllVoyages();
            const renamedVoyage = voyages.find(v => v.id === voyageId);
            if (renamedVoyage && renamedVoyage.isActive && plugin.publisher) {
              plugin.publisher.publishStatus();
            }
          }
          
          res.json({ success: true, data: result });
        } catch (error) {
          app.error('Error in renameVoyage:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Export voyage as GPX
      router.get('/api/voyages/:id/export-gpx', (req, res) => {
        try {
          const voyageId = parseInt(req.params.id);
          
          // Validate ID
          if (isNaN(voyageId) || voyageId < 1) {
            return res.status(400).json({ 
              success: false, 
              error: 'Invalid voyage ID' 
            });
          }
          
          const { voyage } = plugin.voyageManager.getVoyageById(voyageId);
          const gpx = plugin.voyageManager.generateGPX(voyageId);
          
          res.setHeader('Content-Type', 'application/gpx+xml');
          res.setHeader('Content-Disposition', `attachment; filename="${plugin.voyageManager.getExportFilename(voyage, 'gpx')}"`);
          res.send(gpx);
        } catch (error) {
          app.error('Error in exportGPX:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Export voyage logbook as formatted text
      router.get('/api/voyages/:id/export-logbook', (req, res) => {
        try {
          const voyageId = parseInt(req.params.id);
          
          // Validate ID
          if (isNaN(voyageId) || voyageId < 1) {
            return res.status(400).json({ 
              success: false, 
              error: 'Invalid voyage ID' 
            });
          }
          
          const { voyage } = plugin.voyageManager.getVoyageById(voyageId);
          const logbook = plugin.voyageManager.generateLogbook(voyageId);
          
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', `attachment; filename="${plugin.voyageManager.getExportFilename(voyage, 'txt')}"`);
          res.send(logbook);
        } catch (error) {
          app.error('Error in exportLogbook:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Reset voyage
      router.post('/api/resetVoyage', jsonParser, (req, res) => {
        try {
          const { voyageName } = req.body;
          
          // Validate voyage name
          if (voyageName && typeof voyageName !== 'string') {
            return res.status(400).json({ 
              success: false, 
              error: 'Voyage name must be a string' 
            });
          }
          
          if (voyageName && voyageName.length > CONSTANTS.MAX_VOYAGE_NAME_LENGTH) {
            return res.status(400).json({ 
              success: false, 
              error: `Voyage name too long (max ${CONSTANTS.MAX_VOYAGE_NAME_LENGTH} characters)` 
            });
          }
          
          const result = plugin.storage.startNewVoyage(voyageName);
          
          // Publish voyage reset
          if (plugin.publisher) {
            plugin.publisher.publishVoyageReset();
          }
          
          res.json({ success: true, data: result });
        } catch (error) {
          app.error('Error in resetVoyage:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Export logs
      router.get('/api/export', (req, res) => {
        try {
          const logs = plugin.storage.exportLogs();
          res.json(logs);
        } catch (error) {
          app.error('Error in export:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // API endpoint: Send log now (manual trigger)
      router.post('/api/sendNow', async (req, res) => {
        try {
          if (!plugin.scheduler) {
            return res.status(503).json({ 
              success: false, 
              error: 'Scheduler not initialized' 
            });
          }
          
          // Trigger report immediately
          plugin.scheduler.manualTrigger();
          
          res.json({ success: true, message: 'Report triggered' });
        } catch (error) {
          app.error('Error in sendNow:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      });

      app.debug('Noon Log routes registered');
    }
  };

  return plugin;
};