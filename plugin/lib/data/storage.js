const { DatabaseSync: Database } = require('node:sqlite'); // built-in Node 22+ — no dependencies, no WASM, no compilation
const path = require('path');

class LogStorage {
  constructor(app) {
    this.app = app;
    const dataDir = app.getDataDirPath();
    this.dbPath = path.join(dataDir, 'noon-log.db');
    this.db = null;
  }

  // Synchronous init — DatabaseSync is fully synchronous, no await needed
  // index.js calls await plugin.storage.init() which still works fine
  init() {
    try {
      this.db = new Database(this.dbPath);
      this.app.debug(`Database opened: ${this.dbPath}`);

      // Check if table has new columns - if not, recreate
      const tableInfo = this.db.prepare('PRAGMA table_info(log_entries)').all();
      if (tableInfo.length > 0) {
        const columns = tableInfo.map(row => row.name);
        const hasVoyageId = columns.includes('voyage_id');
        const hasIsAutoTrack = columns.includes('is_auto_track');

        if (!hasVoyageId || !hasIsAutoTrack) {
          this.app.debug('Outdated schema detected, recreating tables...');
          this.db.exec('DROP TABLE IF EXISTS log_entries');
          this.db.exec('DROP TABLE IF EXISTS log_data');
          this.db.exec('DROP TABLE IF EXISTS distance_log');
        }
      }

      this.createTables();
      this.app.debug('Noon log database initialized');
      return true;
    } catch (error) {
      this.app.error(`Database init error: ${error.message}`);
      return false;
    }
  }

  // No saveDatabase() — node:sqlite writes to disk on every run() call automatically

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS log_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voyage_id INTEGER,
        timestamp INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        log_text TEXT,
        email_sent BOOLEAN DEFAULT 0,
        is_auto_track BOOLEAN DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS log_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id INTEGER NOT NULL,
        data_path TEXT NOT NULL,
        data_label TEXT,
        data_value TEXT,
        data_unit TEXT,
        FOREIGN KEY (log_id) REFERENCES log_entries(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS distance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id INTEGER NOT NULL,
        distance_since_last REAL,
        total_distance REAL,
        FOREIGN KEY (log_id) REFERENCES log_entries(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voyage_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voyage_name TEXT,
        start_timestamp INTEGER NOT NULL,
        end_timestamp INTEGER,
        is_active BOOLEAN DEFAULT 1
      )
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_log_timestamp ON log_entries(timestamp)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_log_date ON log_entries(date_str)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_voyage_active ON voyage_info(is_active)`);
  }

  // Create a new log entry
  createLogEntry(data) {
    try {
      const voyage = this.getActiveVoyage();
      const voyageId = voyage ? voyage.id : null;

      const result = this.db.prepare(`
        INSERT INTO log_entries (voyage_id, timestamp, date_str, latitude, longitude, log_text, email_sent, is_auto_track)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        voyageId,
        data.timestamp,
        data.dateStr,
        data.latitude || null,
        data.longitude || null,
        data.logText || null,
        data.emailSent ? 1 : 0,
        data.isAutoTrack ? 1 : 0
      );

      return result.lastInsertRowid;
    } catch (error) {
      this.app.error(`createLogEntry error: ${error.message}`);
      throw error;
    }
  }

  // Add data point to a log entry
  addLogData(logId, dataPath, label, value, unit) {
    this.db.prepare(`
      INSERT INTO log_data (log_id, data_path, data_label, data_value, data_unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(logId, dataPath, label, value || null, unit || null);
  }

  // Add distance info to a log entry
  addDistanceData(logId, distanceSinceLast, totalDistance) {
    this.db.prepare(`
      INSERT INTO distance_log (log_id, distance_since_last, total_distance)
      VALUES (?, ?, ?)
    `).run(logId, distanceSinceLast, totalDistance);
  }

  // Get all log entries
  getAllLogs() {
    return this.db.prepare(`
      SELECT * FROM log_entries ORDER BY timestamp DESC
    `).all();
  }

  // Get log entry for a specific date
  getLogByDate(dateStr) {
    const log = this.db.prepare(`
      SELECT * FROM log_entries
      WHERE date_str = ?
      ORDER BY is_auto_track ASC, timestamp DESC
      LIMIT 1
    `).get(dateStr);

    if (!log) return null;

    log.data = this.db.prepare(`
      SELECT * FROM log_data WHERE log_id = ?
    `).all(log.id);

    const dist = this.db.prepare(`
      SELECT * FROM distance_log WHERE log_id = ?
    `).get(log.id);

    if (dist) {
      log.distance = {
        distance_since_last: dist.distance_since_last,
        total_distance: dist.total_distance
      };
    }

    return log;
  }

  // Get all unique dates that have logs
  getAllLogDates() {
    return this.db.prepare(`
      SELECT DISTINCT date_str,
             MIN(is_auto_track) as has_noon_report,
             COUNT(*) as entry_count
      FROM log_entries
      GROUP BY date_str
      ORDER BY date_str DESC
    `).all();
  }

  // Get log by ID with all associated data
  getLogById(logId) {
    const log = this.db.prepare('SELECT * FROM log_entries WHERE id = ?').get(logId);
    if (!log) return null;

    const data = this.db.prepare('SELECT * FROM log_data WHERE log_id = ?').all(logId);
    const dist = this.db.prepare('SELECT * FROM distance_log WHERE log_id = ?').get(logId);

    return {
      ...log,
      data,
      distance: dist || null
    };
  }

  // Get the last noon report entry (not auto-tracked positions)
  getLastLog() {
    return this.db.prepare(`
      SELECT * FROM log_entries WHERE is_auto_track = 0 ORDER BY timestamp DESC LIMIT 1
    `).get() || null;
  }

  // Get logs within a date range
  getLogsByDateRange(startDate, endDate) {
    return this.db.prepare(`
      SELECT * FROM log_entries
      WHERE date_str >= ? AND date_str <= ?
      ORDER BY timestamp ASC
    `).all(startDate, endDate);
  }

  // Update email sent status
  markEmailSent(logId) {
    this.db.prepare(`UPDATE log_entries SET email_sent = 1 WHERE id = ?`).run(logId);
  }

  // Voyage management
  startNewVoyage(name = null) {
    const voyageName = name || `Voyage ${new Date().toISOString().split('T')[0]}`;
    const timestamp = Math.floor(Date.now() / 1000);

    this.db.prepare(`
      UPDATE voyage_info SET is_active = 0, end_timestamp = ? WHERE is_active = 1
    `).run(timestamp);

    const result = this.db.prepare(`
      INSERT INTO voyage_info (voyage_name, start_timestamp, is_active) VALUES (?, ?, 1)
    `).run(voyageName, timestamp);

    const newId = result.lastInsertRowid;
    this.app.debug(`New voyage started — ID: ${newId}, name: "${voyageName}"`);
    return newId;
  }

  // Get active voyage
  getActiveVoyage() {
    return this.db.prepare(`SELECT * FROM voyage_info WHERE is_active = 1 LIMIT 1`).get() || null;
  }

  // Get total distance for active voyage calculated from position track
  getVoyageDistance() {
    const voyage = this.getActiveVoyage();
    if (!voyage) return 0;
    return this.getDistanceSinceTimestamp(voyage.id, voyage.start_timestamp);
  }

  /**
   * Calculate distance sailed since a given timestamp using position track.
   * Sums haversine distance between consecutive auto-tracked positions.
   */
  getDistanceSinceTimestamp(voyageId, sinceTimestamp) {
    const points = this.db.prepare(`
      SELECT latitude, longitude FROM log_entries
      WHERE is_auto_track = 1
        AND voyage_id = ?
        AND timestamp >= ?
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY timestamp ASC
    `).all(voyageId, sinceTimestamp);

    if (points.length < 2) return 0;

    const R = 3440.065;
    let total = 0;

    for (let i = 1; i < points.length; i++) {
      const { latitude: lat1, longitude: lon1 } = points[i - 1];
      const { latitude: lat2, longitude: lon2 } = points[i];
      if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) continue;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
      total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    return Math.round(total * 10) / 10;
  }

  // Get current active voyage info
  getCurrentVoyage() {
    const row = this.db.prepare(`
      SELECT id, voyage_name, start_timestamp FROM voyage_info WHERE is_active = 1
    `).get();

    if (!row) {
      return { id: null, name: 'Unnamed Voyage', startTimestamp: null };
    }

    return {
      id: row.id,
      name: row.voyage_name || 'Unnamed Voyage',
      startTimestamp: row.start_timestamp
    };
  }

  // Get all voyages with stats
  getAllVoyages() {
    const voyages = this.db.prepare(`
      SELECT
        v.id,
        v.voyage_name,
        v.start_timestamp,
        v.is_active,
        COUNT(DISTINCT CASE WHEN le.is_auto_track = 0 THEN le.id END) as log_count,
        MAX(le.timestamp) as last_entry_timestamp
      FROM voyage_info v
      LEFT JOIN log_entries le ON le.voyage_id = v.id
      GROUP BY v.id
      ORDER BY v.start_timestamp DESC
    `).all();

    return voyages.map(voyage => ({
      id: voyage.id,
      name: voyage.voyage_name || 'Unnamed Voyage',
      startTimestamp: voyage.start_timestamp,
      isActive: voyage.is_active === 1,
      logCount: voyage.log_count || 0,
      lastEntryTimestamp: voyage.last_entry_timestamp,
      totalDistance: this.getDistanceSinceTimestamp(voyage.id, voyage.start_timestamp)
    }));
  }

  // Get logs for a specific voyage
  getLogsByVoyage(voyageId) {
    const voyageRow = this.db.prepare(`
      SELECT start_timestamp, is_active FROM voyage_info WHERE id = ?
    `).get(voyageId);

    if (!voyageRow) return [];

    const { start_timestamp: startTimestamp, is_active: isActive } = voyageRow;

    let endTimestamp = null;
    if (!isActive) {
      const next = this.db.prepare(`
        SELECT start_timestamp FROM voyage_info WHERE id > ? ORDER BY id LIMIT 1
      `).get(voyageId);
      if (next) endTimestamp = next.start_timestamp;
    }

    let logs;
    if (endTimestamp) {
      logs = this.db.prepare(`
        SELECT * FROM log_entries WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp DESC
      `).all(startTimestamp, endTimestamp);
    } else {
      logs = this.db.prepare(`
        SELECT * FROM log_entries WHERE timestamp >= ? ORDER BY timestamp DESC
      `).all(startTimestamp);
    }

    return logs.map(log => this.getLogById(log.id));
  }

  // Delete voyage and all associated logs
  deleteVoyage(voyageId) {
    // Single query for IDs only — avoids hydrating thousands of log objects
    const logIds = this.db.prepare(`
      SELECT id FROM log_entries WHERE voyage_id = ?
    `).all(voyageId).map(row => row.id);

    const deleteDistance = this.db.prepare(`DELETE FROM distance_log WHERE log_id = ?`);
    const deleteLogData  = this.db.prepare(`DELETE FROM log_data WHERE log_id = ?`);
    const deleteEntry    = this.db.prepare(`DELETE FROM log_entries WHERE id = ?`);

    for (const logId of logIds) deleteDistance.run(logId);
    for (const logId of logIds) deleteLogData.run(logId);
    for (const logId of logIds) deleteEntry.run(logId);

    this.db.prepare(`DELETE FROM voyage_info WHERE id = ?`).run(voyageId);
    this.app.debug(`Voyage ${voyageId} deleted — removed ${logIds.length} log entries`);

    return { success: true, deletedLogs: logIds.length, voyageId };
  }

  // Rename voyage
  renameVoyage(voyageId, newName) {
    this.db.prepare(`UPDATE voyage_info SET voyage_name = ? WHERE id = ?`).run(newName, voyageId);
    return { success: true, voyageId, newName };
  }

  // Export logs as JSON
  exportLogs(startDate = null, endDate = null) {
    const logs = (startDate && endDate)
      ? this.getLogsByDateRange(startDate, endDate)
      : this.getAllLogs();
    return logs.map(log => this.getLogById(log.id));
  }

  // Get auto-tracked positions for a specific voyage with sensor data
  getPositionsByVoyage(voyageId, limit = 200) {
    const voyageRow = this.db.prepare(
      `SELECT start_timestamp, is_active FROM voyage_info WHERE id = ?`
    ).get(voyageId);

    if (!voyageRow) return [];

    const { start_timestamp: startTimestamp, is_active: isActive } = voyageRow;

    let endTimestamp = null;
    if (!isActive) {
      const next = this.db.prepare(
        `SELECT start_timestamp FROM voyage_info WHERE id > ? ORDER BY id LIMIT 1`
      ).get(voyageId);
      if (next) endTimestamp = next.start_timestamp;
    }

    let positions;
    if (endTimestamp) {
      positions = this.db.prepare(`
        SELECT id, timestamp, latitude, longitude FROM log_entries
        WHERE is_auto_track = 1 AND timestamp >= ? AND timestamp < ?
        ORDER BY timestamp DESC LIMIT ?
      `).all(startTimestamp, endTimestamp, limit);
    } else {
      positions = this.db.prepare(`
        SELECT id, timestamp, latitude, longitude FROM log_entries
        WHERE is_auto_track = 1 AND timestamp >= ?
        ORDER BY timestamp DESC LIMIT ?
      `).all(startTimestamp, limit);
    }

    return positions.map(pos => ({
      ...pos,
      data: this.db.prepare(
        `SELECT data_label, data_value, data_unit FROM log_data WHERE log_id = ?`
      ).all(pos.id)
    }));
  }

  // Get count of auto-tracked positions for current voyage
  getPositionTrackCount() {
    const voyage = this.getActiveVoyage();
    if (!voyage) return 0;

    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM log_entries WHERE voyage_id = ? AND is_auto_track = 1
    `).get(voyage.id);

    return row ? row.count : 0;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = LogStorage;
