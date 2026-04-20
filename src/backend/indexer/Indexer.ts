import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import chokidar from 'chokidar';
import beautify from 'js-beautify';
import { EventEmitter } from 'events';
import { DBConnection } from '../db/connection';
import { ASTParser, ParsedEntity } from './Parser';

export class Indexer extends EventEmitter {
  private dbConn: DBConnection;
  private parser: ASTParser;
  private watcher: chokidar.FSWatcher | null = null;
  private isIndexing = false;

  constructor(dbPath?: string) {
    super();
    this.dbConn = new DBConnection(dbPath);
    this.parser = new ASTParser();
  }

  /**
   * Initializes the workspace indexing process
   */
  public async indexWorkspace(workspacePath: string) {
    if (this.isIndexing) {
      console.warn('Indexing already in progress.');
      return;
    }
    
    this.isIndexing = true;
    console.log(`Starting index for workspace: ${workspacePath}`);
    
    try {
      const files = this.gatherFiles(workspacePath);
      console.log(`Found ${files.length} supported files to index.`);
      
      this.emit('scan_start', { totalFiles: files.length, path: workspacePath });
      
      // Process files in batches to keep RAM < 150MB
      const BATCH_SIZE = 50;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch);
      }
      
      this.emit('index_complete', { path: workspacePath });
      console.log('Initial indexing complete.');
      
      // Update workspaces table
      const db = this.dbConn.getDb();
      db.prepare(`
        INSERT INTO workspaces (path, last_indexed) 
        VALUES (?, ?) 
        ON CONFLICT(path) DO UPDATE SET last_indexed=excluded.last_indexed
      `).run(workspacePath, Date.now());
      
    } catch (err) {
      console.error('Error during indexing:', err);
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Watches the directory for incremental updates
   */
  public watch(workspacePath: string) {
    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = chokidar.watch(workspacePath, {
      ignored: [/(^|[\/\\])\../, /node_modules/, /dist/, /build/],
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', path => this.processFile(path))
      .on('change', path => this.processFile(path))
      .on('unlink', path => this.removeFile(path));

    console.log(`Watching for changes in ${workspacePath}...`);
  }

  /**
   * Recursively gathers supported files
   */
  // Directories to never index (built assets, cache, VCS)
  private static IGNORED_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', 'out',
    'coverage', '.cache', '.turbo', '.parcel-cache', '__pycache__',
    'vendor', '.svn', '.hg',
  ]);

  private gatherFiles(dir: string, fileList: string[] = []): string[] {
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return fileList; }

    for (const file of entries) {
      // Skip hidden files/dirs and known ignored directories at any depth
      if (file.startsWith('.')) continue;
      if (Indexer.IGNORED_DIRS.has(file)) continue;

      const filePath = path.join(dir, file);
      let stat: fs.Stats;
      try { stat = fs.statSync(filePath); } catch { continue; }

      if (stat.isDirectory()) {
        this.gatherFiles(filePath, fileList);
      } else if (this.isSupportedExtension(filePath)) {
        // Extra guard: skip minified files (filename contains .min.)
        if (!path.basename(filePath).includes('.min.')) {
          fileList.push(filePath);
        }
      }
    }
    return fileList;
  }

  private isSupportedExtension(filePath: string): boolean {
    const ext = path.extname(filePath);
    return ['.js', '.jsx', '.ts', '.tsx', '.css', '.json', '.md'].includes(ext);
  }

  private async processBatch(files: string[]) {
    for (const file of files) {
      await this.processFile(file);
      this.emit('file_parsed', { path: file });
    }
  }

  private async processFile(filePath: string) {
    if (!this.isSupportedExtension(filePath)) return;

    try {
      let content = await fs.promises.readFile(filePath, 'utf-8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const stat = await fs.promises.stat(filePath);
      
      const db = this.dbConn.getDb();
      
      // Check if file is already indexed and unchanged
      const existing = db.prepare('SELECT id, hash FROM files WHERE path = ?').get(filePath) as any;
      if (existing && existing.hash === hash) {
        return; // No changes
      }

      // Beautify before parsing if file appears minified
      const lines = content.split('\n');
      const avgLen = content.length / Math.max(lines.length, 1);
      if (avgLen > 500 || lines.length <= 3) {
        try {
          const ext = path.extname(filePath).toLowerCase();
          const opts = { indent_size: 2, end_with_newline: true };
          if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
            content = beautify.js(content, opts);
          } else if (ext === '.css') {
            content = beautify.css(content, opts);
          }
        } catch (bErr) {
          console.warn(`Beautification failed for ${filePath}, parsing raw.`, bErr);
        }
      }

      // Parse file content into structural entities
      const entities = this.parser.parse(filePath, content);
      
      // Execute DB writes in a transaction for maximum performance
      const insertTransaction = db.transaction(() => {
        let fileId: number;

        if (existing) {
          // Update existing file metadata
          db.prepare('UPDATE files SET hash = ?, last_modified = ? WHERE id = ?').run(hash, stat.mtimeMs, existing.id);
          fileId = existing.id;
          
          // Clear old entities & search index entries
          db.prepare('DELETE FROM entities WHERE file_id = ?').run(fileId);
          db.prepare('DELETE FROM search_index WHERE file_id = ?').run(fileId);
        } else {
          // Insert new file
          const result = db.prepare('INSERT INTO files (path, hash, last_modified) VALUES (?, ?, ?)').run(filePath, hash, stat.mtimeMs);
          fileId = result.lastInsertRowid as number;
        }

        // Insert new entities
        const insertEntity = db.prepare('INSERT INTO entities (file_id, type, name, content, start_line, end_line, calls) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const insertFts = db.prepare('INSERT INTO search_index (name, content, type, file_id) VALUES (?, ?, ?, ?)');

        for (const entity of entities) {
          insertEntity.run(
            fileId, 
            entity.type, 
            entity.name, 
            entity.content, 
            entity.start_line, 
            entity.end_line,
            entity.calls ? JSON.stringify(entity.calls) : null
          );
          
          // Comments don't usually need to be ranked as highly as definitions,
          // but we still index their content.
          insertFts.run(entity.name, entity.content, entity.type, fileId.toString());
        }
      });

      insertTransaction();
    } catch (err) {
      console.error(`Failed to index file ${filePath}:`, err);
    }
  }

  private removeFile(filePath: string) {
    try {
      const db = this.dbConn.getDb();
      const removeTransaction = db.transaction(() => {
        const file = db.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as any;
        if (file) {
          // Due to ON DELETE CASCADE, entities are deleted automatically
          db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
          // Manually remove from search_index since FTS5 virtual tables don't support foreign keys
          db.prepare('DELETE FROM search_index WHERE file_id = ?').run(file.id);
        }
      });
      removeTransaction();
    } catch (err) {
      console.error(`Failed to remove file ${filePath} from index:`, err);
    }
  }
}
