/**
 * HTTP Routes for SignalK Noon Log Plugin
 * 
 * Defines all API endpoints and delegates business logic to handlers
 */

const path = require('path');
const express = require('express');
const handlers = require('./routeHandlers');

module.exports = function registerRoutes(router, app, plugin) {
  
  // Serve static files from public directory
  router.use(express.static(path.join(__dirname, '../public')));

  // JSON parser middleware (reused for all POST/PUT routes)
  const jsonParser = express.json();

  // ============================================================================
  // LOG ENDPOINTS
  // ============================================================================

  /**
   * POST /api/submitLog
   * Submit a log entry (stores as pending until next noon report)
   */
  router.post('/api/submitLog', jsonParser, (req, res) => {
    handlers.submitLog(req, res, app, plugin);
  });

  /**
   * GET /api/history
   * Get log history with optional limit
   */
  router.get('/api/history', (req, res) => {
    handlers.getHistory(req, res, app, plugin);
  });

  /**
   * GET /api/logs/date/:date
   * Get log entry for a specific date (YYYY-MM-DD format)
   */
  router.get('/api/logs/date/:date', (req, res) => {
    handlers.getLogByDate(req, res, app, plugin);
  });

  /**
   * GET /api/logs/dates
   * Get all dates that have logs
   */
  router.get('/api/logs/dates', (req, res) => {
    handlers.getAllLogDates(req, res, app, plugin);
  });

  /**
   * GET /api/export
   * Export all logs as JSON
   */
  router.get('/api/export', (req, res) => {
    handlers.exportLogs(req, res, app, plugin);
  });

  /**
   * POST /api/sendNow
   * Manually trigger a noon report immediately
   */
  router.post('/api/sendNow', async (req, res) => {
    await handlers.sendNow(req, res, app, plugin);
  });

  /**
   * GET /api/getPendingLog
   * Get current pending log text
   */
  router.get('/api/getPendingLog', (req, res) => {
    handlers.getPendingLog(req, res, app, plugin);
  });

  // ============================================================================
  // VOYAGE ENDPOINTS
  // ============================================================================

  /**
   * GET /api/voyage
   * Get current active voyage
   */
  router.get('/api/voyage', (req, res) => {
    handlers.getCurrentVoyage(req, res, app, plugin);
  });

  /**
   * GET /api/voyages
   * Get all voyages (active and archived)
   */
  router.get('/api/voyages', (req, res) => {
    handlers.getAllVoyages(req, res, app, plugin);
  });

  /**
   * GET /api/voyages/:id
   * Get voyage by ID with all logs
   */
  router.get('/api/voyages/:id', (req, res) => {
    handlers.getVoyageById(req, res, app, plugin);
  });

  /**
   * DELETE /api/voyages/:id
   * Delete a voyage and all its logs
   */
  router.delete('/api/voyages/:id', (req, res) => {
    handlers.deleteVoyage(req, res, app, plugin);
  });

  /**
   * PUT /api/voyages/:id/rename
   * Rename a voyage
   */
  router.put('/api/voyages/:id/rename', jsonParser, (req, res) => {
    handlers.renameVoyage(req, res, app, plugin);
  });

  /**
   * POST /api/resetVoyage
   * Archive current voyage and start a new one
   */
  router.post('/api/resetVoyage', jsonParser, (req, res) => {
    handlers.resetVoyage(req, res, app, plugin);
  });

  // ============================================================================
  // EMAIL MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * GET /api/email/recipients
   * Get list of email recipients
   */
  router.get('/api/email/recipients', (req, res) => {
    handlers.getEmailRecipients(req, res, app, plugin);
  });

  /**
   * POST /api/email/recipients
   * Add email recipient
   */
  router.post('/api/email/recipients', jsonParser, (req, res) => {
    handlers.addEmailRecipient(req, res, app, plugin);
  });

  /**
   * DELETE /api/email/recipients/:email
   * Remove email recipient
   */
  router.delete('/api/email/recipients/:email', (req, res) => {
    handlers.removeEmailRecipient(req, res, app, plugin);
  });

  // ============================================================================
  // EXPORT ENDPOINTS
  // ============================================================================

  /**
   * GET /api/voyages/:id/export-gpx
   * Export voyage as GPX track file
   */
  router.get('/api/voyages/:id/export-gpx', (req, res) => {
    handlers.exportGPX(req, res, app, plugin);
  });

  /**
   * GET /api/voyages/:id/export-logbook
   * Export voyage as formatted text logbook
   */
  router.get('/api/voyages/:id/export-logbook', (req, res) => {
    handlers.exportLogbook(req, res, app, plugin);
  });
};