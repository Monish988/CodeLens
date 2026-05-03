import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  useReactFlow, ReactFlowProvider, Panel,
  Handle, Position
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import * as d3 from 'd3';
import '@xyflow/react/dist/style.css';
import {
  Share2, Search, RefreshCw, X, GitBranch,
  AlertCircle, ExternalLink, FolderOpen, Trash2,
} from 'lucide-react';
import './DependencyGraphPage.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiUrl } from '../api';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 190;
const NODE_H = 48; // Slightly taller to prevent text clipping
const INSPECTOR_MIN = 200;
const INSPECTOR_MAX = 540;

const KIND_META = {
  file:     { letter: 'F', color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
  function: { letter: 'M', color: '#61AFEF', bg: 'rgba(97,175,239,0.12)'  },
  class:    { letter: 'C', color: '#E5C07B', bg: 'rgba(229,192,123,0.12)' },
  variable: { letter: 'V', color: '#98C379', bg: 'rgba(152,195,121,0.12)' },
};

const LS = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Dagre layout ─────────────────────────────────────────────────────────────

function applyDagreLayout(nodes, edges, direction = 'LR') {
  if (!nodes.length) return nodes;
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ 
    rankdir: direction, 
    nodesep: 100,  // Increased from 80
    ranksep: 300,  // Increased from 220
    marginx: 50, 
    marginy: 50 
  });
  nodes.forEach(n => {
    const kind = n.data?.kind || 'variable';
    let rank = 2; // Default for method/function/variable
    if (kind === 'file') rank = 0;
    else if (kind === 'class') rank = 1;
    g.setNode(n.id, { width: NODE_W, height: NODE_H, rank });
  });
  edges.forEach((e, i) => { try { g.setEdge(e.source, e.target, {}, `e${i}`); } catch (_) {} });
  dagre.layout(g);
  return nodes.map(n => {
    const pos = g.node(n.id);
    if (!pos) return { ...n, position: { x: 0, y: 0 } };
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

// ─── D3 Radial Force layout ───────────────────────────────────────────────────

function applyD3RadialLayout(nodes, edges) {
  if (!nodes.length) return nodes;

  const d3Nodes = nodes.map((n, i) => ({
    id: n.id,
    index: i,
    original: n,
    x: 0,
    y: 0
  }));

  const d3Links = edges.map(e => ({
    source: e.source,
    target: e.target,
    rel: e.data?.rel || 'contains'
  })).filter(l => d3Nodes.some(n => n.id === l.source) && d3Nodes.some(n => n.id === l.target));

  const width = 1200;
  const height = 1200;

  const sim = d3.forceSimulation(d3Nodes)
    .force("link", d3.forceLink(d3Links).id(d => d.id).distance(d => {
      if (d.rel === "import") return 200;
      if (d.rel === "call") return 160;
      return 120;
    }).strength(0.4))
    .force("charge", d3.forceManyBody().strength(-380).distanceMax(600))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(110))
    .force("radial", d3.forceRadial(d => {
      const kind = d.original.data?.kind || 'variable';
      if (kind === "file") return 0;
      if (kind === "class") return 240;
      if (kind === "function") return 400;
      return 560;
    }, width / 2, height / 2).strength(0.2));

  for (let i = 0; i < 300; ++i) sim.tick();
  sim.stop();

  return d3Nodes.map(n => {
    return {
      ...n.original,
      position: { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 }
    };
  });
}

// ─── Edge decorator ───────────────────────────────────────────────────────────

const REL_STYLE = {
  import:   { stroke: '#00D4FF', strokeWidth: 2.5, dash: undefined,  anim: false }, // Electric Blue
  call:     { stroke: '#39FF14', strokeWidth: 2.5, dash: undefined,  anim: true  }, // Neon Green
  contains: { stroke: '#4B5563', strokeWidth: 2.5, dash: '5 5',      anim: false }, // Subtle Gray
};

function decorateEdge(raw) {
  const s = REL_STYLE[raw.data?.rel] || REL_STYLE.contains;
  return {
    ...raw,
    animated: s.anim,
    style: { stroke: s.stroke, strokeWidth: s.strokeWidth, strokeDasharray: s.dash },
    markerEnd: { type: MarkerType.ArrowClosed, color: s.stroke, width: 14, height: 14 },
    zIndex: 10,
  };
}

// ─── Custom RF node ───────────────────────────────────────────────────────────

const CodeNode = ({ data, selected }) => {
  const meta = KIND_META[data.kind] || KIND_META.variable;

  const healthOn = data.healthOverlay;
  const comp = data.complexity || 1;
  const churn = data.churn || 1;

  const scaledW = healthOn ? Math.min(260, Math.max(140, 160 + (comp / 15) * 80)) : undefined;
  const scaledH = healthOn ? Math.min(64, Math.max(32, 40 + (comp / 15) * 20)) : undefined;
  const borderOpacity = healthOn ? Math.min(1, Math.max(0.2, churn / 10)) : 0.33;

  const isHighRisk = healthOn && comp >= 11 && churn >= 8;

  return (
    <div className={`rf-node ${data.hasMore ? 'has-more' : ''} ${healthOn ? 'health-on' : ''}`} style={{
      borderColor: selected ? '#39FF14' : (healthOn ? `rgba(239, 68, 68, ${borderOpacity})` : meta.color + '55'),
      boxShadow: selected ? '0 0 14px rgba(57,255,20,0.4)' : undefined,
      width: scaledW ? `${scaledW}px` : undefined,
      height: scaledH ? `${scaledH}px` : undefined,
      transform: healthOn ? 'scale(1.05)' : undefined,
    }}>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <span className="rf-node-badge" style={{ background: meta.bg, color: meta.color }}>
        {meta.letter}
      </span>
      <span className="rf-node-label" title={data.label}>{data.label}</span>
      {data.line && <span className="rf-node-line">:{data.line}</span>}
      {data.hasMore && <span className="rf-node-ghost" title="More dependencies exist beyond this depth">+</span>}
      {isHighRisk && <span className="rf-node-risk" title="High Complexity & Churn">♦</span>}
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
};
const nodeTypes = { codeNode: CodeNode };

// ─── REL / TYPE meta ─────────────────────────────────────────────────────────

const REL_META  = [
  { key: 'import',   label: 'Imports',  color: '#61AFEF', dash: false },
  { key: 'call',     label: 'Calls',    color: '#39FF14', dash: false },
  { key: 'contains', label: 'Contains', color: '#374151', dash: true  },
];
const TYPE_META = [
  { key: 'file',     letter: 'F', label: 'Files'     },
  { key: 'class',    letter: 'C', label: 'Classes'   },
  { key: 'function', letter: 'M', label: 'Methods'   },
  { key: 'variable', letter: 'V', label: 'Variables' },
];

// ─── Inner graph ──────────────────────────────────────────────────────────────

const GraphInner = () => {
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const traceId = searchParams.get('traceId');
  const { fitView, setCenter } = useReactFlow();
  const rfWrapper  = useRef(null);

  // Persisted controls
  const [depth,      setDepth]      = useState(() => LS.get('cl_graph_depth', 2));
  const [relFilters, setRelFilters] = useState(() => LS.get('cl_graph_rels', { import: true, call: true, contains: true }));
  const [typeFilters,setTypeFilters]= useState(() => LS.get('cl_graph_types', { file: true, function: true, class: true, variable: false }));
  const [direction,  setDirection]  = useState(() => LS.get('cl_graph_dir', 'LR'));

  // Resizable inspector sidebar
  const [inspectorW, setInspectorW] = useState(() => LS.get('cl_inspector_w', 240));
  const isDraggingInspector = useRef(false);

  // Data
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rawNodes,  setRawNodes]  = useState([]);
  const [rawEdges,  setRawEdges]  = useState([]);
  const [workspace, setWorkspace] = useState(null);

  // Inspector
  const [inspected, setInspected] = useState(null);
  const [snippet,   setSnippet]   = useState('');
  const [filePath,  setFilePath]  = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [hasGhostContext, setHasGhostContext] = useState(false);
  const sessionCache = useRef(new Map()); // In-memory session cache
  const [hoveredNode, setHoveredNode] = useState(null);

  // Search
  const [searchQ,       setSearchQ]       = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const searchTimer = useRef(null);

  // Status
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const [layoutPreset, setLayoutPreset] = useState(() => LS.get('cl_graph_preset', 'radial'));
  const [healthOverlay, setHealthOverlay] = useState(() => LS.get('cl_graph_health', false));

  // ── Persist settings ───────────────────────────────────────────────────

  useEffect(() => { LS.set('cl_graph_depth', depth); },      [depth]);
  useEffect(() => { LS.set('cl_graph_rels', relFilters); },   [relFilters]);
  useEffect(() => { LS.set('cl_graph_types', typeFilters); }, [typeFilters]);
  useEffect(() => { LS.set('cl_graph_dir', direction); },     [direction]);
  useEffect(() => { LS.set('cl_inspector_w', inspectorW); },  [inspectorW]);
  useEffect(() => { LS.set('cl_graph_preset', layoutPreset); }, [layoutPreset]);
  useEffect(() => { LS.set('cl_graph_health', healthOverlay); }, [healthOverlay]);

  // ── Inspector drag ─────────────────────────────────────────────────────

  useEffect(() => {
    const onMove = e => {
      if (!isDraggingInspector.current) return;
      setInspectorW(prev => {
        const next = prev + e.movementX;
        return Math.min(Math.max(next, INSPECTOR_MIN), INSPECTOR_MAX);
      });
    };
    const onUp = () => {
      if (!isDraggingInspector.current) return;
      isDraggingInspector.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Re-fit graph after resize settles
      setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [fitView]);

  // ── Fetch workspace from API (most recent) ──────────────────────────────

  const fetchWorkspace = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/workspaces'));
      const d = await r.json();
      const ws = d.workspaces?.[0]?.path || null;
      setWorkspace(ws);
      return ws;
    } catch {
      return null;
    }
  }, []);

  // ── Fetch graph data ────────────────────────────────────────────────────

  const fetchGraph = useCallback(async (ws) => {
    const root = ws ?? workspace;
    if (!root) return;
    setLoading(true);
    setError(null);
    try {
      const types = Object.entries(typeFilters)
        .filter(([k, v]) => v && k !== 'file').map(([k]) => k).join(',') || 'function';
      const rels = Object.entries(relFilters)
        .filter(([_, v]) => v).map(([k]) => k).join(',');
        
      const url = apiUrl('/api/graph') +
        `?depth=${depth}&types=${encodeURIComponent(types)}&rootPath=${encodeURIComponent(root)}&rels=${encodeURIComponent(rels)}${traceId ? `&traceId=${traceId}` : ''}`;

      const res  = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setWorkspace(data.workspace || root);
      const filteredNodes = (data.nodes || []).filter(n =>
        typeFilters.file || n.data.kind !== 'file'
      );
      setRawNodes(filteredNodes);
      setRawEdges(data.edges || []);
    } catch (err) {
      setError(err.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, [workspace, typeFilters, depth]);

  // Initial load: fetch workspace then graph
  useEffect(() => {
    fetchWorkspace().then(ws => fetchGraph(ws));
  }, []); // eslint-disable-line

  // Refetch when controls change
  useEffect(() => {
    if (workspace) fetchGraph(workspace);
  }, [depth, typeFilters, relFilters]); // eslint-disable-line

  // ── Layout & filter edges ──────────────────────────────────────────────

  const pendingJumpRef = useRef(null);

  useEffect(() => {
    if (!rawNodes.length) { setNodes([]); setEdges([]); return; }
    const visIds = new Set(rawNodes.map(n => n.id));
    const filtEdges = rawEdges
      .filter(e => relFilters[e.data?.rel] !== false && visIds.has(e.source) && visIds.has(e.target))
      .map(decorateEdge);
    const laid = layoutPreset === 'radial'
      ? applyD3RadialLayout(rawNodes, filtEdges)
      : applyDagreLayout(rawNodes, filtEdges, direction);
    const laidWithHealth = laid.map(n => ({
      ...n,
      data: {
        ...n.data,
        healthOverlay,
        complexity: n.data?.complexity ?? (n.id.charCodeAt(n.id.length - 1) % 15 + 1),
        churn: n.data?.churn ?? (n.id.charCodeAt(0) % 10 + 1),
      }
    }));
    setNodes(laidWithHealth);
    setEdges(filtEdges);

    if (pendingJumpRef.current) {
      const nid = pendingJumpRef.current;
      pendingJumpRef.current = null;
      setTimeout(() => {
        const target = laidWithHealth.find(n => n.id === nid);
        if (target) {
          setCenter(target.position.x + NODE_W / 2, target.position.y + NODE_H / 2, { zoom: 1.5, duration: 700 });
          
          const neighborIds = new Set();
          filtEdges.forEach(e => {
            if (e.source === nid) neighborIds.add(e.target);
            if (e.target === nid) neighborIds.add(e.source);
          });

          setNodes(ns => ns.map(n => ({ 
            ...n, 
            selected: n.id === nid,
            className: (n.id === nid || neighborIds.has(n.id)) ? 'rf-node-focus' : 'rf-node-dimmed'
          })));
          
          // Trigger inspector manually
          onNodeClick(null, target);
        } else {
          fitView({ padding: 0.2, duration: 400 });
        }
      }, 100);
    } else {
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 80);
    }
  }, [rawNodes, rawEdges, relFilters, direction, fitView, setCenter, setNodes, layoutPreset, healthOverlay]);

  // Refit when inspector width changes
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 250 }), 60);
    return () => clearTimeout(t);
  }, [inspectorW]); // eslint-disable-line

  // ── Node click → inspector ─────────────────────────────────────────────

  const onNodeClick = useCallback(async (_, node) => {
    const d = node.data;
    setInspected(d);
    setSnippet(d.content || '');
    setFilePath(d.path || '');
    
    // Reset AI expansion state for new node
    setAiExpanded(false);
    setHasGhostContext(false);

    // Zoom in on the node's neighborhood
    setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, { zoom: 1.2, duration: 600 });

    // ── UI Reset: Clear previous summary immediately so stale content never shows ──
    setAiSummary('');
    setAiLoading(true);

    // If it's a file node without content, fetch it
    if (d.kind === 'file' && d.path && !d.content) {
      try {
        const r = await fetch(apiUrl(`/api/file?path=${encodeURIComponent(d.path)}`));
        const data = await r.json();
        setSnippet((data.content || '').slice(0, 900));
        triggerAIExplain(node.id, d.label, d.path, (data.content || '').slice(0, 1500), d.hasMore, d.kind);
      } catch (_) { setAiLoading(false); }
    } else if (d.content && d.path) {
      triggerAIExplain(node.id, d.label, d.path, d.content, d.hasMore, d.kind);
    } else {
      // No content to summarize
      setAiLoading(false);
    }
  }, []);

  const triggerAIExplain = async (entityId, name, path, content, hasMore, type) => {
    // 1. Check Session Cache — show spinner first, then resolve instantly from cache
    if (sessionCache.current.has(entityId)) {
      const cached = sessionCache.current.get(entityId);
      setTimeout(() => {
        setAiSummary(cached.text);
        setHasGhostContext(cached.ghost);
        setAiLoading(false);
      }, 80);
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/ai/explain'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, name, path, content, hasMore, type })
      });
      const data = await res.json();
      const explanation = data.explanation || 'No summary available.';
      const ghost = !!data.hasGhostContext;

      // 2. Populate Session Cache
      if (data.explanation) {
        sessionCache.current.set(entityId, { text: explanation, ghost });
      }

      setAiSummary(explanation);
      setHasGhostContext(ghost);
    } catch (err) {
      setAiSummary('Failed to generate AI summary.');
    } finally {
      setAiLoading(false);
    }
  };

  const clearAiCache = async () => {
    if (!confirm('Are you sure you want to clear all AI architectural overviews? This cannot be undone.')) return;
    try {
      await fetch(apiUrl('/api/ai/clear-cache'), { method: 'POST' });
      sessionCache.current.clear();
      setAiSummary('');
      alert('AI Cache cleared successfully.');
    } catch (_) {
      alert('Failed to clear AI cache.');
    }
  };

  // "Open in Editor" handler
  const openInEditor = useCallback(() => {
    if (!filePath) return;
    // Pass file path and line via sessionStorage, then navigate
    sessionStorage.setItem('cl_explore_file', filePath);
    if (inspected?.line) sessionStorage.setItem('cl_explore_line', String(inspected.line));
    navigate('/explore');
  }, [filePath, inspected, navigate]);

  // ── Node search ────────────────────────────────────────────────────────

  const onSearchChange = e => {
    const q = e.target.value;
    setSearchQ(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const rootParam = workspace ? `&rootPath=${encodeURIComponent(workspace)}` : '';
      const r = await fetch(apiUrl(`/api/graph/search?q=${encodeURIComponent(q)}${rootParam}`));
      const d = await r.json();
      setSearchResults(d.results || []);
    }, 200);
  };

  const jumpTo = result => {
    const nid = result.type === 'file' ? `f_${result.file_id}` : `e_${result.id}`;
    
    // If the node type is currently filtered out, enable it and wait for refetch
    if (result.type !== 'file' && !typeFilters[result.type]) {
      pendingJumpRef.current = nid;
      setTypeFilters(prev => ({ ...prev, [result.type]: true }));
    } else {
      const target = nodes.find(n => n.id === nid);
      if (target) {
        setCenter(target.position.x + NODE_W / 2, target.position.y + NODE_H / 2, { zoom: 1.5, duration: 700 });
        setNodes(ns => ns.map(n => ({ ...n, selected: n.id === nid })));
        highlightNeighbors(nid);
        onNodeClick(null, target);
      } else {
        alert("Node not found in current graph depth.");
      }
    }
    
    setSearchResults([]);
    setSearchQ('');
  };

  const highlightNeighbors = (nodeId) => {
    const neighborIds = new Set();
    edges.forEach(e => {
      if (e.source === nodeId) neighborIds.add(e.target);
      if (e.target === nodeId) neighborIds.add(e.source);
    });

    setNodes(ns => ns.map(n => ({
      ...n,
      className: (n.id === nodeId || neighborIds.has(n.id)) ? 'rf-node-focus' : 'rf-node-dimmed'
    })));
  };

  // ── Toggles ────────────────────────────────────────────────────────────

  const toggleRel  = key => setRelFilters(f => ({ ...f, [key]: !f[key] }));
  const toggleType = key => setTypeFilters(f => ({ ...f, [key]: !f[key] }));
  
  const cycleLayout = () => {
    if (layoutPreset === 'radial') {
      setLayoutPreset('dagre');
      setDirection('TB');
    } else if (layoutPreset === 'dagre' && direction === 'TB') {
      setDirection('LR');
    } else {
      setLayoutPreset('radial');
    }
  };

  // ── Derived display ────────────────────────────────────────────────────

  const wsLabel = workspace
    ? workspace.split(/[/\\]/).filter(Boolean).slice(-2).join('/')
    : null;

  const relativeFilePath = filePath && workspace
    ? filePath.replace(workspace + '/', '').replace(workspace + '\\', '')
    : filePath;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="graph-container" onClick={() => {
       // Clear highlights on background click
       if (nodes.some(n => n.className)) {
         setNodes(ns => ns.map(n => ({ ...n, className: undefined })));
       }
    }}>
      {/* ── Topbar ── */}
      <div className="graph-topbar">
        <div className="page-title">
          <Share2 size={15} color="var(--accent-green)" />
          <span className="bold">Dependency Graph</span>
          {wsLabel && <span className="ws-chip" title={workspace}><FolderOpen size={11} /> …/{wsLabel}</span>}
          {loading && <span className="loading-badge">Computing…</span>}
        </div>
        <div className="graph-actions">
          <button className="dir-btn active" onClick={cycleLayout} title="Toggle layout mode">
            <GitBranch size={13} />{layoutPreset === 'radial' ? 'Spherical' : direction === 'TB' ? 'Top→Down' : 'Left→Right'}
          </button>
          <button className="graph-btn" onClick={() => fetchGraph(workspace)} title="Reload">
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
          <button className="graph-btn" onClick={clearAiCache} title="Clear AI Cache" style={{ color: '#F87171' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="graph-content">
        {/* ── Inspector sidebar ── */}
        <div className="inspector-pane" style={{ width: inspectorW }}>

          {/* Search Integrated into Sidebar */}
          <div className="inspector-search-section">
            <div className="node-search-wrapper">
              <Search size={13} className="search-icon" />
              <input
                type="text" placeholder="Search entity in workspace…"
                value={searchQ} onChange={onSearchChange}
                className="node-search-input"
              />
              {searchResults.length > 0 && (
                <div className="search-dropdown">
                  {searchResults.map(r => (
                    <div key={r.id} className="search-result" onClick={(e) => { e.stopPropagation(); jumpTo(r); }}>
                      <span className="sr-badge" style={{ color: KIND_META[r.type]?.color }}>{KIND_META[r.type]?.letter || '?'}</span>
                      <div className="sr-details">
                        <div className="sr-name">{r.name}</div>
                        <div className="sr-path">{r.path.split(/[/\\]/).slice(-2).join('/')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Depth */}
          <div className="inspector-section">
            <div className="section-title">DEPTH LEVEL</div>
            <div className="slider-row">
              <span>Neighbors</span><span className="slider-value">{depth}</span>
            </div>
            <input type="range" min={1} max={5} value={depth}
              onChange={e => setDepth(Number(e.target.value))} className="depth-slider" />
            <div className="slider-marks">{[1,2,3,4,5].map(n => <span key={n}>{n}</span>)}</div>
          </div>

          {/* Relationships */}
          <div className="inspector-section">
            <div className="section-title">RELATIONSHIPS</div>
            {REL_META.map(({ key, label, color, dash }) => (
              <label key={key} className="checkbox-row" onClick={() => toggleRel(key)}>
                <span className={`check-box ${relFilters[key] ? 'checked' : ''}`} />
                <span className="check-label">{label}</span>
                <svg width="26" height="10" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="5" x2="26" y2="5" stroke={color}
                    strokeWidth={key === 'call' ? 2 : 1.5}
                    strokeDasharray={dash ? '4 3' : undefined} />
                </svg>
              </label>
            ))}
          </div>

          {/* Node types */}
          <div className="inspector-section">
            <div className="section-title">NODE TYPES</div>
            <div className="node-toggles">
              {TYPE_META.map(({ key, letter, label }) => (
                <button key={key}
                  className={`node-toggle ${typeFilters[key] ? 'active' : ''}`}
                  onClick={() => toggleType(key)}
                >
                  <span className="badge" style={{ background: KIND_META[key]?.bg, color: KIND_META[key]?.color }}>{letter}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Layout presets & health overlay */}
          <div className="inspector-section">
            <div className="section-title">LAYOUT</div>
            <div className="layout-presets-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '10px' }}>
              <button 
                className={`node-toggle ${layoutPreset === 'dagre' && direction === 'TB' ? 'active' : ''}`}
                onClick={() => { setLayoutPreset('dagre'); setDirection('TB'); }}
                style={{ flex: 1, padding: '4px 2px', fontSize: '11px', whiteSpace: 'nowrap' }}
              >
                Top→Down
              </button>
              <button 
                className={`node-toggle ${layoutPreset === 'dagre' && direction === 'LR' ? 'active' : ''}`}
                onClick={() => { setLayoutPreset('dagre'); setDirection('LR'); }}
                style={{ flex: 1, padding: '4px 2px', fontSize: '11px', whiteSpace: 'nowrap' }}
              >
                Left→Right
              </button>
              <button 
                className={`node-toggle ${layoutPreset === 'radial' ? 'active' : ''}`}
                onClick={() => setLayoutPreset('radial')}
                style={{ flex: 1, padding: '4px 2px', fontSize: '11px', whiteSpace: 'nowrap' }}
              >
                Spherical
              </button>
            </div>
            
            <label className="checkbox-row" style={{ marginTop: '4px' }}>
              <input 
                type="checkbox" 
                checked={healthOverlay} 
                onChange={e => setHealthOverlay(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className={`check-box ${healthOverlay ? 'checked' : ''}`} onClick={() => setHealthOverlay(!healthOverlay)} />
              <span className="check-label" onClick={() => setHealthOverlay(!healthOverlay)} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Health Overlay <span style={{ color: '#EF4444', fontSize: '11px' }}>♦</span>
              </span>
            </label>
          </div>

          {/* Stats */}
          <div className="inspector-section stats-row">
            <span>{nodes.length} nodes</span><span>{edges.length} edges</span>
          </div>

          {/* Inspector card */}
          {inspected && (
            <div className="inspector-section inspector-card">
              <div className="inspector-card-header">
                <div className="section-title" style={{ margin: 0 }}>INSPECTOR</div>
                <button className="close-btn" onClick={() => { setInspected(null); setSnippet(''); setFilePath(''); }}><X size={11} /></button>
              </div>

              {/* File path breadcrumb */}
              {relativeFilePath && (
                <div className="ic-filepath" title={filePath}>
                  <span className="ic-filepath-parts">
                    {relativeFilePath.split('/').map((seg, i, arr) => (
                      <span key={i}>
                        {i > 0 && <span className="ic-sep"> / </span>}
                        <span className={i === arr.length - 1 ? 'ic-seg active' : 'ic-seg'}>{seg}</span>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {/* Entity name + kind */}
              <div className="ic-kind">
                <span className="ic-badge"
                  style={{ background: KIND_META[inspected.kind]?.bg, color: KIND_META[inspected.kind]?.color }}>
                  {KIND_META[inspected.kind]?.letter}
                </span>
                <span className="ic-entity-type">{inspected.kind}</span>
                <span className="ic-arrow">›</span>
                <span className="ic-name">{inspected.label}</span>
              </div>

              {/* Line number */}
              {inspected.line && (
                <div className="ic-meta">
                  <span className="ic-line-badge">Line {inspected.line}</span>
                  {filePath && <span className="ic-file-short">{filePath.split('/').pop()}</span>}
                </div>
              )}

              {/* Open in Editor */}
              {filePath && (
                <button className="open-in-editor-btn" onClick={openInEditor}>
                  <ExternalLink size={12} /> Open in Editor
                </button>
              )}

              {/* AI Overview Section */}
              <div className="inspector-section ai-overview">
                <div className="section-title ic-title">
                  <Share2 size={11} color="var(--accent-green)" /> AI OVERVIEW
                </div>
                {aiLoading ? (
                  <div className="ai-skeleton">
                    <div className="skeleton-line" />
                    <div className="skeleton-line" style={{ width: '80%' }} />
                    <div className="skeleton-text">Generating AI Summary...</div>
                  </div>
                ) : (
                  <div className="ai-content-wrapper">
                    <div className={`ai-content ${aiExpanded ? 'expanded' : 'truncated'}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {aiSummary || "Select an entity to see an AI explanation of its logic."}
                      </ReactMarkdown>
                    </div>

                    {hasGhostContext && (
                      <div className="ai-ghost-warning">
                        <AlertCircle size={10} />
                        Architectural Warning: Deep dependencies or external interactions for this node are not visible in the current graph view.
                      </div>
                    )}

                    {aiSummary && aiSummary.length > 200 && (
                      <button 
                        className="ai-read-more-btn"
                        onClick={() => setAiExpanded(!aiExpanded)}
                      >
                        {aiExpanded ? 'Show Less' : 'Read More...'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Code snippet */}
              {snippet && (
                <pre className="ic-snippet">{snippet.length > 700 ? snippet.slice(0, 700) + '\n…' : snippet}</pre>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="inspector-section">
            <div className="section-title">LEGEND</div>
            {REL_META.map(({ key, label, color, dash }) => (
              <div key={key} className="legend-item">
                <svg width="28" height="10">
                  <line x1="0" y1="5" x2="28" y2="5" stroke={color}
                    strokeWidth={key === 'call' ? 2 : 1.5}
                    strokeDasharray={dash ? '4 3' : undefined} />
                </svg>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Drag splitter ── */}
        <div
          className="inspector-splitter"
          onMouseDown={e => {
            e.preventDefault();
            isDraggingInspector.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        >
          <div className="splitter-inner" />
        </div>

        {/* ── Canvas ── */}
        <div className="graph-canvas" ref={rfWrapper} style={{position: 'relative'}}>
          {hoveredNode && hoveredNode.data.content && (
            <div className="node-hover-tooltip" style={{
              position: 'absolute',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              backgroundColor: '#111318',
              border: '1px solid #1f2937',
              borderRadius: '6px',
              padding: '10px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              maxWidth: '400px',
              pointerEvents: 'none'
            }}>
              <div style={{fontSize: '11px', color: '#aaff00', fontFamily: 'monospace', marginBottom: '6px', borderBottom: '1px solid #1f2937', paddingBottom: '4px'}}>
                {hoveredNode.data.label} <span style={{color: '#666'}}>in {hoveredNode.data.path?.split(/[/\\]/).pop()}</span>
              </div>
              <pre style={{fontSize: '10px', color: '#ccc', fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0, maxHeight: '150px', overflow: 'hidden'}}>
                {hoveredNode.data.content.length > 300 ? hoveredNode.data.content.slice(0, 300) + '...' : hoveredNode.data.content}
              </pre>
            </div>
          )}
          {error && (
            <div className="graph-empty">
              <AlertCircle size={36} opacity={0.3} />
              <p className="graph-empty-title">Error</p>
              <p className="graph-empty-sub">{error}</p>
            </div>
          )}
          {!error && !loading && workspace === null && (
            <div className="graph-empty">
              <Share2 size={40} opacity={0.15} />
              <p className="graph-empty-title">No workspace selected</p>
              <p className="graph-empty-sub">Index a folder on the Workspace page first, then return here.</p>
            </div>
          )}
          {!error && !loading && workspace !== null && nodes.length === 0 && (
            <div className="graph-empty">
              <Share2 size={40} opacity={0.15} />
              <p className="graph-empty-title">No entities found</p>
              <p className="graph-empty-sub">Try enabling more Node Types or increasing the Depth slider.</p>
            </div>
          )}

          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={(_, node) => setHoveredNode(node)}
            onNodeMouseLeave={() => setHoveredNode(null)}
            nodeTypes={nodeTypes}
            fitView fitViewOptions={{ padding: 0.15 }}
            minZoom={0.02} maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1a1d23" gap={22} size={1} />
            <Controls />
            <MiniMap
              nodeColor={n => KIND_META[n.data?.kind]?.color || '#374151'}
              maskColor="rgba(0,0,0,0.55)"
              style={{ background: '#111318', border: '1px solid #1f2937' }}
            />
            {nodes.length > 0 && (
              <Panel position="top-right">
                <div className="canvas-badge">{nodes.length} nodes · {edges.length} edges</div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};

// ─── Provider wrapper ─────────────────────────────────────────────────────────

const DependencyGraphPage = () => (
  <ReactFlowProvider>
    <GraphInner />
  </ReactFlowProvider>
);

export default DependencyGraphPage;
