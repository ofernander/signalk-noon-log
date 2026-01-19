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
        timestamp INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        log_text TEXT,
        email_sent BOOLEAN DEFAULT 0,
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
    const stmt = this.db.prepare(`
      INSERT INTO log_entries (timestamp, date_str, latitude, longitude, log_text, email_sent)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      data.timestamp,
      data.dateStr,
      data.latitude || null,
      data.longitude || null,
      data.logText || null,
      data.emailSent ? 1 : 0
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

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = LogStorage;
