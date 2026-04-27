import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class DBConnection {
  private db: Database.Database;

  constructor(dbPath: string = path.join(process.cwd(), 'codelens.db')) {
    // Ensure the directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath, {
      // verbose: console.log
    });

    this.initSchema();
  }

  private initSchema() {
    // Enable Write-Ahead Logging for better concurrent performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('foreign_keys = ON');

    // Run schema creation within a transaction
    const executeSchema = this.db.transaction(() => {
      // Metadata Table (Single Source of Truth)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL,
            hash TEXT NOT NULL,
            last_modified INTEGER NOT NULL
        );
      `);

      // Workspaces Table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL,
            last_indexed INTEGER NOT NULL
        );
      `);

      // Structural Entities (Functions, Classes, Variables)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            type TEXT NOT NULL, -- 'function', 'class', 'variable', 'comment'
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            start_line INTEGER,
            end_line INTEGER,
            complexity INTEGER DEFAULT 1,
            calls TEXT, -- JSON array of called function names
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        );
      `);

      // Create an index to quickly lookup entities by file
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_entities_file_id ON entities(file_id);
      `);

      // Relationships between entities (for Blast Radius and Stale Code)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL,
            target_id INTEGER NOT NULL,
            type TEXT NOT NULL, -- 'calls', 'imports', etc.
            FOREIGN KEY(source_id) REFERENCES entities(id) ON DELETE CASCADE,
            FOREIGN KEY(target_id) REFERENCES entities(id) ON DELETE CASCADE,
            UNIQUE(source_id, target_id, type)
        );
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
      `);
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);
      `);

      // FTS5 Virtual Table for Sub-100ms Search
      // Using unicode61 with tokenchars '_' allows camelCase/snake_case tokenization
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
            name,       -- Entity Name (e.g., calculateRevenue)
            content,    -- Full entity text
            type UNINDEXED,
            file_id UNINDEXED,
            tokenize="unicode61 tokenchars '_'"
        );
      `);

      // AI Explanation Cache
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ai_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id INTEGER NOT NULL,
            file_hash TEXT NOT NULL,
            summary_text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(entity_id, file_hash),
            FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
        );
      `);

      // Saved Contexts (Project/Task Buckets)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS contexts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            notes TEXT,
            tags TEXT, -- JSON array of strings
            association TEXT,
            depth TEXT,
            created_at INTEGER NOT NULL
        );
      `);

      // Handle migrations for existing DBs
      try { this.db.exec("ALTER TABLE contexts ADD COLUMN association TEXT;"); } catch (e) {}
      try { this.db.exec("ALTER TABLE contexts ADD COLUMN depth TEXT;"); } catch (e) {}
      try { this.db.exec("ALTER TABLE entities ADD COLUMN complexity INTEGER DEFAULT 1;"); } catch (e) {}
      try { this.db.exec("ALTER TABLE entities ADD COLUMN calls TEXT;"); } catch (e) {}

      // Items linked to contexts (Files or Snippets)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS context_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            context_id INTEGER NOT NULL,
            type TEXT NOT NULL, -- 'file' or 'snippet'
            file_path TEXT NOT NULL,
            code_content TEXT, -- Store snippet content if type='snippet'
            created_at INTEGER NOT NULL,
            FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
        );
      `);

      // Orphan Review State (Keep / Flag / Unreviewed)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS orphan_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id INTEGER NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'unreviewed', -- 'unreviewed', 'kept', 'flagged'
            reviewed_at INTEGER,
            FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
        );
      `);

      // Churn Data — cached git log dates per file
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS churn_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL UNIQUE,
            dates TEXT NOT NULL, -- JSON array of ISO date strings
            total_commits INTEGER DEFAULT 0,
            last_scanned INTEGER NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        );
      `);

      // Health Snapshots — periodic scores for sparkline trending
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS health_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_date TEXT NOT NULL,
            complexity_score REAL NOT NULL,
            churn_score REAL NOT NULL,
            orphan_score REAL NOT NULL,
            total_score REAL NOT NULL,
            created_at INTEGER NOT NULL
        );
      `);
    });

    executeSchema();
  }

  public getDb(): Database.Database {
    return this.db;
  }

  public close() {
    this.db.close();
  }
}
