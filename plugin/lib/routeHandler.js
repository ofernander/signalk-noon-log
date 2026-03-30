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

function validateLogText(logText) {
  if (typeof logText !== 'string' && logText !== null && logText !== undefined) {
    return { valid: false, error: 'Log text must be a string' };
  }
  if (logText && logText.length > MAX_LOG_TEXT_LENGTH) {
    return { valid: false, error: `Log text too long (max ${MAX_LOG_TEXT_LENGTH} characters)` };
  }
  return { valid: true };
}

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

function validateVoyageId(voyageId) {
  const id = parseInt(voyageId);
  if (isNaN(id) || id < 1) {
    return { valid: false, error: 'Invalid voyage ID' };
  }
  return { valid: true, id };
}

function validateEmail(email) {
  if (typeof email !== 'string') {
    return { valid: false, error: 'Email must be a string' };
  }
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Email cannot be empty' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }
  return { valid: true, email: trimmed };
}

function sendError(res, error, statusCode = 500) {
  res.status(statusCode).json({
    success: false,
    error: error.message || error
  });
}

function sendSuccess(res, data = null) {
  const response = { success: true };
  if (data !== null) {
    response.data = data;
  }
  res.json(response);
}

/**
 * Guard: returns false and sends 503 if storage is not initialized.
 * Handles the window between stop() and start() completing where
 * plugin.storage is null but the UI is still polling the API.
 */
function requireStorage(res, plugin) {
  if (!plugin.storage) {
    sendError(res, 'Plugin initializing — try again shortly', 503);
    return false;
  }
  return true;
}

// ============================================================================
// LOG HANDLERS
// ============================================================================

function submitLog(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const { logText } = req.body;
    const validation = validateLogText(logText);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    plugin.pendingLogText = logText || null;
    if (plugin.publisher) {
      plugin.publisher.publishPendingLog(logText);
      plugin.publisher.publishLogListUpdated();
    }
    app.debug(`Log entry submitted: ${logText ? 'with text' : 'empty/cleared'}`);
    sendSuccess(res, {
      message: logText ?
        'Log entry saved. It will be included in the next noon report.' :
        'Pending log cleared.',
      logText: logText
    });
  } catch (error) {
    app.error(`Error submitting log: ${error.message}`);
    sendError(res, error);
  }
}

function getHistory(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    let limit = parseInt(req.query.limit) || DEFAULT_HISTORY_LIMIT;
    if (limit < 1) limit = DEFAULT_HISTORY_LIMIT;
    if (limit > MAX_HISTORY_LIMIT) limit = MAX_HISTORY_LIMIT;
    const logs = plugin.storage.getAllLogs().slice(0, limit);
    res.json(logs);
  } catch (error) {
    app.error(`Error getting history: ${error.message}`);
    sendError(res, error);
  }
}

function getLogByDate(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const dateStr = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return sendError(res, 'Invalid date format. Use YYYY-MM-DD', 400);
    }
    const log = plugin.storage.getLogByDate(dateStr);
    if (!log) {
      return res.status(404).json({ success: false, error: 'No log found for this date' });
    }
    sendSuccess(res, { log });
  } catch (error) {
    app.error(`Error getting log by date: ${error.message}`);
    sendError(res, error);
  }
}

function getAllLogDates(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const dates = plugin.storage.getAllLogDates();
    sendSuccess(res, { dates });
  } catch (error) {
    app.error(`Error getting log dates: ${error.message}`);
    sendError(res, error);
  }
}

function exportLogs(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const logs = plugin.storage.exportLogs();
    res.json(logs);
  } catch (error) {
    app.error(`Error exporting logs: ${error.message}`);
    sendError(res, error);
  }
}

async function sendNow(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    if (!plugin.scheduler) {
      return sendError(res, 'Scheduler not initialized', 500);
    }
    plugin.scheduler.manualTrigger();
    if (plugin.publisher) {
      plugin.publisher.publishLogListUpdated();
    }
    sendSuccess(res, { message: 'Report sent' });
  } catch (error) {
    app.error(`Error sending report: ${error.message}`);
    sendError(res, error);
  }
}

function getPendingLog(req, res, app, plugin) {
  try {
    sendSuccess(res, { pendingLog: plugin.pendingLogText || null });
  } catch (error) {
    app.error(`Error getting pending log: ${error.message}`);
    sendError(res, error);
  }
}

// ============================================================================
// VOYAGE HANDLERS
// ============================================================================

function getCurrentVoyage(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const voyage = plugin.storage.getCurrentVoyage();
    sendSuccess(res, voyage);
  } catch (error) {
    app.error(`Error getting current voyage: ${error.message}`);
    sendError(res, error);
  }
}

function getAllVoyages(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const voyages = plugin.voyageManager.getAllVoyages();
    sendSuccess(res, voyages);
  } catch (error) {
    app.error(`Error getting all voyages: ${error.message}`);
    sendError(res, error);
  }
}

function getVoyageById(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const validation = validateVoyageId(req.params.id);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    const data = plugin.voyageManager.getVoyageById(validation.id);
    sendSuccess(res, data);
  } catch (error) {
    app.error(`Error getting voyage by ID: ${error.message}`);
    sendError(res, error);
  }
}

function deleteVoyage(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const validation = validateVoyageId(req.params.id);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    const result = plugin.voyageManager.deleteVoyage(validation.id);
    const activeVoyage = plugin.storage.getActiveVoyage();
    if (!activeVoyage) {
      if (plugin.scheduler) plugin.scheduler.stop();
      if (plugin.positionTracker) plugin.positionTracker.stop();
      app.setPluginStatus('No active voyage — create one to resume logging');
      if (plugin.publisher) plugin.publisher.publishVoyageDeleted();
    } else if (plugin.publisher) {
      plugin.publisher.publishVoyageListUpdated();
    }
    if (plugin.freeboardSync) {
      plugin.freeboardSync.deleteVoyageResources(validation.id).catch(err => {
        app.error(`Failed to delete Freeboard-SK resources for voyage ${validation.id}: ${err.message}`);
      });
    }
    sendSuccess(res, result);
  } catch (error) {
    app.error(`Error deleting voyage: ${error.message}`);
    sendError(res, error);
  }
}

function renameVoyage(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
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
    app.error(`Error renaming voyage: ${error.message}`);
    sendError(res, error);
  }
}

function resetVoyage(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const { voyageName } = req.body;
    if (voyageName) {
      const validation = validateVoyageName(voyageName);
      if (!validation.valid) {
        return sendError(res, validation.error, 400);
      }
    }
    const result = plugin.storage.startNewVoyage(voyageName);
    if (plugin.publisher) {
      plugin.publisher.publishVoyageReset();
      plugin.publisher.publishVoyageListUpdated();
      plugin.publisher.publishLogListUpdated();
    }
    sendSuccess(res, result);
  } catch (error) {
    app.error(`Error resetting voyage: ${error.message}`);
    sendError(res, error);
  }
}

function endVoyage(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const activeVoyage = plugin.storage.getActiveVoyage();
    if (!activeVoyage) {
      return sendError(res, 'No active voyage to end', 400);
    }
    plugin.storage.endVoyage();
    if (plugin.scheduler) plugin.scheduler.stop();
    if (plugin.positionTracker) plugin.positionTracker.stop();
    app.setPluginStatus('No active voyage — create one to resume logging');
    if (plugin.publisher) plugin.publisher.publishVoyageDeleted();
    app.debug('Active voyage ended by user');
    sendSuccess(res, { message: 'Voyage ended' });
  } catch (error) {
    app.error(`Error ending voyage: ${error.message}`);
    sendError(res, error);
  }
}

// ============================================================================
// EMAIL MANAGEMENT HANDLERS
// ============================================================================

function getEmailRecipients(req, res, app, plugin) {
  try {
    const recipients = plugin.options.emailSettings?.recipients || [];
    const recipientArray = Array.isArray(recipients) ? recipients :
      (typeof recipients === 'string' && recipients.trim() !== '') ?
        recipients.split(',').map(e => e.trim()).filter(e => e.length > 0) : [];
    sendSuccess(res, { recipients: recipientArray });
  } catch (error) {
    app.error(`Error getting email recipients: ${error.message}`);
    sendError(res, error);
  }
}

function addEmailRecipient(req, res, app, plugin) {
  try {
    const { email } = req.body;
    const validation = validateEmail(email);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    let recipients = plugin.options.emailSettings?.recipients || [];
    if (!Array.isArray(recipients)) {
      recipients = (typeof recipients === 'string' && recipients.trim() !== '') ?
        recipients.split(',').map(e => e.trim()).filter(e => e.length > 0) : [];
    }
    if (recipients.includes(validation.email)) {
      return sendError(res, 'Email already exists in recipient list', 400);
    }
    recipients.push(validation.email);
    recipients.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (!plugin.options.emailSettings) {
      plugin.options.emailSettings = {};
    }
    plugin.options.emailSettings.recipients = recipients;
    app.savePluginOptions(plugin.options, () => {
      app.debug(`Email recipient added: ${validation.email}`);
      sendSuccess(res, { recipients: recipients, message: 'Email recipient added successfully' });
    });
  } catch (error) {
    app.error(`Error adding email recipient: ${error.message}`);
    sendError(res, error);
  }
}

function removeEmailRecipient(req, res, app, plugin) {
  try {
    const emailToRemove = decodeURIComponent(req.params.email);
    let recipients = plugin.options.emailSettings?.recipients || [];
    if (!Array.isArray(recipients)) {
      recipients = (typeof recipients === 'string' && recipients.trim() !== '') ?
        recipients.split(',').map(e => e.trim()).filter(e => e.length > 0) : [];
    }
    const initialLength = recipients.length;
    recipients = recipients.filter(email => email !== emailToRemove);
    if (recipients.length === initialLength) {
      return sendError(res, 'Email not found in recipient list', 404);
    }
    if (!plugin.options.emailSettings) {
      plugin.options.emailSettings = {};
    }
    plugin.options.emailSettings.recipients = recipients;
    app.savePluginOptions(plugin.options, () => {
      app.debug(`Email recipient removed: ${emailToRemove}`);
      sendSuccess(res, { recipients: recipients, message: 'Email recipient removed successfully' });
    });
  } catch (error) {
    app.error(`Error removing email recipient: ${error.message}`);
    sendError(res, error);
  }
}

// ============================================================================
// POSITION HISTORY HANDLER
// ============================================================================

function getPositionHistory(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
    const validation = validateVoyageId(req.params.id);
    if (!validation.valid) {
      return sendError(res, validation.error, 400);
    }
    const positions = plugin.storage.getPositionsByVoyage(validation.id);
    sendSuccess(res, { positions, count: positions.length });
  } catch (error) {
    app.error(`Error getting position history: ${error.message}`);
    sendError(res, error);
  }
}

// ============================================================================
// EXPORT HANDLERS
// ============================================================================

function exportGPX(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
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
    app.error(`Error exporting GPX: ${error.message}`);
    sendError(res, error);
  }
}

function exportLogbook(req, res, app, plugin) {
  try {
    if (!requireStorage(res, plugin)) return;
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
    app.error(`Error exporting logbook: ${error.message}`);
    sendError(res, error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  submitLog,
  getHistory,
  exportLogs,
  sendNow,
  getPendingLog,
  getLogByDate,
  getAllLogDates,
  getCurrentVoyage,
  getAllVoyages,
  getVoyageById,
  deleteVoyage,
  renameVoyage,
  resetVoyage,
  endVoyage,
  getPositionHistory,
  getEmailRecipients,
  addEmailRecipient,
  removeEmailRecipient,
  exportGPX,
  exportLogbook
};
