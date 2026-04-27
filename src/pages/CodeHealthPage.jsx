import React, { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope, Activity, AlertTriangle, Check, Flag, Download,
  ExternalLink, Copy, RefreshCw, ChevronDown, X, FileText
} from 'lucide-react';
import './CodeHealthPage.css';
import { apiUrl } from '../api';

// ── Helpers ──────────────────────────────────────────────────────────────────

const getHeatLevel = (score) => {
  if (score <= 5) return 'green';
  if (score <= 10) return 'amber';
  return 'red';
};

const getHeatColor = (level) => ({ green: '#22c55e', amber: '#f59e0b', red: '#ef4444' }[level]);

const shortPath = (p, workspace) => {
  if (!p) return '';
  if (workspace && p.startsWith(workspace)) {
    const rel = p.slice(workspace.endsWith('/') ? workspace.length : workspace.length + 1);
    return rel;
  }
  return p.split('/').slice(-3).join('/');
};

// ── Tab 1: Complexity ────────────────────────────────────────────────────────

const ComplexityTab = () => {
  const [files, setFiles] = useState([]);
  const [workspace, setWorkspace] = useState('');
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetch(apiUrl('/api/health/complexity'))
      .then(r => r.json())
      .then(d => { setFiles(d.files || []); setWorkspace(d.workspace || ''); })
      .catch(() => {});
  }, []);

  const loadDetail = (fileId) => {
    setSelectedFileId(fileId);
    fetch(apiUrl(`/api/health/complexity/file?fileId=${fileId}`))
      .then(r => r.json())
      .then(d => setDetail(d))
      .catch(() => {});
  };

  const maxScore = files.length > 0 ? Math.max(...files.map(f => f.total_complexity), 1) : 1;

  return (
    <div className="complexity-layout">
      <div className="complexity-file-list">
        <div className="complexity-file-header">
          <span>Files by complexity</span>
          <span style={{ color: '#22c55e', fontSize: 10 }}>{files.length} files</span>
        </div>
        <div className="complexity-file-scroll">
          {files.map(f => {
            const level = getHeatLevel(f.total_complexity);
            const isHigh = level === 'red';
            return (
              <div
                key={f.id}
                className={`cf-row ${selectedFileId === f.id ? 'active' : ''} ${isHigh ? 'high' : ''}`}
                onClick={() => loadDetail(f.id)}
              >
                <span className={`heat-dot ${level}`} />
                <span className={`cf-name ${isHigh ? 'red-text' : ''}`}>{shortPath(f.path, workspace)}</span>
                <div className="cf-bar-wrap">
                  <div className="cf-bar" style={{ width: `${(f.total_complexity / maxScore) * 100}%`, background: getHeatColor(level) }} />
                </div>
                <span className={`cf-score ${isHigh ? 'red-text' : ''}`}>{f.total_complexity}</span>
              </div>
            );
          })}
          {files.length === 0 && <div className="health-empty">No complexity data. Index a workspace first.</div>}
        </div>
        <div className="complexity-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: '#22c55e' }} />1–5</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} />6–10</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} />11+</span>
        </div>
      </div>

      <div className="complexity-detail">
        {detail && detail.entities ? (
          <>
            {detail.entities.length > 0 && (() => {
              const top = detail.entities[0];
              const level = getHeatLevel(top.complexity);
              const label = top.complexity <= 5 ? 'Low' : top.complexity <= 10 ? 'Moderate' : 'High';
              const bd = top.complexity_breakdown || {};
              const maxBd = Math.max(bd.ifs || 0, bd.loops || 0, bd.ternaries || 0, bd.catches || 0, bd.logicals || 0, 1);
              return (
                <div className="detail-scorecard">
                  <div>
                    <div className={`detail-score-num ${level === 'green' ? 'low' : level === 'amber' ? 'med' : 'high'}`}>{top.complexity}</div>
                    <div className="detail-score-label" style={{ color: getHeatColor(level) }}>Cyclomatic — {label}</div>
                  </div>
                  <div className="detail-bars">
                    {[['if / else', bd.ifs], ['loops', bd.loops], ['ternary', bd.ternaries], ['catch', bd.catches], ['&& / ||', bd.logicals]].map(([name, val]) => (
                      <div className="detail-bar-row" key={name}>
                        <span className="detail-bar-name">{name}</span>
                        <div className="detail-bar-track"><div className="detail-bar-fill" style={{ width: `${((val || 0) / maxBd) * 100}%`, background: (val || 0) > 3 ? '#ef4444' : '#f59e0b' }} /></div>
                        <span style={{ marginLeft: 6 }}>{val || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {detail.entities[0] && detail.entities[0].complexity > 5 && (
              <div className="detail-recommendation">
                <div className="rec-title">Recommendation</div>
                <div className="rec-text">
                  This function has {detail.entities[0].complexity} decision paths.
                  {detail.entities[0].complexity > 10
                    ? ' Consider splitting into 2–3 smaller functions. Target score: below 8.'
                    : ' It is starting to grow complex. Keep an eye on it.'}
                </div>
              </div>
            )}

            <div className="detail-function-list">
              <div className="section-title">Functions in {shortPath(detail.file?.path, workspace)}</div>
              {detail.entities.map(e => {
                const lvl = getHeatLevel(e.complexity);
                return (
                  <div key={e.id} className="df-row" onClick={() => window.location.href = `vscode://file/${detail.file.path}:${e.start_line}:1`}>
                    <span className="df-name">ƒ {e.name}</span>
                    <div className="df-meta">
                      <span>{e.loc} LOC</span>
                      <span className="stat-chip" style={{ background: `${getHeatColor(lvl)}22`, color: getHeatColor(lvl), padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{e.complexity}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="health-empty">
            <Activity size={40} opacity={0.3} />
            <div>Select a file to view its complexity breakdown</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Tab 2: Churn ─────────────────────────────────────────────────────────────

const ChurnTab = () => {
  const [files, setFiles] = useState([]);
  const [workspace, setWorkspace] = useState('');
  const [days, setDays] = useState(90);
  const [selectedPath, setSelectedPath] = useState(null);
  const [calendarData, setCalendarData] = useState(null);

  const loadChurn = useCallback(() => {
    fetch(apiUrl(`/api/health/churn?days=${days}`))
      .then(r => r.json())
      .then(d => { setFiles(d.files || []); setWorkspace(d.workspace || ''); })
      .catch(() => {});
  }, [days]);

  useEffect(() => { loadChurn(); }, [loadChurn]);

  const loadCalendar = (path) => {
    setSelectedPath(path);
    fetch(apiUrl(`/api/health/churn/file?path=${encodeURIComponent(path)}`))
      .then(r => r.json())
      .then(d => setCalendarData(d))
      .catch(() => {});
  };

  // Build calendar cells for selected file
  const buildCalendar = () => {
    if (!calendarData?.dayMap) return [];
    const cells = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const count = calendarData.dayMap[key] || 0;
      let bg = '#1a1a1a';
      if (count === 1) bg = '#22c55e33';
      else if (count === 2) bg = '#22c55e66';
      else if (count <= 4) bg = '#f59e0b66';
      else if (count >= 5) bg = '#ef4444cc';
      cells.push({ date: key, count, bg });
    }
    return cells;
  };

  return (
    <div className="churn-layout">
      <div className="churn-file-list">
        <div className="churn-file-header">
          <span>Files by churn</span>
          <div className="time-range-btns">
            {[7, 30, 90].map(d => (
              <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d}d</button>
            ))}
          </div>
        </div>
        <div className="churn-file-scroll">
          {files.map(f => (
            <div key={f.id} className={`churn-row ${selectedPath === f.path ? 'active' : ''}`} onClick={() => loadCalendar(f.path)}>
              <span className="churn-name">{shortPath(f.path, workspace)}</span>
              <span className="churn-count">{f.recent_commits} commits</span>
            </div>
          ))}
          {files.length === 0 && <div className="health-empty">No churn data. Re-index a git repository.</div>}
        </div>
      </div>

      <div>
        {calendarData ? (
          <div className="churn-calendar-container">
            <div className="churn-calendar-title">
              <span>{shortPath(selectedPath, workspace)}</span>
              <span style={{ fontSize: 10, color: '#888' }}>{calendarData.total_commits} total commits</span>
            </div>
            <div className="churn-grid">
              {buildCalendar().map((cell, i) => (
                <div key={i} className="churn-cell" style={{ background: cell.bg }} data-tooltip={`${cell.date}: ${cell.count} commits`} />
              ))}
            </div>
            <div className="complexity-legend" style={{ marginTop: 10 }}>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#1a1a1a', border: '1px solid #333' }} />None</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#22c55e44' }} />1–2</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b77' }} />3–4</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} />5+</span>
            </div>
            <div className="churn-stats">
              <div className="churn-stat">
                <div className="churn-stat-value">{calendarData.total_commits}</div>
                <div className="churn-stat-label">Total Commits</div>
              </div>
              <div className="churn-stat">
                <div className="churn-stat-value">{Object.keys(calendarData.dayMap || {}).length}</div>
                <div className="churn-stat-label">Active Days</div>
              </div>
              <div className="churn-stat">
                <div className="churn-stat-value">{Math.max(...Object.values(calendarData.dayMap || { 0: 0 }))}</div>
                <div className="churn-stat-label">Peak Day</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="health-empty">
            <RefreshCw size={40} opacity={0.3} />
            <div>Select a file to view its churn calendar</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Tab 3: Orphans ───────────────────────────────────────────────────────────

const OrphansTab = () => {
  const [orphans, setOrphans] = useState([]);
  const [counts, setCounts] = useState({ all: 0, flagged: 0, kept: 0, unreviewed: 0 });
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('loc');
  const [selected, setSelected] = useState(new Set());
  const [showExport, setShowExport] = useState(false);

  const loadOrphans = useCallback(() => {
    fetch(apiUrl(`/api/health/orphans?sort=${sort}&filter=${filter}`))
      .then(r => r.json())
      .then(d => { setOrphans(d.orphans || []); setCounts(d.counts || counts); })
      .catch(() => {});
  }, [sort, filter]);

  useEffect(() => { loadOrphans(); }, [loadOrphans]);

  const setReviewStatus = async (entityId, status) => {
    await fetch(apiUrl('/api/health/orphans/review'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId, status })
    });
    loadOrphans();
  };

  const bulkFlag = async () => {
    await fetch(apiUrl('/api/health/orphans/review-bulk'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityIds: [...selected], status: 'flagged' })
    });
    setSelected(new Set());
    loadOrphans();
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === orphans.length) setSelected(new Set());
    else setSelected(new Set(orphans.map(o => o.id)));
  };

  const handleExport = async (format, scope) => {
    const res = await fetch(apiUrl(`/api/health/orphans/export?format=${format}&scope=${scope}`));
    if (format === 'json') {
      const data = await res.json();
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } else {
      const text = await res.text();
      navigator.clipboard.writeText(text);
    }
    setShowExport(false);
  };

  const flaggedLoc = orphans.filter(o => o.review_status === 'flagged').reduce((s, o) => s + o.loc, 0);

  return (
    <div className="orphan-container">
      <div className="orphan-warning">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <div><strong>Dynamic calls (eval, require, computed property access) are not detected.</strong> Verify before deleting any function listed here.</div>
      </div>

      <div className="orphan-stats-row">
        <div className="orphan-loc-counter">
          Deleting flagged functions would remove <strong>{flaggedLoc} lines</strong> of code
        </div>
        <div className="orphan-controls">
          {[['all', `All (${counts.all})`], ['flagged', `Flagged (${counts.flagged})`], ['kept', `Kept (${counts.kept})`]].map(([key, label]) => (
            <button key={key} className={`filter-pill ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>{label}</button>
          ))}
          <select className="sort-select" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="loc">Largest first</option>
            <option value="oldest">Oldest first</option>
            <option value="file">By file</option>
          </select>
          <button className="health-btn" onClick={() => setShowExport(true)}><Download size={13} /> Export</button>
        </div>
      </div>

      <div className="orphan-table">
        <div className="orphan-table-header">
          <span><input type="checkbox" className="orphan-checkbox" checked={selected.size === orphans.length && orphans.length > 0} onChange={toggleAll} /></span>
          <span>Function</span>
          <span>File</span>
          <span>LOC</span>
          <span>Actions</span>
        </div>
        <div className="orphan-table-body">
          {orphans.map(o => (
            <div key={o.id} className={`orphan-row ${o.review_status}`}>
              <span><input type="checkbox" className="orphan-checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} /></span>
              <span className="orphan-name" onClick={() => window.location.href = `vscode://file/${o.file_path}:${o.start_line}:1`}>ƒ {o.name}</span>
              <span className="orphan-path">{o.file_path?.split('/').slice(-2).join('/')}</span>
              <span className="orphan-loc">{o.loc}</span>
              <div className="orphan-actions">
                <button
                  className={`orphan-action-btn ${o.review_status === 'kept' ? 'keep-active' : ''}`}
                  title="Keep"
                  onClick={() => setReviewStatus(o.id, o.review_status === 'kept' ? 'unreviewed' : 'kept')}
                ><Check size={13} /></button>
                <button
                  className={`orphan-action-btn ${o.review_status === 'flagged' ? 'flag-active' : ''}`}
                  title="Flag for deletion"
                  onClick={() => setReviewStatus(o.id, o.review_status === 'flagged' ? 'unreviewed' : 'flagged')}
                ><Flag size={13} /></button>
              </div>
            </div>
          ))}
          {orphans.length === 0 && <div className="health-empty" style={{ padding: '2rem' }}>No orphan functions found.</div>}
        </div>
        {selected.size > 0 && (
          <div className="orphan-bulk-bar">
            <span style={{ fontSize: 12, color: '#888' }}>{selected.size} selected</span>
            <button className="health-btn" onClick={bulkFlag}><Flag size={12} /> Flag selected ({selected.size})</button>
          </div>
        )}
      </div>

      {showExport && (
        <div className="export-overlay" onClick={() => setShowExport(false)}>
          <div className="export-dialog" onClick={e => e.stopPropagation()}>
            <h3>Export Orphan Report</h3>
            {[['md', 'Markdown Table', 'Paste into GitHub issue or Notion'],
              ['json', 'JSON', 'Pipe into custom tooling or CI'],
              ['text', 'Plain Text', 'One filepath:function:line per line']].map(([fmt, label, desc]) => (
              <div key={fmt} className="export-option" onClick={() => handleExport(fmt, filter === 'all' ? 'all' : filter)}>
                <div>
                  <div className="export-option-label">{label}</div>
                  <div className="export-option-desc">{desc}</div>
                </div>
                <Copy size={14} color="#888" />
              </div>
            ))}
            <button className="health-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowExport(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Tab 4: Unified Health Score ───────────────────────────────────────────────

const ScoreTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(apiUrl('/api/health/score'))
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
        // Save snapshot
        fetch(apiUrl('/api/health/score/snapshot'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            complexity_score: d.complexity?.score || 0,
            churn_score: d.churn?.score || 0,
            orphan_score: d.orphans?.score || 0,
            total_score: d.score || 0
          })
        }).catch(() => {});
      })
      .catch(() => setLoading(false));
  }, []);

  const exportReport = () => {
    if (!data) return;
    const md = `# CodeLens Health Report

**Health Score: ${data.score}/100**

## Sub-Scores
| Metric | Score | Detail |
|--------|-------|--------|
| Complexity | ${data.complexity?.score}/100 | ${data.complexity?.complex_count} complex functions out of ${data.complexity?.total} |
| Churn | ${data.churn?.score}/100 | ${data.churn?.high_churn_count} high-churn files out of ${data.churn?.total} |
| Orphans | ${data.orphans?.score}/100 | ${data.orphans?.count} orphan functions out of ${data.orphans?.total} |

## Top Priority Actions
${(data.priorities || []).map((p, i) => `${i + 1}. **${p.name}** in \`${p.file_path?.split('/').pop()}\` — complexity ${p.complexity}, ${p.churn_count} commits, ${p.dependent_count} dependents`).join('\n')}

---
*Generated by CodeLens*`;
    navigator.clipboard.writeText(md);
  };

  if (loading) return <div className="health-loading"><Stethoscope size={40} className="pulse" opacity={0.4} /><div>Computing health score...</div></div>;
  if (!data) return <div className="health-empty">Failed to compute score.</div>;

  const scoreLabel = data.score >= 80 ? 'Healthy' : data.score >= 60 ? 'Fair' : 'Needs Attention';
  const scoreClass = data.score >= 80 ? 'good' : data.score >= 60 ? 'fair' : 'poor';

  // Simple sparkline from snapshots
  const sparkPoints = (data.snapshots || []).reverse().map((s, i, arr) => {
    const x = (i / Math.max(arr.length - 1, 1)) * 100;
    const y = 100 - s.total_score;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="score-layout">
      <div className="score-hero">
        <div className={`score-hero-num ${scoreClass}`}>{data.score}</div>
        <div className="score-hero-label">Codebase Health — {scoreLabel}</div>
        <div className="score-sub-row">
          {[
            ['Complexity', data.complexity?.score, data.complexity?.score >= 80 ? '#22c55e' : data.complexity?.score >= 60 ? '#f59e0b' : '#ef4444'],
            ['Churn', data.churn?.score, data.churn?.score >= 80 ? '#22c55e' : data.churn?.score >= 60 ? '#f59e0b' : '#ef4444'],
            ['Orphans', data.orphans?.score, data.orphans?.score >= 80 ? '#22c55e' : data.orphans?.score >= 60 ? '#f59e0b' : '#ef4444']
          ].map(([label, val, color]) => (
            <div key={label} className="score-sub-chip">
              <div className="score-sub-value" style={{ color }}>{val}</div>
              <div className="score-sub-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {data.snapshots && data.snapshots.length > 1 && (
        <div className="sparkline-container">
          <div className="sparkline-title">Health Trend (last {data.snapshots.length} snapshots)</div>
          <svg className="sparkline-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={sparkPoints} fill="none" stroke="#22c55e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}

      <div className="priority-list">
        <div className="priority-header">Fix these first — highest impact actions</div>
        {(data.priorities || []).map((p, i) => (
          <div key={p.id} className="priority-item" onClick={() => window.location.href = `vscode://file/${p.file_path}:${p.start_line}:1`}>
            <div className="priority-rank">{i + 1}</div>
            <div className="priority-info">
              <div className="priority-name">ƒ {p.name}</div>
              <div className="priority-path">{p.file_path?.split('/').slice(-3).join('/')}</div>
              <div className="priority-badges">
                {p.complexity > 10 && <span className="priority-badge complexity">Complexity: {p.complexity}</span>}
                {p.churn_count > 5 && <span className="priority-badge churn">Churn: {p.churn_count}</span>}
                {p.dependent_count > 0 && <span className="priority-badge orphan">{p.dependent_count} dependents</span>}
              </div>
              <div className="priority-reason">
                {p.complexity} branches, {p.churn_count} commits, {p.dependent_count} dependents — {p.loc} LOC
              </div>
            </div>
            <button className="priority-review-btn" onClick={e => { e.stopPropagation(); window.location.href = `vscode://file/${p.file_path}:${p.start_line}:1`; }}>
              <ExternalLink size={11} /> Review
            </button>
          </div>
        ))}
        {(data.priorities || []).length === 0 && <div className="health-empty" style={{ padding: '2rem' }}>No high-priority issues found.</div>}
      </div>

      <div style={{ textAlign: 'right' }}>
        <button className="health-btn" onClick={exportReport}><FileText size={13} /> Export Health Report</button>
      </div>
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

const CodeHealthPage = () => {
  const [activeTab, setActiveTab] = useState('complexity');

  const tabs = [
    { id: 'complexity', label: 'Complexity Scoring' },
    { id: 'churn', label: 'Churn Visualization' },
    { id: 'orphans', label: 'Stale Code Detector' },
    { id: 'score', label: 'Health Score' },
  ];

  return (
    <div className="health-container">
      <div className="health-topbar">
        <div className="health-title">
          <Stethoscope size={18} color="#22c55e" />
          <span>Code Health</span>
        </div>
      </div>

      <div className="health-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`health-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="health-content">
        {activeTab === 'complexity' && <ComplexityTab />}
        {activeTab === 'churn' && <ChurnTab />}
        {activeTab === 'orphans' && <OrphansTab />}
        {activeTab === 'score' && <ScoreTab />}
      </div>
    </div>
  );
};

export default CodeHealthPage;
