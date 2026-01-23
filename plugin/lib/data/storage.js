const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class LogStorage {
  constructor(app) {
    this.app = app;
    const dataDir = app.getDataDirPath();
    this.dbPath = path.join(dataDir, 'noon-log.db');
    this.db = null;
    this.SQL = null;
  }

  async init() {
    try {
      // Initialize sql.js
      this.SQL = await initSqlJs();
      
      // Load existing database or create new one
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
        this.app.debug('Loaded existing noon log database');
      } else {
        this.db = new this.SQL.Database();
        this.app.debug('Created new noon log database');
      }
      
      // Check if table has new columns - if not, recreate
      const tableInfo = this.db.exec("PRAGMA table_info(log_entries)");
      if (tableInfo.length > 0) {
        const columns = tableInfo[0].values.map(row => row[1]);
        const hasVoyageId = columns.includes('voyage_id');
        const hasIsAutoTrack = columns.includes('is_auto_track');
        
        if (!hasVoyageId || !hasIsAutoTrack) {
          // Drop and recreate tables with new schema
          this.app.debug('Outdated schema detected, recreating tables...');
          this.db.run('DROP TABLE IF EXISTS log_entries');
          this.db.run('DROP TABLE IF EXISTS log_data');
          this.db.run('DROP TABLE IF EXISTS distance_log');
        }
      }
      
      this.createTables();
      this.saveDatabase();
      this.app.debug('Noon log database initialized');
      return true;
    } catch (error) {
      this.app.error('Failed to initialize database:', error);
      return false;
    }
  }

  // Save database to disk
  saveDatabase() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      this.app.error('Failed to save database:', error);
    }
  }

  createTables() {
    // Main log entries table
    this.db.run(`
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

    // Weather/environmental data table
    this.db.run(`
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

    // Distance tracking table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS distance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id INTEGER NOT NULL,
        distance_since_last REAL,
        total_distance REAL,
        FOREIGN KEY (log_id) REFERENCES log_entries(id) ON DELETE CASCADE
      )
    `);

    // Voyage tracking (for trip resets)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS voyage_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voyage_name TEXT,
        start_timestamp INTEGER NOT NULL,
        end_timestamp INTEGER,
        is_active BOOLEAN DEFAULT 1
      )
    `);

    // Create indexes
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_log_timestamp ON log_entries(timestamp)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_log_date ON log_entries(date_str)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_voyage_active ON voyage_info(is_active)
    `);
  }

  // Create a new log entry
  createLogEntry(data) {
    // Get current active voyage
    const voyage = this.getActiveVoyage();
    const voyageId = voyage ? voyage.id : null;

    const stmt = this.db.prepare(`
      INSERT INTO log_entries (voyage_id, timestamp, date_str, latitude, longitude, log_text, email_sent, is_auto_track)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      voyageId,
      data.timestamp,
      data.dateStr,
      data.latitude || null,
      data.longitude || null,
      data.logText || null,
      data.emailSent ? 1 : 0,
      data.isAutoTrack ? 1 : 0
    ]);
    
    stmt.free();

    // Get last insert ID
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    const logId = result[0].values[0][0];
    
    this.saveDatabase();
    return logId;
  }

  // Add data point to a log entry
  addLogData(logId, dataPath, label, value, unit) {
    const stmt = this.db.prepare(`
      INSERT INTO log_data (log_id, data_path, data_label, data_value, data_unit)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run([logId, dataPath, label, value || null, unit || null]);
    stmt.free();
    this.saveDatabase();
  }

  // Add distance info to a log entry
  addDistanceData(logId, distanceSinceLast, totalDistance) {
    const stmt = this.db.prepare(`
      INSERT INTO distance_log (log_id, distance_since_last, total_distance)
      VALUES (?, ?, ?)
    `);

    stmt.run([logId, distanceSinceLast, totalDistance]);
    stmt.free();
    this.saveDatabase();
  }

  // Get all log entries
  getAllLogs() {
    const result = this.db.exec(`
      SELECT * FROM log_entries ORDER BY timestamp DESC
    `);
    
    if (result.length === 0) return [];
    
    return this.resultToObjects(result[0]);
  }

  /**
   * Get log entry for a specific date
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Object|null} Log entry with associated data, or null if not found
   */
  getLogByDate(dateStr) {
    
    // First, get the main log entry
    // Prefer noon reports (is_auto_track = 0) over auto-track positions
    const logResult = this.db.exec(`
      SELECT * FROM log_entries 
      WHERE date_str = ? 
      ORDER BY is_auto_track ASC, timestamp DESC
      LIMIT 1
    `, [dateStr]);
    
    
    if (logResult.length === 0 || logResult[0].values.length === 0) {
      return null;
    }
    
    const log = this.resultToObjects(logResult[0])[0];
    
    // Get associated environmental data
    const dataResult = this.db.exec(`
      SELECT * FROM log_data WHERE log_id = ?
    `, [log.id]);
    
    if (dataResult.length > 0) {
      log.data = this.resultToObjects(dataResult[0]);
    } else {
      log.data = [];
    }
    
    // Get distance data (check both tables for backward compatibility)
    let distResult = this.db.exec(`
      SELECT * FROM log_distances WHERE log_id = ?
    `, [log.id]);
    
    // Fallback to old table name if new one doesn't exist
    if (distResult.length === 0) {
      distResult = this.db.exec(`
        SELECT * FROM distance_log WHERE log_id = ?
      `, [log.id]);
    }
    
    if (distResult.length > 0 && distResult[0].values.length > 0) {
      const distData = this.resultToObjects(distResult[0])[0];
      log.distance = {
        distance_since_last: distData.distance_since_last,
        total_distance: distData.total_distance
      };
    }
    
    return log;
  }

  /**
   * Get all unique dates that have logs
   * @returns {Array} Array of date strings with log info
   */
  getAllLogDates() {
    
    const result = this.db.exec(`
      SELECT DISTINCT date_str, 
             MIN(is_auto_track) as has_noon_report,
             COUNT(*) as entry_count
      FROM log_entries 
      GROUP BY date_str
      ORDER BY date_str DESC
    `);
    
    
    if (result.length === 0) {
      return [];
    }
    
    const dates = this.resultToObjects(result[0]);
    if (dates.length > 0) {
    }
    
    return dates;
  }
  
  // Helper to convert sql.js results to objects
  resultToObjects(result) {
    const columns = result.columns;
    const values = result.values;
    
    return values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }

  // Get log by ID with all associated data
  getLogById(logId) {
    const logResult = this.db.exec('SELECT * FROM log_entries WHERE id = ?', [logId]);
    
    if (logResult.length === 0 || logResult[0].values.length === 0) return null;
    
    const log = this.resultToObjects(logResult[0])[0];

    const dataResult = this.db.exec('SELECT * FROM log_data WHERE log_id = ?', [logId]);
    const data = dataResult.length > 0 ? this.resultToObjects(dataResult[0]) : [];

    const distResult = this.db.exec('SELECT * FROM distance_log WHERE log_id = ?', [logId]);
    const distance = distResult.length > 0 && distResult[0].values.length > 0 
      ? this.resultToObjects(distResult[0])[0] 
      : null;

    return {
      ...log,
      data,
      distance
    };
  }

  // Get the last log entry
  getLastLog() {
    const result = this.db.exec(`
      SELECT * FROM log_entries ORDER BY timestamp DESC LIMIT 1
    `);
    
    if (result.length === 0 || result[0].values.length === 0) return null;
    
    return this.resultToObjects(result[0])[0];
  }

  // Get logs within a date range
  getLogsByDateRange(startDate, endDate) {
    const result = this.db.exec(`
      SELECT * FROM log_entries 
      WHERE date_str >= ? AND date_str <= ?
      ORDER BY timestamp ASC
    `, [startDate, endDate]);
    
    if (result.length === 0) return [];
    
    return this.resultToObjects(result[0]);
  }

  // Update email sent status
  markEmailSent(logId) {
    const stmt = this.db.prepare(`
      UPDATE log_entries SET email_sent = 1 WHERE id = ?
    `);
    stmt.run([logId]);
    stmt.free();
    this.saveDatabase();
  }

  // Voyage management
  startNewVoyage(name = null) {
    // End any active voyage
    const endStmt = this.db.prepare(`
      UPDATE voyage_info SET is_active = 0, end_timestamp = ?
      WHERE is_active = 1
    `);
    endStmt.run([Math.floor(Date.now() / 1000)]);
    endStmt.free();

    // Start new voyage
    const stmt = this.db.prepare(`
      INSERT INTO voyage_info (voyage_name, start_timestamp, is_active)
      VALUES (?, ?, 1)
    `);

    const timestamp = Math.floor(Date.now() / 1000);
    stmt.run([name || `Voyage ${new Date().toISOString().split('T')[0]}`, timestamp]);
    stmt.free();
    
    this.saveDatabase();
    
    // Get the ID of the newly created voyage
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    return result[0].values[0][0];
  }

  // Get active voyage
  getActiveVoyage() {
    const result = this.db.exec(`
      SELECT * FROM voyage_info WHERE is_active = 1 LIMIT 1
    `);
    
    if (result.length === 0 || result[0].values.length === 0) return null;
    
    return this.resultToObjects(result[0])[0];
  }

  // Get total distance for active voyage
  getVoyageDistance() {
    const result = this.db.exec(`
      SELECT SUM(dl.distance_since_last) as total
      FROM distance_log dl
      JOIN log_entries le ON dl.log_id = le.id
      JOIN voyage_info v ON v.is_active = 1
      WHERE le.timestamp >= v.start_timestamp
    `);
    
    if (result.length === 0 || result[0].values.length === 0) return 0;
    
    return result[0].values[0][0] || 0;
  }

  // Get current active voyage info
  getCurrentVoyage() {
    const result = this.db.exec(`
      SELECT id, voyage_name, start_timestamp
      FROM voyage_info
      WHERE is_active = 1
    `);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { id: null, name: 'Unnamed Voyage', startTimestamp: null };
    }
    
    const row = result[0].values[0];
    return {
      id: row[0],
      name: row[1] || 'Unnamed Voyage',
      startTimestamp: row[2]
    };
  }

  // Get all voyages with stats
  getAllVoyages() {
    const result = this.db.exec(`
      SELECT 
        v.id,
        v.voyage_name,
        v.start_timestamp,
        v.is_active,
        COUNT(DISTINCT le.id) as log_count,
        MAX(le.timestamp) as last_entry_timestamp,
        COALESCE(SUM(dl.distance_since_last), 0) as total_distance
      FROM voyage_info v
      LEFT JOIN log_entries le ON le.timestamp >= v.start_timestamp 
        AND (v.is_active = 1 OR le.timestamp < (
          SELECT start_timestamp FROM voyage_info 
          WHERE id > v.id ORDER BY id LIMIT 1
        ))
      LEFT JOIN distance_log dl ON dl.log_id = le.id
      GROUP BY v.id
      ORDER BY v.start_timestamp DESC
    `);
    
    if (result.length === 0) return [];
    
    return this.resultToObjects(result[0]).map(voyage => ({
      id: voyage.id,
      name: voyage.voyage_name || 'Unnamed Voyage',
      startTimestamp: voyage.start_timestamp,
      isActive: voyage.is_active === 1,
      logCount: voyage.log_count || 0,
      lastEntryTimestamp: voyage.last_entry_timestamp,
      totalDistance: voyage.total_distance || 0
    }));
  }

  // Get logs for a specific voyage
  getLogsByVoyage(voyageId) {
    const result = this.db.exec(`
      SELECT v.start_timestamp, v.is_active
      FROM voyage_info v
      WHERE v.id = ?
    `, [voyageId]);
    
    if (result.length === 0) return [];
    
    const voyage = result[0].values[0];
    const startTimestamp = voyage[0];
    const isActive = voyage[1];
    
    // Get end timestamp (start of next voyage, or null if active)
    let endTimestamp = null;
    if (!isActive) {
      const nextResult = this.db.exec(`
        SELECT start_timestamp 
        FROM voyage_info 
        WHERE id > ? 
        ORDER BY id LIMIT 1
      `, [voyageId]);
      
      if (nextResult.length > 0 && nextResult[0].values.length > 0) {
        endTimestamp = nextResult[0].values[0][0];
      }
    }
    
    // Get logs for this voyage
    let query = `
      SELECT * FROM log_entries 
      WHERE timestamp >= ?
    `;
    const params = [startTimestamp];
    
    if (endTimestamp) {
      query += ` AND timestamp < ?`;
      params.push(endTimestamp);
    }
    
    query += ` ORDER BY timestamp DESC`;
    
    const logsResult = this.db.exec(query, params);
    
    if (logsResult.length === 0) return [];
    
    return this.resultToObjects(logsResult[0]).map(log => this.getLogById(log.id));
  }

  // Delete voyage and all associated logs
  deleteVoyage(voyageId) {
    // Don't allow deleting active voyage
    const voyageCheck = this.db.exec(`SELECT is_active FROM voyage_info WHERE id = ?`, [voyageId]);
    if (voyageCheck.length > 0 && voyageCheck[0].values[0][0] === 1) {
      throw new Error('Cannot delete active voyage');
    }
    
    // Get logs for this voyage
    const logs = this.getLogsByVoyage(voyageId);
    const logIds = logs.map(log => log.id);
    
    // Delete distance data
    for (const logId of logIds) {
      this.db.run(`DELETE FROM distance_log WHERE log_id = ?`, [logId]);
    }
    
    // Delete log data
    for (const logId of logIds) {
      this.db.run(`DELETE FROM log_data WHERE log_id = ?`, [logId]);
    }
    
    // Delete log entries
    for (const logId of logIds) {
      this.db.run(`DELETE FROM log_entries WHERE id = ?`, [logId]);
    }
    
    // Delete voyage
    this.db.run(`DELETE FROM voyage_info WHERE id = ?`, [voyageId]);
    
    this.saveDatabase();
    
    return {
      success: true,
      deletedLogs: logIds.length,
      voyageId: voyageId
    };
  }

  // Rename voyage
  renameVoyage(voyageId, newName) {
    this.db.run(`UPDATE voyage_info SET voyage_name = ? WHERE id = ?`, [newName, voyageId]);
    this.saveDatabase();
    
    return {
      success: true,
      voyageId: voyageId,
      newName: newName
    };
  }

  // Export logs as JSON
  exportLogs(startDate = null, endDate = null) {
    let logs;
    if (startDate && endDate) {
      logs = this.getLogsByDateRange(startDate, endDate);
    } else {
      logs = this.getAllLogs();
    }

    // Get full data for each log
    return logs.map(log => this.getLogById(log.id));
  }

  /**
   * Get count of auto-tracked positions for current voyage
   * @returns {number} Count of position entries
   */
  getPositionTrackCount() {
    const voyage = this.getActiveVoyage();
    if (!voyage) return 0;

    const result = this.db.exec(`
      SELECT COUNT(*) as count
      FROM log_entries
      WHERE voyage_id = ? AND is_auto_track = 1
    `, [voyage.id]);

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    return result[0].values[0][0];
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = LogStorage;