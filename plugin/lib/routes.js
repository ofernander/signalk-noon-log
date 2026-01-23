/**
 * HTTP Routes for SignalK Noon Log Plugin
 * 
 * Defines all API endpoints and delegates business logic to handler
 */

const path = require('path');
const express = require('express');
const handler = require('./routeHandler');

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
    handler.submitLog(req, res, app, plugin);
  });

  /**
   * GET /api/history
   * Get log history with optional limit
   */
  router.get('/api/history', (req, res) => {
    handler.getHistory(req, res, app, plugin);
  });

  /**
   * GET /api/logs/date/:date
   * Get log entry for a specific date (YYYY-MM-DD format)
   */
  router.get('/api/logs/date/:date', (req, res) => {
    handler.getLogByDate(req, res, app, plugin);
  });

  /**
   * GET /api/logs/dates
   * Get all dates that have logs
   */
  router.get('/api/logs/dates', (req, res) => {
    handler.getAllLogDates(req, res, app, plugin);
  });

  /**
   * GET /api/export
   * Export all logs as JSON
   */
  router.get('/api/export', (req, res) => {
    handler.exportLogs(req, res, app, plugin);
  });

  /**
   * POST /api/sendNow
   * Manually trigger a noon report immediately
   */
  router.post('/api/sendNow', async (req, res) => {
    await handler.sendNow(req, res, app, plugin);
  });

  /**
   * GET /api/getPendingLog
   * Get current pending log text
   */
  router.get('/api/getPendingLog', (req, res) => {
    handler.getPendingLog(req, res, app, plugin);
  });

  // ============================================================================
  // VOYAGE ENDPOINTS
  // ============================================================================

  /**
   * GET /api/voyage
   * Get current active voyage
   */
  router.get('/api/voyage', (req, res) => {
    handler.getCurrentVoyage(req, res, app, plugin);
  });

  /**
   * GET /api/voyages
   * Get all voyages (active and archived)
   */
  router.get('/api/voyages', (req, res) => {
    handler.getAllVoyages(req, res, app, plugin);
  });

  /**
   * GET /api/voyages/:id
   * Get voyage by ID with all logs
   */
  router.get('/api/voyages/:id', (req, res) => {
    handler.getVoyageById(req, res, app, plugin);
  });

  /**
   * DELETE /api/voyages/:id
   * Delete a voyage and all its logs
   */
  router.delete('/api/voyages/:id', (req, res) => {
    handler.deleteVoyage(req, res, app, plugin);
  });

  /**
   * PUT /api/voyages/:id/rename
   * Rename a voyage
   */
  router.put('/api/voyages/:id/rename', jsonParser, (req, res) => {
    handler.renameVoyage(req, res, app, plugin);
  });

  /**
   * POST /api/resetVoyage
   * Archive current voyage and start a new one
   */
  router.post('/api/resetVoyage', jsonParser, (req, res) => {
    handler.resetVoyage(req, res, app, plugin);
  });

  // ============================================================================
  // EMAIL MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * GET /api/email/recipients
   * Get list of email recipients
   */
  router.get('/api/email/recipients', (req, res) => {
    handler.getEmailRecipients(req, res, app, plugin);
  });

  /**
   * POST /api/email/recipients
   * Add email recipient
   */
  router.post('/api/email/recipients', jsonParser, (req, res) => {
    handler.addEmailRecipient(req, res, app, plugin);
  });

  /**
   * DELETE /api/email/recipients/:email
   * Remove email recipient
   */
  router.delete('/api/email/recipients/:email', (req, res) => {
    handler.removeEmailRecipient(req, res, app, plugin);
  });

  // ============================================================================
  // EXPORT ENDPOINTS
  // ============================================================================

  /**
   * GET /api/voyages/:id/export-gpx
   * Export voyage as GPX track file
   */
  router.get('/api/voyages/:id/export-gpx', (req, res) => {
    handler.exportGPX(req, res, app, plugin);
  });

  /**
   * GET /api/voyages/:id/export-logbook
   * Export voyage as formatted text logbook
   */
  router.get('/api/voyages/:id/export-logbook', (req, res) => {
    handler.exportLogbook(req, res, app, plugin);
  });
};