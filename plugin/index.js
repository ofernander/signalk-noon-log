const schema = require('./lib/schema');
const LogStorage = require('./lib/data/storage');
const DistanceCalculator = require('./lib/distance');
const DataCollector = require('./lib/data/collector');
const ReportScheduler = require('./lib/scheduler');
const Mailer = require('./lib/email/mailer');
const VoyageManager = require('./lib/voyageManager');
const DeltaPublisher = require('./lib/publisher');
const PositionTracker = require('./lib/positionTracker');
const FreeboardSync = require('./lib/freeboardSync');
const registerRoutes = require('./lib/routes');
const NoonReportHandler = require('./lib/noonReportHandler');

module.exports = function (app) {
  let plugin = {
    id: 'signalk-noon-log',
    name: 'Signalk-Noon-Log',
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
    voyageManager: null,
    noonReportHandler: null,
    positionTracker: null,
    freeboardSync: null,

    // Current options
    options: {},

    // Pending log text (submitted before noon)
    pendingLogText: null,

    /**
     * Start the plugin
     */
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

        // Initialize all components
        plugin.voyageManager = new VoyageManager(plugin.storage);
        plugin.distanceCalculator = new DistanceCalculator(app, plugin.storage);
        plugin.dataCollector = new DataCollector(app, options);
        plugin.publisher = new DeltaPublisher(app, plugin);

        // Initialize noon report handler
        plugin.noonReportHandler = new NoonReportHandler(app, plugin);

        // Initialize email if enabled
        if (options.emailSettings?.enabled) {
          plugin.mailer = new Mailer(app, options);
          plugin.mailer.init();
        }

        // Initialize position tracker if enabled
        plugin.positionTracker = new PositionTracker(app, plugin, plugin.storage, plugin.dataCollector, options);
        if (options.positionTracking?.enabled) {
          plugin.positionTracker.start();
          app.debug('Position tracker started');
        }

        // Initialize Freeboard-SK sync if enabled
        plugin.freeboardSync = new FreeboardSync(app, plugin, plugin.storage);
        if (options.freeboardSync?.enabled && options.positionTracking?.enabled) {
          plugin.freeboardSync.start();
          app.debug('Freeboard-SK sync started');
        }

        // Wait for position data before starting scheduler
        await plugin.waitForPosition();

      } catch (error) {
        app.setPluginError(`Startup error: ${error.message}`);
        app.error('Noon Log startup error:', error);
      }
    },

    /**
     * Stop the plugin
     */
    stop: function () {
      app.debug('Stopping Noon Log plugin');

      if (plugin.scheduler) {
        plugin.scheduler.stop();
      }

      if (plugin.positionTracker) {
        plugin.positionTracker.stop();
      }

      if (plugin.freeboardSync) {
        plugin.freeboardSync.stop();
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
     * Wait for position data before starting scheduler
     */
    waitForPosition: async function () {
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
          plugin.startScheduler();
          
        } else if (positionCheckCount >= maxPositionChecks) {
          // Timeout - start anyway but warn
          clearInterval(positionCheckInterval);
          plugin.startScheduler();
          
          app.setPluginStatus('Running (No position data)');
          app.setPluginError('Started without position data - reports will fail until GPS is available');
        }
      }, 5000); // Check every 5 seconds
    },

    /**
     * Start the scheduler once position is available
     */
    startScheduler: function () {
      plugin.scheduler = new ReportScheduler(
        app, 
        plugin.options, 
        plugin.noonReportHandler.handleNoonReport.bind(plugin.noonReportHandler)
      );
      plugin.scheduler.start();
      
      // Publish initial status to SignalK
      if (plugin.publisher) {
        plugin.publisher.publishStatus();
      }
      
      app.setPluginStatus('Running');
      app.debug('Position acquired, scheduler started');
    },

    /**
     * Register HTTP routes for the web interface
     */
    registerWithRouter: function (router) {
      registerRoutes(router, app, plugin);
      app.debug('Noon Log routes registered');
    }
  };

  return plugin;
};