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
    
    // FIX #2: Debounced save mechanism
    this.saveTimeout = null;
    this.savePending = false;
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
      this.saveDatabase(); // Initial save is immediate
      this.app.debug('Noon log database initialized');
      return true;
    } catch (error) {
      this.app.error('Failed to initialize database:', error);
      return false;
    }
  }

  // Save database to disk (immediate)
  saveDatabase() {
    try {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this.savePending = false;
    } catch (error) {
      this.app.error('Failed to save database:', error);
    }
  }

  // FIX #2: Debounced save - waits 5 seconds after last change
  debouncedSave() {
    this.savePending = true;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveDatabase();
    }, 5000); // 5 seconds
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
    
    this.debouncedSave(); // FIX #2: Use debounced save
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
    this.debouncedSave(); // FIX #2: Use debounced save
  }

  // Add distance info to a log entry
  addDistanceData(logId, distanceSinceLast, totalDistance) {
    const stmt = this.db.prepare(`
      INSERT INTO distance_log (log_id, distance_since_last, total_distance)
      VALUES (?, ?, ?)
    `);

    stmt.run([logId, distanceSinceLast, totalDistance]);
    stmt.free();
    this.debouncedSave(); // FIX #2: Use debounced save
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

  // FIX #1: Helper method for single result queries (prevents SQL injection)
  getSingleResult(query, params = []) {
    const stmt = this.db.prepare(query);
    if (params.length > 0) {
      stmt.bind(params);
    }
    
    let result = null;
    if (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      result = {};
      columns.forEach((col, idx) => {
        result[col] = values[idx];
      });
    }
    stmt.free();
    return result;
  }

  // Get log by ID with all associated data - FIX #1: Safe parameter binding
  getLogById(logId) {
    const log = this.getSingleResult('SELECT * FROM log_entries WHERE id = ?', [logId]);
    
    if (!log) return null;

    // Get associated data
    const dataStmt = this.db.prepare('SELECT * FROM log_data WHERE log_id = ?');
    dataStmt.bind([logId]);
    const data = [];
    while (dataStmt.step()) {
      const columns = dataStmt.getColumnNames();
      const values = dataStmt.get();
      const row = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx];
      });
      data.push(row);
    }
    dataStmt.free();

    // Get distance data
    const distance = this.getSingleResult('SELECT * FROM distance_log WHERE log_id = ?', [logId]);

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

  // Get logs within a date range - FIX #1: Safe parameter binding
  getLogsByDateRange(startDate, endDate) {
    const stmt = this.db.prepare(`
      SELECT * FROM log_entries 
      WHERE date_str >= ? AND date_str <= ?
      ORDER BY timestamp ASC
    `);
    stmt.bind([startDate, endDate]);
    
    const logs = [];
    while (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      const row = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx];
      });
      logs.push(row);
    }
    stmt.free();
    
    return logs;
  }

  // Update email sent status
  markEmailSent(logId) {
    const stmt = this.db.prepare(`
      UPDATE log_entries SET email_sent = 1 WHERE id = ?
    `);
    stmt.run([logId]);
    stmt.free();
    this.debouncedSave(); // FIX #2: Use debounced save
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
    
    this.saveDatabase(); // Immediate save for voyage changes
    
    // Get the ID of the newly created voyage
    const result = this.db.exec('SELECT last_insert_rowid() as id');
    return result[0].values[0][0];
  }

  // Get active voyage
  getActiveVoyage() {
    return this.getSingleResult('SELECT * FROM voyage_info WHERE is_active = 1 LIMIT 1');
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

  // FIX #7: Consolidate redundant methods - getCurrentVoyage now uses getActiveVoyage
  getCurrentVoyage() {
    const active = this.getActiveVoyage();
    if (!active) {
      return { name: 'Unnamed Voyage', startTimestamp: null };
    }
    return {
      name: active.voyage_name || 'Unnamed Voyage',
      startTimestamp: active.start_timestamp
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

  // Get logs for a specific voyage - FIX #1: Safe parameter binding
  getLogsByVoyage(voyageId) {
    const voyageInfo = this.getSingleResult(
      'SELECT start_timestamp, is_active FROM voyage_info WHERE id = ?',
      [voyageId]
    );
    
    if (!voyageInfo) return [];
    
    const startTimestamp = voyageInfo.start_timestamp;
    const isActive = voyageInfo.is_active;
    
    // Get end timestamp (start of next voyage, or null if active)
    let endTimestamp = null;
    if (!isActive) {
      const nextVoyage = this.getSingleResult(
        'SELECT start_timestamp FROM voyage_info WHERE id > ? ORDER BY id LIMIT 1',
        [voyageId]
      );
      
      if (nextVoyage) {
        endTimestamp = nextVoyage.start_timestamp;
      }
    }
    
    // Get logs for this voyage
    let query = 'SELECT * FROM log_entries WHERE timestamp >= ?';
    const params = [startTimestamp];
    
    if (endTimestamp) {
      query += ' AND timestamp < ?';
      params.push(endTimestamp);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    
    const logs = [];
    while (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      const row = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx];
      });
      logs.push(this.getLogById(row.id));
    }
    stmt.free();
    
    return logs;
  }

  // FIX #4: Delete voyage with optimized batch queries
  deleteVoyage(voyageId) {
    // Don't allow deleting active voyage
    const voyage = this.getSingleResult('SELECT is_active FROM voyage_info WHERE id = ?', [voyageId]);
    if (voyage && voyage.is_active === 1) {
      throw new Error('Cannot delete active voyage');
    }
    
    // Get logs for this voyage
    const logs = this.getLogsByVoyage(voyageId);
    const logIds = logs.map(log => log.id);
    
    if (logIds.length > 0) {
      // FIX #4: Use batch delete with IN clause instead of loops
      const placeholders = logIds.map(() => '?').join(',');
      
      this.db.run(`DELETE FROM distance_log WHERE log_id IN (${placeholders})`, logIds);
      this.db.run(`DELETE FROM log_data WHERE log_id IN (${placeholders})`, logIds);
      this.db.run(`DELETE FROM log_entries WHERE id IN (${placeholders})`, logIds);
    }
    
    // Delete voyage
    const stmt = this.db.prepare('DELETE FROM voyage_info WHERE id = ?');
    stmt.run([voyageId]);
    stmt.free();
    
    this.saveDatabase(); // Immediate save for voyage deletion
    
    return {
      success: true,
      deletedLogs: logIds.length,
      voyageId: voyageId
    };
  }

  // Rename voyage - FIX #1: Safe parameter binding
  renameVoyage(voyageId, newName) {
    const stmt = this.db.prepare('UPDATE voyage_info SET voyage_name = ? WHERE id = ?');
    stmt.run([newName, voyageId]);
    stmt.free();
    
    this.debouncedSave(); // FIX #2: Use debounced save
    
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

  close() {
    // FIX #2: Clear any pending save timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    // Save any pending changes before closing
    if (this.savePending) {
      this.saveDatabase();
    }
    
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = LogStorage;