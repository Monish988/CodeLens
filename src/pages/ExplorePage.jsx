import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid, RefreshCw, XCircle, Search,
  ChevronDown, ChevronRight, File, Folder,
  Wand2, AlertTriangle, Bookmark, Check
} from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import './ExplorePage.css';
import { apiUrl } from '../api';

// ─── Tree node ───────────────────────────────────────────────────────────────

const FileTreeNode = ({ node, level = 0, onSelectFile, selectedFile }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const paddingLeft = `${level * 14 + 8}px`;

  if (node.type === 'file') {
    const isActive = selectedFile === node.path;
    return (
      <div
        className={`tree-item file ${isActive ? 'active' : ''}`}
        style={{ paddingLeft }}
        onClick={() => onSelectFile(node.path)}
        title={node.path}
      >
        <span className="ti-spacer" />
        <File size={13} className="type-icon" />
        <span className="node-name">{node.name}</span>
      </div>
    );
  }

  return (
    <>
      <div
        className={`tree-item folder ${isExpanded ? 'expanded' : ''}`}
        style={{ paddingLeft }}
        onClick={() => setIsExpanded(!isExpanded)}
        title={node.path || node.name}
      >
        {isExpanded
          ? <ChevronDown size={13} className="expand-icon" />
          : <ChevronRight size={13} className="expand-icon" />}
        <Folder size={13} className="type-icon" />
        <span className="node-name">{node.name}</span>
      </div>
      {isExpanded && node.children && (
        <div className="tree-children">
          {Object.values(node.children)
            .sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'folder' ? -1 : 1;
            })
            .map(child => (
              <FileTreeNode
                key={child.path || child.name}
                node={child}
                level={level + 1}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ))}
        </div>
      )}
    </>
  );
};

// ─── Draggable Splitter ───────────────────────────────────────────────────────

const Splitter = ({ onDrag }) => {
  const isDragging = useRef(false);
  const [active, setActive] = useState(false);

  const onMouseDown = useCallback(e => {
    e.preventDefault();
    isDragging.current = true;
    setActive(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = e => { if (isDragging.current) onDrag(e.movementX); };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onDrag]);

  return (
    <div className={`pane-splitter ${active ? 'active' : ''}`} onMouseDown={onMouseDown}>
      <div className="splitter-handle" />
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TREE_MIN    = 150;
const TREE_MAX    = 700;  // wider so deep paths fit
const OUTLINE_MIN = 150;
const OUTLINE_MAX = 500;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const getLanguage = path => {
  const ext = (path || '').split('.').pop().toLowerCase();
  return {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    css: 'css', json: 'json', md: 'markdown', markdown: 'markdown',
  }[ext] || 'javascript';
};

const getEntityBadge = type => {
  const map = { function: ['F', 'method-badge'], class: ['C', 'class-badge'], variable: ['V', 'type-badge'] };
  const [label, cls] = map[type] || ['?', ''];
  return <span className={`badge ${cls}`}>{label}</span>;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const ExplorePage = () => {
  const navigate = useNavigate();

  const [treeWidth,    setTreeWidth]    = useState(() => clamp(parseInt(localStorage.getItem('cl_treeWidth') || '280', 10), TREE_MIN, TREE_MAX));
  const [outlineWidth, setOutlineWidth] = useState(() => clamp(parseInt(localStorage.getItem('cl_outlineWidth') || '240', 10), OUTLINE_MIN, OUTLINE_MAX));

  const [fileTree,      setFileTree]      = useState(null);
  const [selectedFile,  setSelectedFile]  = useState(null);
  const [fileContent,   setFileContent]   = useState('');
  const [displayContent,setDisplayContent]= useState(''); // formatted or raw
  const [fileEntities,  setFileEntities]  = useState([]);
  const [workspacePath, setWorkspacePath] = useState('');
  const [filterText,    setFilterText]    = useState('');
  const [isIndexing,    setIsIndexing]    = useState(false);
  const [isMinified,    setIsMinified]    = useState(false);
  const [isFormatted,   setIsFormatted]   = useState(false);
  const [isFormatting,  setIsFormatting]  = useState(false);
  const [contexts,      setContexts]      = useState([]);
  const [showContexts,  setShowContexts]  = useState(false);
  const [pinnedStatus,  setPinnedStatus]  = useState({}); // { contextId: boolean }
  const codeRef = useRef(null);

  // ── Persist widths ──────────────────────────────────────────────────────

  useEffect(() => { localStorage.setItem('cl_treeWidth',    String(treeWidth));    }, [treeWidth]);
  useEffect(() => { localStorage.setItem('cl_outlineWidth', String(outlineWidth)); }, [outlineWidth]);

  // ── Syntax highlight ────────────────────────────────────────────────────

  useEffect(() => {
    if (codeRef.current && displayContent) {
      Prism.highlightElement(codeRef.current);
    }
  }, [displayContent, selectedFile]);

  // ── "Open in Editor" from Dependency Graph ──────────────────────────────

  useEffect(() => {
    const targetFile = sessionStorage.getItem('cl_explore_file');
    const targetLine = sessionStorage.getItem('cl_explore_line');
    if (targetFile) {
      sessionStorage.removeItem('cl_explore_file');
      sessionStorage.removeItem('cl_explore_line');
      setTimeout(() => {
        handleSelectFile(targetFile);
        if (targetLine) {
          setTimeout(() => {
            // Scroll editor content to approximate line position
            const editorContent = document.querySelector('.editor-content');
            if (editorContent) {
              const lineHeight = 22; // px per line (approx)
              editorContent.scrollTop = (parseInt(targetLine, 10) - 5) * lineHeight;
            }
          }, 500);
        }
      }, 700);
    }
  }, []); // eslint-disable-line

  // ── Load files scoped to active workspace ───────────────────────────────

  const loadFiles = useCallback(async () => {
    try {
      // Resolve the active workspace from the most-recently indexed one
      const wsRes  = await fetch(apiUrl('/api/workspaces'));
      const wsData = await wsRes.json();
      const activeWs = wsData.workspaces?.[0]?.path || null;

      const url = activeWs
        ? apiUrl(`/api/files?rootPath=${encodeURIComponent(activeWs)}`)
        : apiUrl('/api/files');

      const res  = await fetch(url);
      const data = await res.json();

      const ws = data.workspace || activeWs || '';
      setWorkspacePath(ws);

      if (data.files && data.files.length > 0) {
        const sep    = ws.includes('/') ? '/' : '\\';
        const prefix = ws.endsWith(sep) ? ws : ws + sep;

        const root = { type: 'folder', name: 'root', children: {} };
        data.files.forEach(f => {
          const rel      = f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
          const segments = rel.split(/[/\\]/);
          let cur = root;
          segments.forEach((seg, i) => {
            if (!seg) return;
            if (i === segments.length - 1) {
              cur.children[seg] = { type: 'file', name: seg, path: f.path };
            } else {
              cur.children[seg] = cur.children[seg] || { type: 'folder', name: seg, path: prefix + segments.slice(0, i + 1).join(sep), children: {} };
              cur = cur.children[seg];
            }
          });
        });
        setFileTree(root);
        if (!selectedFile) handleSelectFile(data.files[0].path);
      } else {
        setFileTree(null);
      }
    } catch (err) {

    }
  }, []); // eslint-disable-line

  useEffect(() => { loadFiles(); fetchContexts(); }, [loadFiles]);

  const fetchContexts = async () => {
    try {
      const res = await fetch(apiUrl('/api/contexts'));
      const data = await res.json();
      setContexts(data.contexts || []);
    } catch (err) {

    }
  };

  const handlePinToFile = async (contextId) => {
    try {
      const res = await fetch(apiUrl(`/api/contexts/${contextId}/add-item`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'file',
          file_path: selectedFile,
        })
      });
      if (res.ok) {
        setPinnedStatus(prev => ({ ...prev, [contextId]: true }));
        setTimeout(() => {
          setPinnedStatus(prev => ({ ...prev, [contextId]: false }));
          setShowContexts(false);
        }, 1500);
      }
    } catch (err) {

    }
  };

  // ── Select file ─────────────────────────────────────────────────────────

  const handleSelectFile = async path => {
    setSelectedFile(path);
    setFileContent('');
    setDisplayContent('');
    setFileEntities([]);
    setIsFormatted(false);
    setIsMinified(false);

    try {
      const [contentRes, entityRes] = await Promise.all([
        fetch(apiUrl(`/api/file?path=${encodeURIComponent(path)}`)),
        fetch(apiUrl(`/api/entities?path=${encodeURIComponent(path)}`)),
      ]);
      const [cData, eData] = await Promise.all([contentRes.json(), entityRes.json()]);

      const raw = cData.content || '';
      setFileContent(raw);
      setIsMinified(!!cData.isMinified);

      // Auto-format if minified
      if (cData.isMinified) {
        formatContent(raw, path, true);
      } else {
        setDisplayContent(raw);
      }

      setFileEntities(eData.entities || []);
    } catch (err) {

    }
  };

  // ── Format / prettify ────────────────────────────────────────────────────

  const formatContent = async (raw, path, silent = false) => {
    if (isFormatting) return;
    setIsFormatting(true);
    try {
      const res = await fetch(apiUrl('/api/format'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: raw || fileContent, filePath: path || selectedFile }),
      });
      const data = await res.json();
      if (data.formatted) {
        setDisplayContent(data.formatted);
        setIsFormatted(true);
      }
    } catch (err) {

      if (!silent) alert('Formatting failed – showing raw content.');
      setDisplayContent(raw || fileContent);
    } finally {
      setIsFormatting(false);
    }
  };

  const toggleFormat = () => {
    if (isFormatted) {
      setDisplayContent(fileContent);
      setIsFormatted(false);
    } else {
      formatContent(fileContent, selectedFile);
    }
  };

  // ── Reindex ─────────────────────────────────────────────────────────────

  const handleReindex = async () => {
    if (!workspacePath || isIndexing) return;
    setIsIndexing(true);
    try {
      await fetch(apiUrl('/api/index'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath }),
      });
      setTimeout(() => { loadFiles(); setIsIndexing(false); }, 1500);
    } catch (err) {

      setIsIndexing(false);
    }
  };

  // ── Splitter drag handlers ───────────────────────────────────────────────

  const handleTreeDrag    = useCallback(dx => setTreeWidth(p    => clamp(p + dx, TREE_MIN, TREE_MAX)),    []);
  const handleOutlineDrag = useCallback(dx => setOutlineWidth(p => clamp(p - dx, OUTLINE_MIN, OUTLINE_MAX)), []);

  // ── Filtered tree ────────────────────────────────────────────────────────

  const filteredTree = fileTree && filterText.trim()
    ? (() => {
        const search   = filterText.toLowerCase();
        const filtered = { ...fileTree, children: {} };
        const walk     = (node, parent) => {
          if (node.type === 'file') {
            if (node.name.toLowerCase().includes(search)) parent.children[node.name] = node;
            return;
          }
          const folder = { ...node, children: {} };
          Object.values(node.children).forEach(c => walk(c, folder));
          if (Object.keys(folder.children).length) parent.children[node.name] = folder;
        };
        Object.values(fileTree.children).forEach(c => walk(c, filtered));
        return filtered;
      })()
    : fileTree;

  // ── Render ───────────────────────────────────────────────────────────────

  const displayName = workspacePath
    ? workspacePath.split(/[/\\]/).filter(Boolean).pop()
    : 'No Workspace';

  const lang = selectedFile ? getLanguage(selectedFile) : 'javascript';

  return (
    <div className="explore-container">

      {/* ── Top bar ── */}
      <div className="explore-topbar">
        <div className="workspace-path">
          <LayoutGrid size={15} />
          <span className="bold" title={workspacePath}>{displayName}</span>
        </div>
        <div className="explore-actions">
          <button
            className={`action-btn ${isIndexing ? 'loading' : ''}`}
            onClick={handleReindex}
            disabled={isIndexing}
          >
            <RefreshCw size={13} className={isIndexing ? 'spin' : ''} />
            {isIndexing ? 'Indexing…' : 'Reindex'}
          </button>
          <button className="action-btn" onClick={() => alert('Exclude paths: re-index with updated .codelensignore file')}>
            <XCircle size={13} /> Exclude Paths
          </button>
          <button className="primary-search-btn" onClick={() => navigate('/dashboard')}>
            <Search size={13} /> Search Workspace
          </button>
        </div>
      </div>

      <div className="explore-content">

        {/* ── File Tree ── */}
        <div className="tree-pane" style={{ width: treeWidth, minWidth: TREE_MIN, maxWidth: TREE_MAX }}>
          <div className="tree-search">
            <input
              type="text"
              placeholder="Filter files…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
            {filterText && <button className="clear-filter" onClick={() => setFilterText('')}>✕</button>}
          </div>
          <div className="file-tree">
            {filteredTree
              ? Object.values(filteredTree.children)
                  .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)
                  .map(node => (
                    <FileTreeNode
                      key={node.path || node.name}
                      node={node}
                      onSelectFile={handleSelectFile}
                      selectedFile={selectedFile}
                    />
                  ))
              : <div className="tree-empty">
                  {fileTree === null ? 'No workspace indexed.' : 'Loading…'}
                </div>
            }
          </div>
        </div>

        <Splitter onDrag={handleTreeDrag} />

        {/* ── Editor ── */}
        <div className="editor-pane">
          {selectedFile ? (
            <>
              <div className="editor-header">
                {/* Breadcrumb */}
                <div className="editor-breadcrumb">
                  {selectedFile.replace(workspacePath, '').split(/[/\\]/).filter(Boolean).map((seg, i, arr) => (
                    <span key={i} className={i === arr.length - 1 ? 'crumb active' : 'crumb'}>
                      {i > 0 && <span className="sep">/</span>}
                      {seg}
                    </span>
                  ))}
                </div>

                <div className="editor-header-actions">
                  {/* Minified warning */}
                  {isMinified && !isFormatted && (
                    <span className="minified-badge" title="File appears minified">
                      <AlertTriangle size={11} /> Minified
                    </span>
                  )}

                  {/* Format toggle */}
                  {(isMinified || fileContent) && (
                    <button
                      className={`format-btn ${isFormatted ? 'active' : ''}`}
                      onClick={toggleFormat}
                      disabled={isFormatting}
                      title={isFormatted ? 'Show raw' : 'Format / pretty-print'}
                    >
                      <Wand2 size={12} />
                      {isFormatting ? 'Formatting…' : isFormatted ? 'Raw' : 'Format'}
                    </button>
                  )}

                  {/* Pin to Context */}
                  <div className="context-pin-wrapper">
                    <button 
                      className={`format-btn ${showContexts ? 'active' : ''}`}
                      onClick={() => setShowContexts(!showContexts)}
                      title="Add to Context"
                    >
                      <Bookmark size={12} />
                      Context
                    </button>
                    
                    {showContexts && (
                      <div className="context-dropdown">
                        <div className="dropdown-header">Pin to Context</div>
                        {contexts.length === 0 ? (
                          <div className="dropdown-item empty">No contexts saved.</div>
                        ) : (
                          contexts.map(c => (
                            <div 
                              key={c.id} 
                              className="dropdown-item"
                              onClick={() => handlePinToFile(c.id)}
                            >
                              <span>{c.name}</span>
                              {pinnedStatus[c.id] && <Check size={12} color="var(--accent-green)" />}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <span className="lang-badge">{lang.toUpperCase()}</span>
                </div>
              </div>

              <div className="editor-content">
                <pre className="code-pre">
                  <code ref={codeRef} className={`language-${lang}`}>
                    {displayContent}
                  </code>
                </pre>
              </div>
            </>
          ) : (
            <div className="editor-empty">
              <File size={38} opacity={0.15} />
              <p>Select a file from the tree to view its contents</p>
            </div>
          )}
        </div>

        <Splitter onDrag={handleOutlineDrag} />

        {/* ── Outline ── */}
        <div className="outline-pane" style={{ width: outlineWidth, minWidth: OUTLINE_MIN, maxWidth: OUTLINE_MAX }}>
          <div className="outline-header">OUTLINE</div>
          <div className="outline-content">
            {fileEntities.length > 0
              ? fileEntities.map((entity, idx) => (
                  <div key={idx} className={`outline-item ${entity.type}`}>
                    {getEntityBadge(entity.type)}
                    <span className="item-name" title={entity.name}>{entity.name}</span>
                    {entity.start_line && <span className="item-line">:{entity.start_line}</span>}
                  </div>
                ))
              : <div className="outline-empty">No symbols found.</div>
            }
          </div>
        </div>

      </div>
    </div>
  );
};

export default ExplorePage;
