/**
 * HTTP Route Handlers for SignalK Noon Log Plugin
 * 
 * Contains all business logic for API endpoints
 * Separated from routes for better testability and organization
 */

// Constants for validation
const MAX_LOG_TEXT_LENGTH = 10000;
const MAX_VOYAGE_NAME_LENGTH = 100;
const DEFAULT_HISTORY_LIMIT = 30;
const MAX_HISTORY_LIMIT = 1000;

/**
 * Helper: Validate log text input
 */
function validateLogText(logText) {
  if (typeof logText !== 'string' && logText !== null && logText !== undefined) {
    return { valid: false, error: 'Log text must be a string' };
  }
  
  if (logText && logText.length > MAX_LOG_TEXT_LENGTH) {
    return { valid: false, error: `Log text too long (max ${MAX_LOG_TEXT_LENGTH} characters)` };
  }
  
  return { valid: true };
}

/**
 * Helper: Validate voyage name
 */
function validateVoyageName(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Voyage name must be a string' };
  }
  
  if (name.length === 0) {
    return { valid: false, error: 'Voyage name cannot be empty' };
  }
  
  if (name.length > MAX_VOYAGE_NAME_LENGTH) {
    return { valid: false, error: `Voyage name too long (max ${MAX_VOYAGE_NAME_LENGTH} characters)` };
  }
  
  return { valid: true };
}

/**
 * Helper: Validate voyage ID
 */
function validateVoyageId(voyageId) {
  const id = parseInt(voyageId);
  
  if (isNaN(id) || id < 1) {
    return { valid: false, error: 'Invalid voyage ID' };
  }
  
  return { valid: true, id };
}

/**
 * Helper: Validate email address
 */
function validateEmail(email) {
  if (typeof email !== 'string') {
    return { valid: false, error: 'Email must be a string' };
  }
  
  const trimmed = email.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Email cannot be empty' };
  }
  
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true, email: trimmed };
}

/**
 * Helper: Send error response
 */
function sendError(res, error, statusCode = 500) {
  res.status(statusCode).json({ 
    success: false, 
    error: error.message || error 
  });
}

/**
 * Helper: Send success response
 */
function sendSuccess(res, data = null) {
  const response = { success: true };
  if (data !== null) {
    response.data = data;
  }
  res.json(response);
}

// ============================================================================
// LOG HANDLERS
// ============================================================================

/**
 * POST /api/submitLog
 * Submit a log entry
 */
function submitLog(req, res, app, plugin) {
  try {
    const { logText } = req.body;
    
    // Validate input
    const validation = validateLogText(logText);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    
    // Store the log text for the next noon report
    plugin.pendingLogText = logText || null;
    
    // Publish pending log entry to SignalK
    if (plugin.publisher) {
      plugin.publisher.publishPendingLog(logText);
    }
    
    app.debug('Log entry submitted:', logText ? 'with text' : 'empty/cleared');
    
    sendSuccess(res, {
      message: logText ? 
        'Log entry saved. It will be included in the next noon report.' :
        'Pending log cleared.',
      logText: logText
    });
    
  } catch (error) {
    app.error('Error submitting log:', error);
    sendError(res, error);
  }
}

/**
 * GET /api/history
 * Get log history
 */
function getHistory(req, res, app, plugin) {
  try {
    let limit = parseInt(req.query.limit) || DEFAULT_HISTORY_LIMIT;
    
    // Clamp limit to reasonable range
    if (limit < 1) limit = DEFAULT_HISTORY_LIMIT;
    if (limit > MAX_HISTORY_LIMIT) limit = MAX_HISTORY_LIMIT;
    
    const logs = plugin.storage.getAllLogs().slice(0, limit);
    res.json(logs);
    
  } catch (error) {
    app.error('Error getting history:', error);
    sendError(res, error);
  }
}

/**
 * GET /api/logs/date/:date
 * Get log entry for a specific date
 */
function getLogByDate(req, res, app, plugin) {
  try {
    const dateStr = req.params.date;
    
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return sendError(res, 'Invalid date format. Use YYYY-MM-DD', 400);
    }
    
    // Get log for this date
    const log = plugin.storage.getLogByDate(dateStr);
    
    if (!log) {
      return res.status(404).json({ 
        success: false, 
        error: 'No log found for this date' 
      });
    }
    
    sendSuccess(res, { log });
    
  } catch (error) {
    app.error('Error getting log by date:', error);
    sendError(res, error);
  }
}

/**
 * GET /api/logs/dates
 * Get all dates that have logs
 */
function getAllLogDates(req, res, app, plugin) {
  try {
    const dates = plugin.storage.getAllLogDates();
    sendSuccess(res, { dates });
    
  } catch (error) {
    app.error('Error getting log dates:', error);
    sendError(res, error);
  }
}

/**
 * GET /api/export
 * Export all logs
 */
function exportLogs(req, res, app, plugin) {
  try {
    const logs = plugin.storage.exportLogs();
    res.json(logs);
    
  } catch (error) {
    app.error('Error exporting logs:', error);
    sendError(res, error);
  }
}

/**
 * POST /api/sendNow
 * Manually trigger noon report
 */
async function sendNow(req, res, app, plugin) {
  try {
    if (!plugin.scheduler) {
      return sendError(res, 'Scheduler not initialized', 500);
    }
    
    // Trigger report immediately
    plugin.scheduler.manualTrigger();
    
    sendSuccess(res, { message: 'Report sent' });
    
  } catch (error) {
    app.error('Error sending report:', error);
    sendError(res, error);
  }
}

/**
 * GET /api/getPendingLog
 * Get the current pending log text
 */
function getPendingLog(req, res, app, plugin) {
  try {
    sendSuccess(res, {
      pendingLog: plugin.pendingLogText || null
    });
  } catch (error) {
    app.error('Error getting pending log:', error);
    sendError(res, error);
  }
}

// ============================================================================
// VOYAGE HANDLERS
// ============================================================================

/**
 * GET /api/voyage
 * Get current active voyage
 */
function getCurrentVoyage(req, res, app, plugin) {
  try {
    const voyage = plugin.storage.getCurrentVoyage();
    sendSuccess(res, voyage);
    
  } catch (error) {
    app.error('Error getting current voyage:', error);
    sendError(res, error);
  }
}

/**
 * GET /api/voyages
 * Get all voyages
 */
function getAllVoyages(req, res, app, plugin) {
  try {
    const voyages = plugin.voyageManager.getAllVoyages();
    sendSuccess(res, voyages);
    
  } catch (error) {
    app.error('Error getting all voyages:', error);
    sendError(res, error);
  }
}

/**
 * GET /api/voyages/:id
 * Get voyage by ID
 */
function getVoyageById(req, res, app, plugin) {
  try {
    const validation = validateVoyageId(req.params.id);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    
    const data = plugin.voyageManager.getVoyageById(validation.id);
    sendSuccess(res, data);
    
  } catch (error) {
    app.error('Error getting voyage by ID:', error);
    sendError(res, error);
  }
}

/**
 * DELETE /api/voyages/:id
 * Delete a voyage
 */
function deleteVoyage(req, res, app, plugin) {
  try {
    const validation = validateVoyageId(req.params.id);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    
    const result = plugin.voyageManager.deleteVoyage(validation.id);
    
    // Also delete from Freeboard-SK if sync is enabled
    if (plugin.freeboardSync) {
      plugin.freeboardSync.deleteVoyageResources(validation.id).catch(err => {
        app.error(`Failed to delete Freeboard-SK resources for voyage ${validation.id}:`, err);
      });
    }
    
    sendSuccess(res, result);
    
  } catch (error) {
    app.error('Error deleting voyage:', error);
    sendError(res, error);
  }
}

/**
 * PUT /api/voyages/:id/rename
 * Rename a voyage
 */
function renameVoyage(req, res, app, plugin) {
  try {
    const idValidation = validateVoyageId(req.params.id);
    if (!idValidation.valid) {
      return sendError(res, idValidation.error, 400);
    }
    
    const { name } = req.body;
    const nameValidation = validateVoyageName(name);
    if (!nameValidation.valid) {
      return sendError(res, nameValidation.error, 400);
    }
    
    const result = plugin.voyageManager.renameVoyage(idValidation.id, name);
    
    // Publish updated voyage name if it's the active voyage
    const currentVoyage = plugin.storage.getCurrentVoyage();
    if (currentVoyage.startTimestamp) {
      const voyages = plugin.voyageManager.getAllVoyages();
      const renamedVoyage = voyages.find(v => v.id === idValidation.id);
      if (renamedVoyage && renamedVoyage.isActive && plugin.publisher) {
        plugin.publisher.publishStatus();
      }
    }
    
    sendSuccess(res, result);
    
  } catch (error) {
    app.error('Error renaming voyage:', error);
    sendError(res, error);
  }
}

/**
 * POST /api/resetVoyage
 * Archive current voyage and start new one
 */
function resetVoyage(req, res, app, plugin) {
  try {
    const { voyageName } = req.body;
    
    // Validate if provided
    if (voyageName) {
      const validation = validateVoyageName(voyageName);
      if (!validation.valid) {
        return sendError(res, validation.error, 400);
      }
    }
    
    const result = plugin.storage.startNewVoyage(voyageName);
    
    // Publish voyage reset
    if (plugin.publisher) {
      plugin.publisher.publishVoyageReset();
    }
    
    sendSuccess(res, result);
    
  } catch (error) {
    app.error('Error resetting voyage:', error);
    sendError(res, error);
  }
}

// ============================================================================
// EMAIL MANAGEMENT HANDLERS
// ============================================================================

/**
 * GET /api/email/recipients
 * Get list of email recipients
 */
function getEmailRecipients(req, res, app, plugin) {
  try {
    const recipients = plugin.options.emailSettings?.recipients || [];
    const recipientArray = Array.isArray(recipients) ? recipients : 
      (typeof recipients === 'string' && recipients.trim() !== '') ? 
        recipients.split(',').map(e => e.trim()).filter(e => e.length > 0) : [];
    
    sendSuccess(res, { recipients: recipientArray });
    
  } catch (error) {
    app.error('Error getting email recipients:', error);
    sendError(res, error);
  }
}

/**
 * POST /api/email/recipients
 * Add email recipient
 */
function addEmailRecipient(req, res, app, plugin) {
  try {
    const { email } = req.body;
    
    // Validate email
    const validation = validateEmail(email);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    
    // Get current recipients
    let recipients = plugin.options.emailSettings?.recipients || [];
    if (!Array.isArray(recipients)) {
      // Convert legacy string format to array
      recipients = (typeof recipients === 'string' && recipients.trim() !== '') ?
        recipients.split(',').map(e => e.trim()).filter(e => e.length > 0) : [];
    }
    
    // Check if email already exists
    if (recipients.includes(validation.email)) {
      return sendError(res, 'Email already exists in recipient list', 400);
    }
    
    // Add new email
    recipients.push(validation.email);
    
    // Sort alphabetically
    recipients.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    
    // Update plugin options
    if (!plugin.options.emailSettings) {
      plugin.options.emailSettings = {};
    }
    plugin.options.emailSettings.recipients = recipients;
    
    // Save configuration
    app.savePluginOptions(plugin.options, () => {
      app.debug(`Email recipient added: ${validation.email}`);
      sendSuccess(res, { 
        recipients: recipients,
        message: 'Email recipient added successfully'
      });
    });
    
  } catch (error) {
    app.error('Error adding email recipient:', error);
    sendError(res, error);
  }
}

/**
 * DELETE /api/email/recipients/:email
 * Remove email recipient
 */
function removeEmailRecipient(req, res, app, plugin) {
  try {
    const emailToRemove = decodeURIComponent(req.params.email);
    
    // Get current recipients
    let recipients = plugin.options.emailSettings?.recipients || [];
    if (!Array.isArray(recipients)) {
      recipients = (typeof recipients === 'string' && recipients.trim() !== '') ?
        recipients.split(',').map(e => e.trim()).filter(e => e.length > 0) : [];
    }
    
    // Remove the email
    const initialLength = recipients.length;
    recipients = recipients.filter(email => email !== emailToRemove);
    
    if (recipients.length === initialLength) {
      return sendError(res, 'Email not found in recipient list', 404);
    }
    
    // Update plugin options
    if (!plugin.options.emailSettings) {
      plugin.options.emailSettings = {};
    }
    plugin.options.emailSettings.recipients = recipients;
    
    // Save configuration
    app.savePluginOptions(plugin.options, () => {
      app.debug(`Email recipient removed: ${emailToRemove}`);
      sendSuccess(res, { 
        recipients: recipients,
        message: 'Email recipient removed successfully'
      });
    });
    
  } catch (error) {
    app.error('Error removing email recipient:', error);
    sendError(res, error);
  }
}

// ============================================================================
// EXPORT HANDLERS
// ============================================================================

/**
 * GET /api/voyages/:id/export-gpx
 * Export voyage as GPX
 */
function exportGPX(req, res, app, plugin) {
  try {
    const validation = validateVoyageId(req.params.id);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    
    const { voyage } = plugin.voyageManager.getVoyageById(validation.id);
    const gpx = plugin.voyageManager.generateGPX(validation.id);
    
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', 
      `attachment; filename="${plugin.voyageManager.getExportFilename(voyage, 'gpx')}"`
    );
    res.send(gpx);
    
  } catch (error) {
    app.error('Error exporting GPX:', error);
    sendError(res, error);
  }
}

/**
 * GET /api/voyages/:id/export-logbook
 * Export voyage as text logbook
 */
function exportLogbook(req, res, app, plugin) {
  try {
    const validation = validateVoyageId(req.params.id);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    
    const { voyage } = plugin.voyageManager.getVoyageById(validation.id);
    const logbook = plugin.voyageManager.generateLogbook(validation.id);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 
      `attachment; filename="${plugin.voyageManager.getExportFilename(voyage, 'txt')}"`
    );
    res.send(logbook);
    
  } catch (error) {
    app.error('Error exporting logbook:', error);
    sendError(res, error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Log handlers
  submitLog,
  getHistory,
  exportLogs,
  sendNow,
  getPendingLog,
  getLogByDate,
  getAllLogDates,
  
  // Voyage handlers
  getCurrentVoyage,
  getAllVoyages,
  getVoyageById,
  deleteVoyage,
  renameVoyage,
  resetVoyage,
  
  // Email handlers
  getEmailRecipients,
  addEmailRecipient,
  removeEmailRecipient,
  
  // Export handlers
  exportGPX,
  exportLogbook
};