import express from 'express';
import cors from 'cors';
import fs from 'fs';
import dialog from 'node-file-dialog';
import beautify from 'js-beautify';
import dotenv from 'dotenv';
import { Indexer } from './indexer/Indexer';
import { isPathSafe } from './utils/pathSafety';


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const indexer = new Indexer();
let clients: express.Response[] = [];
let currentIndexingStatus = { status: 'idle', totalFiles: 0, processedFiles: 0, path: '' };

const sendToClients = (data: any) => {
  clients.forEach(client => client.write(`data: ${JSON.stringify(data)}\n\n`));
};

// Wire up events
indexer.on('scan_start', ({ totalFiles, path }) => {
  currentIndexingStatus = { ...currentIndexingStatus, status: 'queued', totalFiles, path };
  sendToClients(currentIndexingStatus);
});

indexer.on('file_parsed', ({ path }) => {
  currentIndexingStatus.processedFiles += 1;
  currentIndexingStatus.status = 'indexing';
  sendToClients(currentIndexingStatus);
});

indexer.on('index_complete', ({ path }) => {
  currentIndexingStatus.status = 'ready';
  sendToClients(currentIndexingStatus);
});

// Helper to get all registered workspaces for path validation
const getAllWorkspaces = () => {
  try {
    const db = (indexer as any).dbConn.getDb();
    const workspaces = db.prepare('SELECT path FROM workspaces').all() as any[];
    return workspaces.map(ws => ws.path);
  } catch {
    return [];
  }
};

// Start indexing
app.post('/api/index', async (req, res) => {
  const { path: workspacePath } = req.body;
  if (!workspacePath) {
    return res.status(400).json({ error: 'Workspace path is required' });
  }

  if (currentIndexingStatus.status === 'indexing' || currentIndexingStatus.status === 'queued') {
    return res.status(400).json({ error: 'Already indexing' });
  }

  currentIndexingStatus = { status: 'idle', totalFiles: 0, processedFiles: 0, path: workspacePath };

  try {
    // Basic validation for indexing: don't index the root or system directories
    if (!fs.existsSync(workspacePath)) {
      return res.status(404).json({ error: 'Directory does not exist.' });
    }
    const resolvedPath = fs.realpathSync(workspacePath);
    const forbidden = ['/', '/etc', '/var', '/usr', '/bin', '/sbin'];
    if (forbidden.includes(resolvedPath) || resolvedPath.startsWith('/proc') || resolvedPath.startsWith('/sys')) {
      return res.status(403).json({ error: 'Indexing this directory is not allowed for security reasons.' });
    }

    res.json({ message: 'Indexing started' });

    await indexer.indexWorkspace(workspacePath);
    // Start watching for changes
    indexer.watch(workspacePath);
  } catch (error) {
    console.error('Indexing failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to index workspace' });
    }
    currentIndexingStatus.status = 'error';
    sendToClients(currentIndexingStatus);
  }
});

// Pick workspace directory
app.post('/api/workspace/pick', async (req, res) => {
  try {
    const config = { type: 'directory' };
    const dir = await dialog(config);
    if (dir && dir.length > 0) {
      res.json({ path: dir[0] });
    } else {
      res.status(400).json({ error: 'No directory selected' });
    }
  } catch (error) {
    console.error('Dialog error:', error);
    res.status(500).json({ error: 'Failed to open dialog' });
  }
});

// Get recent workspaces
app.get('/api/workspaces', (req, res) => {
  try {
    const db = (indexer as any).dbConn.getDb();
    const workspaces = db.prepare('SELECT path, last_indexed FROM workspaces ORDER BY last_indexed DESC LIMIT 5').all();
    res.json({ workspaces });
  } catch (error) {
    console.error('Failed to get workspaces:', error);
    res.status(500).json({ error: 'Failed to retrieve workspaces' });
  }
});

// SSE endpoint for progress
app.get('/api/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);
  res.write(`data: ${JSON.stringify(currentIndexingStatus)}\n\n`);

  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

// Search
app.get('/api/search', (req, res) => {
  const query = req.query.q as string;
  const contextId = req.query.contextId ? parseInt(req.query.contextId as string) : null;
  
  if (!query) {
    return res.json({ results: [] });
  }

  try {
    const db = (indexer as any).dbConn.getDb();

    // If contextId is provided, find the paths associated with it
    let contextPaths: string[] = [];
    if (contextId) {
      const items = db.prepare('SELECT file_path FROM context_items WHERE context_id = ?').all(contextId) as any[];
      contextPaths = items.map(i => i.file_path);
    }

    // FTS5 MATCH query. 
    // If contextPaths exist, we boost them by checking f.path against the list.
    const stmt = db.prepare(`
      SELECT s.name, s.content, s.type, f.path, s.file_id, e.start_line as line
      FROM search_index s
      JOIN files f ON s.file_id = f.id
      LEFT JOIN entities e ON e.file_id = s.file_id AND e.name = s.name AND e.type = s.type
      WHERE search_index MATCH ?
      ORDER BY 
        -- Priority 1: Files in the active context
        CASE WHEN f.path IN (${contextPaths.map(() => '?').join(',') || "''"}) THEN 0 ELSE 1 END,
        -- Priority 2: Entity type ranking
        CASE s.type
          WHEN 'function' THEN 1
          WHEN 'class' THEN 2
          WHEN 'variable' THEN 3
          ELSE 4
        END
      LIMIT 50
    `);

    const results = stmt.all(`"${query}"*`, ...contextPaths);
    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── Saved Contexts Endpoints ─────────────────────────────────────────────

app.get('/api/contexts', (req, res) => {
  try {
    const db = (indexer as any).dbConn.getDb();
    const contexts = db.prepare('SELECT * FROM contexts ORDER BY created_at DESC').all();
    res.json({ contexts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contexts' });
  }
});

app.post('/api/contexts', async (req, res) => {
  const { name, notes, tags, association, depth } = req.body;
  if (!name) return res.status(400).json({ error: 'Context name required' });

  // Simulate Initialization Pipeline (5-10 seconds for surgical)
  const isSurgical = depth === 'SURGICAL';
  const delayMs = isSurgical ? 5000 + Math.floor(Math.random() * 5000) : 500;
  await new Promise(resolve => setTimeout(resolve, delayMs));

  try {
    const db = (indexer as any).dbConn.getDb();
    const result = db.prepare('INSERT INTO contexts (name, notes, tags, association, depth, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, notes || '', JSON.stringify(tags || []), association || null, depth || 'STANDARD', Date.now());
    res.json({ id: result.lastInsertRowid, name, created_at: Date.now() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create context' });
  }
});

app.get('/api/contexts/:id', (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const db = (indexer as any).dbConn.getDb();
    const context = db.prepare('SELECT * FROM contexts WHERE id = ?').get(id) as any;
    if (!context) return res.status(404).json({ error: 'Context not found' });

    const items = db.prepare('SELECT * FROM context_items WHERE context_id = ? ORDER BY created_at ASC').all(id);
    res.json({ ...context, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch context details' });
  }
});

app.post('/api/contexts/:id/add-item', (req, res) => {
  const contextId = parseInt(req.params.id);
  const { type, file_path, code_content } = req.body;

  if (!type || !file_path) return res.status(400).json({ error: 'Type and file_path required' });

  try {
    const db = (indexer as any).dbConn.getDb();
    const result = db.prepare('INSERT INTO context_items (context_id, type, file_path, code_content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(contextId, type, file_path, code_content || null, Date.now());
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add item to context' });
  }
});

app.delete('/api/contexts/:id', (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const db = (indexer as any).dbConn.getDb();
    db.prepare('DELETE FROM contexts WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete context' });
  }
});

// Fetch File Content
app.get('/api/file', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'File path required' });
  }

  try {
    const workspaces = getAllWorkspaces();
    if (!isPathSafe(filePath, workspaces)) {
      return res.status(403).json({ error: 'Access denied: File is outside of indexed workspaces.' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    // Detect minification heuristic: average line length > 500 chars
    const lines = content.split('\n');
    const avgLen = content.length / Math.max(lines.length, 1);
    const isMinified = avgLen > 500 || lines.length <= 3;
    res.json({ content, isMinified });
  } catch (error) {
    console.error('File read error:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// Format / prettify file content on demand
app.post('/api/format', (req, res) => {
  const { content, filePath } = req.body as { content: string; filePath: string };
  if (!content) return res.status(400).json({ error: 'content required' });

  try {
    const ext = (filePath || '').split('.').pop()?.toLowerCase() || 'js';
    const opts = { indent_size: 2, end_with_newline: true, max_preserve_newlines: 2 };
    let formatted: string;

    if (ext === 'css') {
      formatted = beautify.css(content, opts);
    } else if (ext === 'json') {
      try { formatted = JSON.stringify(JSON.parse(content), null, 2); }
      catch { formatted = beautify.js(content, opts); }
    } else {
      formatted = beautify.js(content, opts);
    }

    res.json({ formatted });
  } catch (err) {
    console.error('Format error:', err);
    res.status(500).json({ error: 'Formatting failed' });
  }
});

// Fetch all indexed files, scoped to rootPath workspace
app.get('/api/files', (req, res) => {
  try {
    const db = (indexer as any).dbConn.getDb();
    const q = (req.query.q as string || '').trim();
    let rootPath = (req.query.rootPath as string || '').trim();

    // If no rootPath given, resolve from the most-recently indexed workspace
    if (!rootPath) {
      const ws = db.prepare('SELECT path FROM workspaces ORDER BY last_indexed DESC LIMIT 1').get() as any;
      if (ws) rootPath = ws.path;
    }

    let files: any[];
    if (q) {
      try {
        files = db.prepare(`
          SELECT path, name, language 
          FROM files 
          WHERE path LIKE ? OR name LIKE ?
          LIMIT 20
        `).all(`%${q}%`, `%${q}%`);
      } catch (err) {
        // Fallback in case name or language columns don't exist
        files = db.prepare(`
          SELECT path
          FROM files 
          WHERE path LIKE ?
          LIMIT 20
        `).all(`%${q}%`);
        files = files.map(f => ({
          path: f.path,
          name: f.path.split('/').pop(),
          language: f.path.split('.').pop()
        }));
      }
    } else {
      if (rootPath) {
        const prefix = rootPath.endsWith('/') ? rootPath : rootPath + '/';
        files = db.prepare(
          `SELECT id, path FROM files WHERE path LIKE ? ORDER BY path ASC`
        ).all(prefix + '%');
      } else {
        files = db.prepare('SELECT id, path FROM files ORDER BY path ASC').all();
      }
    }

    res.json({ files, workspace: rootPath || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
});

import path from 'path';

app.post('/api/contexts/summary', async (req, res) => {
  const { files, contextName } = req.body as { files: string[], contextName: string };

  const workspaces = getAllWorkspaces();

  // Read actual file contents (respect workspace boundary via pathSafety.ts)
  const fileContents = files.map(filePath => {
    try {
      if (!isPathSafe(filePath, workspaces)) {
        return `### File: ${filePath}\n(Access denied)`;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const truncated = content.slice(0, 8000);  // cap per file to avoid token overflow
      return `### File: ${filePath}\n\`\`\`\n${truncated}\n\`\`\``;
    } catch {
      return `### File: ${filePath}\n(Could not read file)`;
    }
  }).join('\n\n');

  const prompt = `You are a senior software engineer performing a precise, grounded code review.

STRICT RULES:
- Analyze ONLY what is literally present in the source code provided below.
- NEVER say "I assume", "hypothetically", "I don't have access", or "based on conventions".
- If a file is empty or unreadable, say: "⚠️ Could not read [filename]" and move on.
- Be direct and concise. No filler sentences.

---

CONTEXT NAME: "${contextName}"

${fileContents}

---

Respond in exactly this structure:

## Overview
[2-3 sentences. What does this code actually do, based on what you read.]

## File Breakdown
[For each file:]
**[filename]**
- Purpose: [one line — what this file is responsible for]
- Exports: [list key exported functions/components/classes]
- Dependencies: [list imports that matter — libraries, internal modules]
- Notes: [any real patterns, issues, or things worth flagging in the code]

## Watch Out For
[2-4 bullet points of actual concerns, TODOs, or code smells found in the source. If none, say "No issues found."]`;

  // Stream response from OpenRouter/Gemini
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const apiKey = process.env.OPENROUTER_API_KEY || '';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const readStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            res.write(chunk);
          }
          res.end();
        } catch (e) {
          res.end();
        }
      };
      readStream();
    } else {
      res.end();
    }
  } catch (err) {
    res.end();
  }
});

// Fetch entities for a specific file
app.get('/api/entities', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'File path required' });
  }

  try {
    const db = (indexer as any).dbConn.getDb();
    const file = db.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as any;

    if (!file) {
      return res.status(404).json({ error: 'File not indexed' });
    }

    const entities = db.prepare('SELECT id, type, name, start_line, end_line FROM entities WHERE file_id = ? ORDER BY start_line ASC').all(file.id);
    res.json({ entities });
  } catch (error) {
    console.error('Failed to get entities:', error);
    res.status(500).json({ error: 'Failed to retrieve entities' });
  }
});

// Dependency graph: workspace-scoped, depth-limited
app.get('/api/graph', (req, res) => {

  try {
    const db = (indexer as any).dbConn.getDb();

    // ── Parameters ──────────────────────────────────────────────────────
    const entityTypes = ((req.query.types as string) || 'function,class').split(',').filter(Boolean);
    const depth = Math.min(parseInt((req.query.depth as string) || '2', 10), 5);
    const rootPath = (req.query.rootPath as string || '').trim();
    const relsQuery = (req.query.rels as string || 'import,call,contains');
    const relFilters = relsQuery.split(',');
    
    const showCalls = relFilters.includes('call');
    const showImports = relFilters.includes('import');

    // ── 1. Resolve workspace root ────────────────────────────────────────
    // If no rootPath given, use the most-recently indexed workspace
    let workspaceRoot = rootPath;
    if (!workspaceRoot) {
      const ws = db.prepare('SELECT path FROM workspaces ORDER BY last_indexed DESC LIMIT 1').get() as any;
      if (ws) workspaceRoot = ws.path;
    }

    if (!workspaceRoot) {
      return res.json({ nodes: [], edges: [], workspace: null });
    }

    // Normalise – ensure trailing slash so LIKE works correctly
    const likePrefix = workspaceRoot.endsWith('/') ? workspaceRoot : workspaceRoot + '/';

    // ── 2. Fetch only files within this workspace ────────────────────────
    const files: any[] = db.prepare(
      `SELECT id, path FROM files WHERE path LIKE ? ORDER BY path ASC`
    ).all(likePrefix + '%');

    if (files.length === 0) {
      return res.json({ nodes: [], edges: [], workspace: workspaceRoot });
    }

    const fileIdSet = new Set<number>(files.map((f: any) => f.id));

    // ── 3. Recursive BFS Discovery ───────────────────────────────────────
    const MAX_ENTITIES = 400;
    const nodes: any[] = [];
    const edges: any[] = [];
    const edgeSet = new Set<string>();
    const visitedEntityIds = new Set<number>();
    const fileIdsInGraph = new Set<number>();

    const addEdge = (source: string, target: string, rel: string) => {
      const key = `${source}→${target}→${rel}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ id: key, source, target, data: { rel } });
      }
    };

    // Helper to get entity nodes
    const getEntityNode = (e: any) => ({
      id: `e_${e.id}`,
      type: 'codeNode',
      data: {
        label: e.name,
        kind: e.type,
        fileId: e.file_id,
        path: e.file_path,
        line: e.start_line,
        content: e.content,
        hasMore: false // Will be updated if we find hidden edges
      }
    });

    // 1. Initial Seed: All entities in the workspace files
    const fileIdPlaceholders = files.map(() => '?').join(',');
    const typePlaceholders = entityTypes.map(() => '?').join(',');
    
    let currentLevel: any[] = db.prepare(`
      SELECT e.*, f.path as file_path
      FROM entities e
      JOIN files f ON e.file_id = f.id
      WHERE e.file_id IN (${fileIdPlaceholders})
        AND e.type IN (${typePlaceholders})
    `).all(...files.map(f => f.id), ...entityTypes);

    currentLevel.forEach(e => {
      visitedEntityIds.add(e.id);
      fileIdsInGraph.add(e.file_id);
      nodes.push(getEntityNode(e));
    });

    // 2. BFS Expansion
    for (let hop = 0; hop < depth; hop++) {
      const nextLevel: any[] = [];
      if (nodes.length >= MAX_ENTITIES) break;

      for (const entity of currentLevel) {
        // Resolve Calls
        if (showCalls) {
          let calledNames: string[] = [];
          if (entity.calls) {
            try { calledNames = JSON.parse(entity.calls); } catch (_) { }
          } else {
            const content = entity.content || '';
            const matches = content.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g);
            for (const m of matches) calledNames.push(m[1]);
          }

          for (const name of calledNames) {
            if (name.length < 3) continue;

            // Global Search for this name
            const target = db.prepare(`
              SELECT e.*, f.path as file_path
              FROM entities e
              JOIN files f ON e.file_id = f.id
              WHERE e.name = ? AND e.id != ?
              LIMIT 1
            `).get(name, entity.id) as any;

            if (target) {
              if (!visitedEntityIds.has(target.id)) {
                if (nodes.length < MAX_ENTITIES) {
                  visitedEntityIds.add(target.id);
                  fileIdsInGraph.add(target.file_id);
                  nodes.push(getEntityNode(target));
                  nextLevel.push(target);
                } else {
                  // Mark the source node as having more hidden edges
                  const sourceNode = nodes.find(n => n.id === `e_${entity.id}`);
                  if (sourceNode) sourceNode.data.hasMore = true;
                }
              }
              addEdge(`e_${entity.id}`, `e_${target.id}`, 'call');
            }
          }
        }

        // Resolve Imports (from entity to file)
        if (showImports && entity.content) {
          const matches = entity.content.matchAll(/(?:import|require)\s*(?:\{[^}]*\}|[^'"]*)\s*(?:from\s*)?['"]([^'"]+)['"]/g);
          for (const m of matches) {
            const imp = m[1];
            const targetFile = db.prepare(`
              SELECT id, path FROM files 
              WHERE path LIKE ? AND (path LIKE ? OR path LIKE ? OR path LIKE ? OR path LIKE ?)
              LIMIT 1
            `).get(`%${imp}%`, `%${imp}.ts`, `%${imp}.js`, `%${imp}/index.ts`, `%${imp}/index.js`) as any;

            if (targetFile) {
              fileIdsInGraph.add(targetFile.id);
              addEdge(`e_${entity.id}`, `f_${targetFile.id}`, 'import');
            }
          }
        }
      }
      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }

    // 3. Add necessary file nodes and "contains" edges
    fileIdsInGraph.forEach(fid => {
      const f = files.find(file => file.id === fid) || db.prepare('SELECT id, path FROM files WHERE id = ?').get(fid) as any;
      if (f) {
        const label = f.path.replace(likePrefix, '');
        nodes.push({
          id: `f_${f.id}`,
          type: 'codeNode',
          data: { label, kind: 'file', path: f.path, fileId: f.id }
        });
      }
    });

    if (relFilters.includes('contains')) {
      nodes.filter(n => n.data.kind !== 'file').forEach(en => {
        addEdge(`f_${en.data.fileId}`, en.id, 'contains');
      });
    }

    res.json({ nodes, edges, workspace: workspaceRoot });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build graph' });
  }
});

app.post('/api/ai/explain', async (req, res) => {
  const { content, path, name, hasMore, entityId, type } = req.body;
  const normalizedType = (type || '').toLowerCase();

  const db = (indexer as any).dbConn.getDb();

  try {
    const fallbackExplanation =
      'AI summary is temporarily unavailable. Please retry in a moment.';
    // 1. Resolve entity ID and file hash
    let finalEntityId = entityId;
    if (typeof entityId === 'string' && entityId.startsWith('e_')) {
      finalEntityId = parseInt(entityId.split('_')[1]);
    } else if (typeof entityId === 'number') {
      finalEntityId = entityId;
    }

    if (!normalizedType) {
      console.warn('[AI Entity Check] WARNING: entity_type is undefined or empty. Check Parser.ts traverse() for the node type that produced this entity.');
    }

    // ─── Content-Length Validation ───────────────────────────────────────
    // Gate: if content exists and is longer than 10 chars, proceed — regardless of type.
    // This ensures anonymous functions, arrow-function variables (like timeFilter),
    // and any other functional entity with real code gets summarized.
    const hasValidContent = content && content.trim().length > 10;
    const isSupportedType = ['method', 'function', 'class', 'variable'].includes(normalizedType);

    // Block only if BOTH content is absent/too-short AND type is unsupported.
    if (!finalEntityId || (!hasValidContent && !isSupportedType)) {
      return res.json({
        explanation: "AI summaries are currently optimized for code entities with logic (functions, classes, variables).",
        cached: false
      });
    }

    if (!content || content.trim().length === 0) {
      return res.json({ 
        explanation: "Code snippet too short or not found. Try re-indexing this file.", 
        cached: false 
      });
    }

    const file = db.prepare('SELECT hash FROM files WHERE path = ?').get(path) as any;
    if (!file) return res.status(404).json({ error: 'File not found' });

    // 2. Check cache (Cache-First)
    const cached = db.prepare('SELECT summary_text FROM ai_summaries WHERE entity_id = ? AND file_hash = ?').get(finalEntityId, file.hash) as any;
    if (cached) {
      return res.json({ explanation: cached.summary_text, cached: true });
    }

    // 3. Call OpenRouter (Scenario B: Miss)
    const apiKey = process.env.OPENROUTER_API_KEY || 'sk-or-v1-placeholder';
    const ghostContext = hasMore ? "Note: This function interacts with external modules or deep dependencies not visible in the current view." : "";

    const systemPrompt = `You are an expert software architect. Analyze the code and output a purely technical explanation.
STRICT RULES:
- Output ONLY the technical breakdown.
- DO NOT repeat the code snippet or any part of it in your text.
- DO NOT use any introductory phrases (e.g., "Okay," "Here is," "High-Fidelity Technical Explanation").
- START IMMEDIATELY with the core purpose.
- Be concise but complete. Ensure the thought is finished.`;

    const userPrompt = `Analyze the logic and purpose of "${name}" within "${path}".
${ghostContext}

Code:
\`\`\`
${content}
\`\`\``;

    let aiRes: any;
    try {
      aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "CodeLens AI"
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 500
        })
      });
    } catch (fetchErr) {
      console.error('[AI API Network Error]:', fetchErr);
      return res.json({ explanation: fallbackExplanation, cached: false });
    }

    let data: any = null;
    try {
      data = await aiRes.json();
    } catch (parseErr) {
      console.error('[AI API Parse Error]:', parseErr);
      return res.json({ explanation: fallbackExplanation, cached: false });
    }

    if (!aiRes.ok || data?.error) {
      console.error('[AI API Error]:', data?.error || { status: aiRes.status, statusText: aiRes.statusText });
      return res.json({ explanation: fallbackExplanation, cached: false });
    }

    const explanation = data?.choices?.[0]?.message?.content?.trim();

    if (explanation) {
      // 4. Cache successful response
      db.prepare('INSERT OR REPLACE INTO ai_summaries (entity_id, file_hash, summary_text, created_at) VALUES (?, ?, ?, ?)')
        .run(finalEntityId, file.hash, explanation, Date.now());
      res.json({ explanation, cached: false, hasGhostContext: !!hasMore });
    } else {
      res.json({ explanation: "AI could not generate an explanation for this specific node.", cached: false });
    }
  } catch (err) {
    console.error('AI Explain Error:', err);
    res.json({
      explanation: 'AI summary is temporarily unavailable. Please retry in a moment.',
      cached: false
    });
  }
});

// Clear AI Cache Endpoint
app.post('/api/ai/clear-cache', (req, res) => {
  try {
    const db = (indexer as any).dbConn.getDb();
    db.prepare('DELETE FROM ai_summaries').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Search entities scoped to workspace
app.get('/api/graph/search', (req, res) => {
  const q = (req.query.q as string || '').trim();
  const rootPath = (req.query.rootPath as string || '').trim();
  if (!q) return res.json({ results: [] });
  try {
    const db = (indexer as any).dbConn.getDb();

    let workspaceRoot = rootPath;
    if (!workspaceRoot) {
      const ws = db.prepare('SELECT path FROM workspaces ORDER BY last_indexed DESC LIMIT 1').get() as any;
      if (ws) workspaceRoot = ws.path;
    }

    const likePrefix = workspaceRoot ? (workspaceRoot.endsWith('/') ? workspaceRoot : workspaceRoot + '/') : '%';

    const results = db.prepare(
      `SELECT e.id, e.type, e.name, e.file_id, f.path
       FROM entities e JOIN files f ON e.file_id = f.id
       WHERE e.name LIKE ?
         AND f.path LIKE ?
       LIMIT 20`
    ).all(`%${q}%`, likePrefix + '%');
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});



