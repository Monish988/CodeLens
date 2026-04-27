import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid, RefreshCw, XCircle, Search,
  ChevronDown, ChevronRight, File, Folder,
  Wand2, AlertTriangle, Bookmark, Check, ExternalLink,
  Sparkles, Zap, Info,
  Scissors, Diff, FileEdit, Undo2, Save, X
} from 'lucide-react';
import ReactDiffViewer from 'react-diff-viewer-continued';
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

  const getComplexityColor = (c, isFolder = false) => {
    if (!c || c <= (isFolder ? 5 : 1)) return 'transparent';
    if (isFolder) {
      if (c < 20) return '#4EC9B044';
      if (c < 50) return '#DCDCAA44';
      if (c < 100) return '#CE917844';
      return '#F4474744';
    } else {
      if (c < 10) return '#4EC9B0';
      if (c < 25) return '#DCDCAA';
      if (c < 50) return '#CE9178';
      return '#F44747';
    }
  };

  if (node.type === 'file') {
    const isActive = selectedFile === node.path;
    return (
      <div
        className={`tree-item file ${isActive ? 'active' : ''}`}
        style={{ paddingLeft }}
        onClick={() => onSelectFile(node.path)}
        title={`${node.path} (Complexity: ${node.complexity || 0})`}
      >
        <span className="ti-spacer" />
        <div 
          className="complexity-dot" 
          style={{ 
            width: '6px', 
            height: '6px', 
            borderRadius: '50%', 
            backgroundColor: getComplexityColor(node.complexity),
            marginRight: '8px',
            flexShrink: 0
          }} 
        />
        <File size={13} className="type-icon" />
        <span className="node-name">{node.name}</span>
      </div>
    );
  }

  return (
    <>
      <div
        className={`tree-item folder ${isExpanded ? 'expanded' : ''}`}
        style={{ 
          paddingLeft,
          borderLeft: node.complexity > 20 ? `2px solid ${getComplexityColor(node.complexity, true).replace('44', '')}` : 'none'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
        title={`${node.path || node.name} (Total Complexity: ${node.complexity || 0})`}
      >
        {isExpanded
          ? <ChevronDown size={13} className="expand-icon" />
          : <ChevronRight size={13} className="expand-icon" />}
        <Folder size={13} className="type-icon" />
        <span className="node-name">{node.name}</span>
        {node.complexity > 10 && (
          <span style={{ fontSize: '9px', color: '#666', marginLeft: '6px' }}>{node.complexity}</span>
        )}
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
  const [contextMenu,   setContextMenu]   = useState(null);
  const [activeOutlineTab, setActiveOutlineTab] = useState('symbols'); // 'symbols' | 'docs' | 'impact'
  const [aiDoc, setAiDoc] = useState(null);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [impactData, setImpactData] = useState(null);
  const [isCalculatingImpact, setIsCalculatingImpact] = useState(false);
  const [showRefactorModal, setShowRefactorModal] = useState(false);
  const [refactorPrompt, setRefactorPrompt] = useState('');
  const [refactoringEntity, setRefactoringEntity] = useState(null);
  const [refactoredCode, setRefactoredCode] = useState(null);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const codeRef = useRef(null);

  const handleContextMenu = (e, entity) => {
    e.preventDefault();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      entity
    });
  };

  const closeContextMenu = () => setContextMenu(null);

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
              cur.children[seg] = { type: 'file', name: seg, path: f.path, complexity: f.complexity || 0 };
            } else {
              cur.children[seg] = cur.children[seg] || { type: 'folder', name: seg, path: prefix + segments.slice(0, i + 1).join(sep), children: {}, complexity: 0 };
              cur = cur.children[seg];
            }
            // Aggregate complexity to parent folders
            cur.complexity = (cur.complexity || 0) + (f.complexity || 0);
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
      setAiDoc(null); // Clear old doc when file changes
    } catch (err) {

    }
  };

  const fetchAiDoc = async (entity = null) => {
    setIsGeneratingDoc(true);
    setActiveOutlineTab('docs');
    try {
      const body = entity 
        ? { 
            content: entity.content, 
            path: selectedFile, 
            name: entity.name, 
            type: entity.type, 
            entityId: entity.id 
          }
        : {
            content: displayContent.slice(0, 5000), // Cap for summary
            path: selectedFile,
            name: selectedFile.split('/').pop(),
            type: 'file',
            entityId: -1 // Special ID for whole file
          };

      const res = await fetch(apiUrl('/api/ai/explain'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setAiDoc({
        title: entity ? entity.name : 'File Overview',
        explanation: data.explanation,
        cached: data.cached
      });
    } catch (err) {
      setAiDoc({ title: 'Error', explanation: 'Failed to generate documentation.' });
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const fetchImpact = async (entity) => {
    setIsCalculatingImpact(true);
    setActiveOutlineTab('impact');
    try {
      const res = await fetch(apiUrl(`/api/health/impact?id=${entity.id}`));
      const data = await res.json();
      setImpactData({
        target: entity.name,
        impacted: data.impact || []
      });
    } catch (err) {
      setImpactData({ target: entity.name, impacted: [], error: true });
    } finally {
      setIsCalculatingImpact(false);
    }
  };

  const handleRefactor = async () => {
    if (!refactorPrompt.trim() || isRefactoring) return;
    setIsRefactoring(true);
    try {
      const res = await fetch(apiUrl('/api/ai/refactor'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: refactoringEntity.content,
          path: selectedFile,
          name: refactoringEntity.name,
          prompt: refactorPrompt
        })
      });
      const data = await res.json();
      setRefactoredCode(data.refactored);
    } catch (err) {
      alert('Refactoring failed. Please check your API connection.');
    } finally {
      setIsRefactoring(false);
    }
  };

  const openRefactorModal = (entity) => {
    setRefactoringEntity(entity);
    setRefactorPrompt('');
    setRefactoredCode(null);
    setShowRefactorModal(true);
    closeContextMenu();
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
                  <button 
                    className="format-btn"
                    onClick={() => {
                      window.location.href = `vscode://file/${selectedFile}:1`;
                    }}
                    title="Open in VS Code"
                  >
                    <ExternalLink size={12} />
                    VS Code
                  </button>

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

        {/* ── Outline / Docs ── */}
        <div className="outline-pane" style={{ width: outlineWidth, minWidth: OUTLINE_MIN, maxWidth: OUTLINE_MAX }}>
          <div className="outline-tabs">
            <button 
              className={`outline-tab ${activeOutlineTab === 'symbols' ? 'active' : ''}`}
              onClick={() => setActiveOutlineTab('symbols')}
            >
              SYMBOLS
            </button>
            <button 
              className={`outline-tab ${activeOutlineTab === 'docs' ? 'active' : ''}`}
              onClick={() => setActiveOutlineTab('docs')}
            >
              AI DOCS
            </button>
            <button 
              className={`outline-tab ${activeOutlineTab === 'impact' ? 'active' : ''}`}
              onClick={() => setActiveOutlineTab('impact')}
            >
              IMPACT
            </button>
          </div>
          
          <div className="outline-content">
            {activeOutlineTab === 'symbols' ? (
              fileEntities.length > 0
                ? fileEntities.map((entity, idx) => (
                      <div 
                        key={idx} 
                        className={`outline-item ${entity.type}`} 
                        onContextMenu={(e) => handleContextMenu(e, entity)}
                        onClick={() => {
                          if (activeOutlineTab === 'docs') fetchAiDoc(entity);
                          else if (activeOutlineTab === 'impact') fetchImpact(entity);
                        }}
                      >
                        {getEntityBadge(entity.type)}
                        <span className="item-name" title={entity.name}>{entity.name}</span>
                        {entity.start_line && <span className="item-line">:{entity.start_line}</span>}
                      </div>
                  ))
                : <div className="outline-empty">No symbols found.</div>
            ) : activeOutlineTab === 'docs' ? (
              <div className="ai-docs-view">
                {isGeneratingDoc ? (
                  <div className="ai-loading">
                    <Sparkles size={20} className="spin-slow" color="var(--accent-green)" />
                    <p>Analyzing code patterns...</p>
                  </div>
                ) : aiDoc ? (
                  <div className="ai-doc-content">
                    <div className="doc-header">
                      <Zap size={14} color="var(--accent-green)" />
                      <span>{aiDoc.title}</span>
                      {aiDoc.cached && <span className="cached-badge">CACHED</span>}
                    </div>
                    <div className="doc-text">
                      {aiDoc.explanation}
                    </div>
                  </div>
                ) : (
                  <div className="ai-docs-empty">
                    <Sparkles size={24} opacity={0.3} />
                    <p>Select a symbol or click below for a full overview</p>
                    <button className="gen-full-doc-btn" onClick={() => fetchAiDoc()}>
                      Generate File Summary
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="impact-view">
                {isCalculatingImpact ? (
                  <div className="ai-loading">
                    <RefreshCw size={20} className="spin" color="var(--accent-green)" />
                    <p>Tracing reverse dependencies...</p>
                  </div>
                ) : impactData ? (
                  <div className="impact-content">
                    <div className="impact-header">
                      <AlertTriangle size={14} color="#F59E0B" />
                      <span>Blast Radius: {impactData.target}</span>
                    </div>
                    <div className="impact-list">
                      {impactData.impacted.length > 0 ? (
                        impactData.impacted.map((item, i) => (
                          <div 
                            key={i} 
                            className="impact-item"
                            onClick={() => handleSelectFile(item.path)}
                          >
                            <div className="impact-item-main">
                              {getEntityBadge(item.type)}
                              <span className="impact-item-name">{item.name}</span>
                              <span className="impact-depth">+{item.depth}</span>
                            </div>
                            <div className="impact-item-path">{item.path.split('/').pop()}</div>
                          </div>
                        ))
                      ) : (
                        <div className="impact-empty">
                          No incoming dependencies found. This entity might be stale or unreachable.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="ai-docs-empty">
                    <Info size={24} opacity={0.3} />
                    <p>Select a symbol from the list to see what depends on it</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Context Menu Overlay */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }} onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} />
          <div className="explore-context-menu" style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}>
            <div className="explore-context-menu-item" onClick={() => {
              fetchImpact(contextMenu.entity);
              closeContextMenu();
            }}>
              <Zap size={14} color="#F59E0B" />
              Analyze Blast Radius
            </div>
            <div className="explore-context-menu-item" onClick={() => {
              navigate(`/graph?traceId=e_${contextMenu.entity.id}`);
              closeContextMenu();
            }}>
              <Wand2 size={14} color="#61AFEF" />
              Trace data flow for `{contextMenu.entity.name}`
            </div>
            <div className="explore-context-menu-item" onClick={() => openRefactorModal(contextMenu.entity)}>
              <Scissors size={14} color="#C678DD" />
              AI Refactor `{contextMenu.entity.name}`...
            </div>
          </div>
        </>
      )}

      {/* Refactor Modal */}
      {showRefactorModal && (
        <div className="refactor-modal-overlay">
          <div className="refactor-modal">
            <div className="refactor-modal-header">
              <div className="header-left">
                <Scissors size={18} color="var(--accent-green)" />
                <h2>AI Refactor: {refactoringEntity?.name}</h2>
              </div>
              <button className="close-modal-btn" onClick={() => setShowRefactorModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="refactor-modal-body">
              {!refactoredCode ? (
                <div className="refactor-setup">
                  <p className="setup-hint">Describe how you want to refactor this entity. We'll show you a diff preview before any changes.</p>
                  <textarea 
                    placeholder="e.g., Extract logic to helper functions, convert to arrow function, add error handling..."
                    value={refactorPrompt}
                    onChange={(e) => setRefactorPrompt(e.target.value)}
                    autoFocus
                  />
                  <div className="setup-actions">
                    <button className="cancel-btn" onClick={() => setShowRefactorModal(false)}>Cancel</button>
                    <button 
                      className="primary-refactor-btn" 
                      onClick={handleRefactor}
                      disabled={!refactorPrompt.trim() || isRefactoring}
                    >
                      {isRefactoring ? (
                        <><RefreshCw size={14} className="spin" /> Thinking...</>
                      ) : (
                        <><Sparkles size={14} /> Preview Refactor</>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="refactor-diff-view">
                  <div className="diff-stats">
                    <Diff size={14} />
                    <span>Side-by-side comparison</span>
                    <button className="retry-refactor-btn" onClick={() => setRefactoredCode(null)}>
                      <Undo2 size={12} /> New Prompt
                    </button>
                  </div>
                  <div className="diff-container">
                    <ReactDiffViewer 
                      oldValue={refactoringEntity.content} 
                      newValue={refactoredCode} 
                      splitView={true} 
                      useDarkTheme={true}
                      leftTitle="Original"
                      rightTitle="Refactored"
                    />
                  </div>
                  <div className="diff-actions">
                    <div className="blast-radius-warning">
                      <Zap size={14} color="#F59E0B" />
                      <span>Note: Refactoring might affect {impactData?.impacted?.length || 'multiple'} incoming dependencies.</span>
                    </div>
                    <button className="cancel-btn" onClick={() => setShowRefactorModal(false)}>Close Preview</button>
                    <button className="apply-refactor-btn" onClick={() => {
                      alert('Disk write is disabled in this preview. Please copy the code manually.');
                    }}>
                      <Save size={14} /> Save to Disk
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExplorePage;
