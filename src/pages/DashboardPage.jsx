import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, File as FileIcon, Folder, Copy, ExternalLink, Activity, Box, Variable, PlaySquare, Bookmark, X, AlertTriangle, Sparkles, Stethoscope, GitBranch, Zap, ArrowUpRight } from 'lucide-react';
import './DashboardPage.css';
import { apiUrl } from '../api';


const HighlightedSnippet = ({ text, query }) => {
  if (!query || !text) return <span style={{ color: '#666' }}>{text}</span>;
  const firstLine = text.split('\n')[0];
  const idx = firstLine.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span style={{ color: '#666' }}>{firstLine}</span>;
  return (
    <>
      <span style={{ color: '#666' }}>{firstLine.slice(0, idx)}</span>
      <span style={{ color: '#fff', backgroundColor: '#2a3a1a' }}>
        {firstLine.slice(idx, idx + query.length)}
      </span>
      <span style={{ color: '#666' }}>{firstLine.slice(idx + query.length)}</span>
    </>
  );
};

const ResultCard = ({ result, isSelected, onClick, searchQuery, impactCount, onImpactClick }) => {
  const isAnonymous = result.name === 'anonymous' || !result.name;
  const displayName = isAnonymous 
    ? 'anonymous'
    : (result.name || result.path?.split(/[/\\]/).pop());

  return (
    <div
      className={`result-card ${isSelected ? 'active' : ''}`}
      onClick={onClick}
      title={result.name}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
        {result.line && (
          <span style={{ color: '#666', fontSize: '11px', fontFamily: 'monospace' }}>
            L{result.line}
          </span>
        )}
        <span style={{ color: '#666', fontSize: '11px', fontFamily: 'monospace' }}>ƒ</span>
        <div style={{ 
          fontSize: '12px', 
          color: isAnonymous ? '#f59e0b' : '#22c55e', 
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '140px'
        }}>
          {displayName}
        </div>
      </div>
      
      {impactCount > 0 && (
        <div className="blast-radius-badge" onClick={(e) => { e.stopPropagation(); onImpactClick(result); }}>
          <AlertTriangle size={10} /> {impactCount} dependents
        </div>
      )}
    </div>
  );
};
const DashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const contextId = searchParams.get('contextId');
  const initialQuery = searchParams.get('q') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [searchMode, setSearchMode] = useState('symbol');
  const [results, setResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [searchTime, setSearchTime] = useState(0);
  const [activeWorkspace, setActiveWorkspace] = useState('');

  const [activeTab, setActiveTab] = useState('definition');
  const [impactData, setImpactData] = useState([]);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactCountMap, setImpactCountMap] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [hideImpactWarning, setHideImpactWarning] = useState(false);
  const [focusedCallSite, setFocusedCallSite] = useState(0);

  useEffect(() => {
    const fetchCounts = async () => {
      const newMap = {};
      await Promise.all(results.map(async (r) => {
        const name = r.name || (r.content ? r.content.split('\n')[0].match(/\b([a-zA-Z_]\w*)\b/)?.[1] : null);
        if (!name || name.length < 3) return;
        try {
          const res = await fetch(apiUrl(`/api/impact/count?name=${name}`));
          const data = await res.json();
          if (data.count > 0) newMap[name] = data.count;
        } catch(e) {}
      }));
      setImpactCountMap(prev => ({ ...prev, ...newMap }));
    };
    if (results.length > 0) fetchCounts();
  }, [results]);

  useEffect(() => {
    if (activeTab === 'impact' && selectedResult) {
      const name = selectedResult.name || (selectedResult.content ? selectedResult.content.split('\n')[0].match(/\b([a-zA-Z_]\w*)\b/)?.[1] : null);
      if (!name) { setImpactData([]); return; }
      setImpactLoading(true);
      fetch(apiUrl(`/api/impact?name=${name}`))
        .then(r => r.json())
        .then(data => { setImpactData(data.dependents || []); setImpactLoading(false); })
        .catch(() => { setImpactData([]); setImpactLoading(false); });
    }
  }, [activeTab, selectedResult]);

  useEffect(() => {
    fetch(apiUrl('/api/workspaces')).then(r => r.json()).then(d => {
      if (d.workspaces?.[0]) setActiveWorkspace(d.workspaces[0].path.split(/[/\\]/).pop());
    });
  }, []);

  const addToHistory = (queryStr, workspaceStr, resultCount, regex, caseSensitive) => {
    if (!queryStr.trim()) return;
    const existing = JSON.parse(localStorage.getItem('codelens-search-history') || '[]');
    // Avoid saving identical sequential queries
    if (existing.length > 0 && existing[0].query === queryStr) return;

    const entry = {
      id: crypto.randomUUID(),
      query: queryStr,
      workspace: workspaceStr,
      timestamp: new Date().toISOString(),
      resultCount,
      regex,
      caseSensitive,
    };
    existing.unshift(entry);
    localStorage.setItem('codelens-search-history', JSON.stringify(existing.slice(0, 500)));
  };



  useEffect(() => {
    let isStale = false;
    const fetchSearch = async () => {
      if (searchMode === 'health') {
        const start = performance.now();
        try {
          const res = await fetch(apiUrl('/api/health/stale'));
          if (res.ok) {
            const data = await res.json();
            if (isStale) return;
            const fetchedResults = (data.staleEntities || []).map(e => ({
               path: e.file_path,
               name: e.name,
               type: e.type,
               line: e.start_line,
               content: e.name,
               highlighted_snippet: e.type === 'function' ? `<span style="color:#61AFEF">ƒ</span> ${e.name}` : `<span style="color:#E5C07B">C</span> ${e.name}`
            }));
            setResults(fetchedResults);
            if (fetchedResults.length > 0 && !selectedResult) {
               handleSelectResult(fetchedResults[0]);
            }
          }
        } catch(err) {}
        if (!isStale) setSearchTime(Math.round(performance.now() - start));
        return;
      }

      if (!query.trim()) {
        setResults([]);
        return;
      }

      const start = performance.now();

      try {
        const url = new URL(apiUrl('/api/search'), window.location.origin);
        url.searchParams.append('q', query);
        url.searchParams.append('mode', searchMode);
        if (contextId) url.searchParams.append('contextId', contextId);

        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (isStale) return;
          const fetchedResults = data.results || [];
          setResults(fetchedResults);
          
          addToHistory(query, activeWorkspace, fetchedResults.length, false, false);
          
          if (fetchedResults.length > 0 && !selectedResult) {
            handleSelectResult(fetchedResults[0]);
          }
        }
      } catch (err) {

      }
      if (!isStale) setSearchTime(Math.round(performance.now() - start));
    };

    const timer = setTimeout(fetchSearch, 200);
    return () => {
      isStale = true;
      clearTimeout(timer);
    };
  }, [query, contextId, searchMode]);

  const handleSelectResult = async (result) => {
    setSelectedResult(result);
    setFocusedCallSite(0);
    try {
      const res = await fetch(apiUrl(`/api/file?path=${encodeURIComponent(result.path)}`));
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content || '');
      }
    } catch (err) {

    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input
      if (document.activeElement.tagName === 'INPUT') return;

      if (e.key === 't' || e.key === 'T') {
        setActiveTab('impact');
      }

      if (activeTab === 'impact' && impactData.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedCallSite(prev => Math.min(prev + 1, impactData.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedCallSite(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const target = impactData[focusedCallSite];
          if (target) window.location.href = `vscode://file/${target.file_path}:${target.start_line}:1`;
        } else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          const target = impactData[focusedCallSite];
          if (target) {
            const shortPath = target.file_path.split(/[/\\]/).pop();
            navigator.clipboard.writeText(`${shortPath}:${target.start_line}`);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, impactData, focusedCallSite]);

  const getEntityIcon = (type) => {
    switch(type) {
      case 'function': return <Activity size={14} />;
      case 'class': return <Box size={14} />;
      case 'variable': return <Variable size={14} />;
      default: return <FileIcon size={14} />;
    }
  };

  const getFileExtension = (path) => {
    const ext = path.split('.').pop();
    if (ext === 'js' || ext === 'jsx') return { label: 'JS', class: 'js' };
    if (ext === 'ts') return { label: 'TS', class: 'ts' };
    if (ext === 'tsx') return { label: '⚛', class: 'react' };
    return { label: ext?.toUpperCase(), class: 'default' };
  };

  const getFileName = (path) => path.split('/').pop() || path.split('\\').pop();

  const placeholders = {
    symbol: 'Search symbols, functions, classes...',
    global: 'Search across all file contents...',
    health: 'Stale code & health diagnostics...'
  };

  return (
    <div className="dashboard-container">
      {/* Top Search Area */}
      <div className="advanced-search-area">
        <div className="search-bar-container">
          <Search size={20} className="search-icon-lg" />
          <input 
            type="text" 
            className="search-input-lg" 
            placeholder={placeholders[searchMode]}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          
          <div style={{ display: 'flex', gap: '2px', backgroundColor: '#111', borderRadius: '6px', padding: '2px' }}>
            {['symbol', 'global', 'health'].map(mode => (
              <button
                key={mode}
                onClick={() => { setSearchMode(mode); setResults([]); }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  backgroundColor: searchMode === mode ? '#fff' : 'transparent',
                  color: searchMode === mode ? '#000' : '#666',
                  transition: '150ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {mode === 'symbol' ? 'Symbol Search' : 
                 mode === 'global' ? 'Global Search' : 
                 <><Stethoscope size={14} /> Health</>}
              </button>
            ))}
          </div>
          
          <div className="workspace-badge">
            <Folder size={14} color="var(--accent-green)" />
            <span>Workspace</span>
          </div>
        </div>



        <div className="search-filters-row">
          {contextId && (
            <div className="filter-chip active-context">
              <Bookmark size={14} />
              <span>Prioritizing Saved Context</span>
              <button className="clear-chip" onClick={() => {
                searchParams.delete('contextId');
                setSearchParams(searchParams);
              }}>
                <X size={12} />
              </button>
            </div>
          )}
          <div className="filter-chip">
            <FileIcon size={14} />
            <span>.ts, .tsx, .js, .jsx</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="dashboard-content">
        {/* Left Pane - Results */}
        <div className="results-pane-adv" style={{
          width: '260px',
          height: '100vh',
          overflowY: 'auto',
          borderRight: '1px solid #1f1f1f',
          flexShrink: 0,
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #1f1f1f',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div className="stat-chips">
              <span className="stat-chip amber">{results.length} {searchMode === 'health' ? 'STALE' : 'RESULTS'}</span>
              <span className="stat-chip green">{searchTime}ms</span>
            </div>
          </div>

          <div className="results-list" style={{ padding: searchMode === 'health' ? '0' : '1rem' }}>
            {searchMode === 'health' ? (
              Object.entries(results.reduce((acc, res) => {
                const p = res.path || 'Unknown';
                if (!acc[p]) acc[p] = [];
                acc[p].push(res);
                return acc;
              }, {})).map(([path, groupResults]) => {
                const isCollapsed = collapsedGroups[path];
                return (
                  <div key={path}>
                    <div 
                      className="file-group-header" 
                      onClick={() => setCollapsedGroups(p => ({ ...p, [path]: !p[path] }))}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <FileIcon size={12} /> {path.split(/[/\\]/).pop()}
                      </span>
                      <span style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: '0.2s' }}>▼</span>
                    </div>
                    {!isCollapsed && <div style={{ padding: '8px' }}>
                      {groupResults.map((result, idx) => {
                        const name = result.name || (result.content ? result.content.split('\n')[0].match(/\b([a-zA-Z_]\w*)\b/)?.[1] : null);
                        const impactCount = impactCountMap[name] || 0;
                        const handleImpactClick = (res) => {
                          handleSelectResult(res);
                          setActiveTab('impact');
                        };
                        return (
                          <ResultCard 
                            key={idx} 
                            result={result} 
                            isSelected={selectedResult === result} 
                            onClick={() => handleSelectResult(result)} 
                            searchQuery={query}
                            impactCount={impactCount}
                            onImpactClick={handleImpactClick}
                          />
                        );
                      })}
                    </div>}
                  </div>
                );
              })
            ) : (
              results.map((result, idx) => {
                const name = result.name || (result.content ? result.content.split('\n')[0].match(/\b([a-zA-Z_]\w*)\b/)?.[1] : null);
                const impactCount = impactCountMap[name] || 0;
                const handleImpactClick = (res) => {
                  handleSelectResult(res.path ? res : { path: res.filePath, content: res.content });
                  setActiveTab('impact');
                };

                return (
                  <ResultCard 
                    key={idx} 
                    result={result} 
                    isSelected={selectedResult === result} 
                    onClick={() => handleSelectResult(result)} 
                    searchQuery={query}
                    impactCount={impactCount}
                    onImpactClick={handleImpactClick}
                  />
                )
              })
            )}
            
            {results.length === 0 && query && (
              <div style={{padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
                No results found.
              </div>
            )}
            {results.length === 0 && !query && (
              <div style={{padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
                Start typing to search your workspace...
              </div>
            )}
          </div>
        </div>

        {/* Right Pane - Editor Viewer */}
        <div className="editor-pane-adv">
          {selectedResult ? (
            <>
              <div className="editor-topbar">
                <div className="file-info">
                  <span className={`file-type-icon ${getFileExtension(selectedResult.path).class}`}>
                    {getFileExtension(selectedResult.path).label}
                  </span>
                  <div className="file-names">
                    <span className="file-name" style={{ color: '#fff', fontSize: '15px', fontWeight: 500 }}>{getFileName(selectedResult.path)}</span>
                    <span className="file-path">{selectedResult.path}</span>
                  </div>
                </div>
                <div className="editor-actions">
                  <button className="action-btn" onClick={() => navigator.clipboard.writeText(selectedResult.path)}><Copy size={14} /> Copy Path</button>
                  <button className="action-btn"><GitBranch size={14} /> Run git log</button>
                  <button 
                    className="action-btn"
                    onClick={() => {
                      const line = selectedResult.line || selectedResult.startLine || 1;
                      window.location.href = `vscode://file/${selectedResult.path}:${line}:1`;
                    }}
                  >
                    <ExternalLink size={14} /> Open in VS Code
                  </button>
                </div>
              </div>

              <div className="editor-tabs">
                <div className={`editor-tab ${activeTab === 'definition' ? 'active' : ''}`} onClick={() => setActiveTab('definition')}>Definition</div>
                <div className={`editor-tab ${activeTab === 'references' ? 'active' : ''}`} onClick={() => setActiveTab('references')}>References</div>
                <div className={`editor-tab ${activeTab === 'impact' ? 'active' : ''}`} onClick={() => setActiveTab('impact')}>Impact {impactData.length > 0 && `(${impactData.length})`}</div>
                <div className={`editor-tab ${activeTab === 'complexity' ? 'active' : ''}`} onClick={() => setActiveTab('complexity')}>Complexity</div>
              </div>

              {activeTab === 'definition' && (
                <div className="editor-content-adv">
                  {fileContent.split('\n').map((line, idx) => {
                    const lineNum = idx + 1;
                    const isMatch = selectedResult.content && line.includes(selectedResult.content.split('\n')[0].trim());
                    return (
                      <div key={idx} className={`code-line ${isMatch ? 'highlight-border' : ''}`}>
                        <span className="line-num">{lineNum}</span>
                        <span className="code-text">
                          {isMatch ? <span className="highlight-bg">{line}</span> : line}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {activeTab === 'references' && (
                <div style={{padding: '2rem', textAlign: 'center', color: '#666', fontFamily: 'monospace'}}>
                  No references loaded.
                </div>
              )}
              {activeTab === 'impact' && (
                <div className="impact-container">
                  {impactLoading ? (
                    <div style={{color: '#666'}}>Analyzing blast radius...</div>
                  ) : impactData.length > 0 ? (
                    <>
                      {!hideImpactWarning && <div className="impact-warning-card">
                        <div className="impact-warning-content">
                          <span className="impact-warning-title">
                            <strong>⚠ Changing this affects {impactData.length} call sites</strong> — review before refactoring
                          </span>
                        </div>
                        <div className="impact-warning-dismiss" onClick={() => setHideImpactWarning(true)}>
                          <X size={14} />
                        </div>
                      </div>}
                      
                      {Object.entries(impactData.reduce((acc, curr) => {
                        acc[curr.file_path] = acc[curr.file_path] || [];
                        acc[curr.file_path].push(curr);
                        return acc;
                      }, {})).map(([file, items], groupIdx) => {
                        return (
                          <div key={file} className="impact-file-group">
                            <div className="impact-file-header">
                              <div><FileIcon size={14} /> {file.split(/[/\\]/).pop()}</div>
                              <div className="impact-file-count">{items.length} call site{items.length !== 1 ? 's' : ''}</div>
                            </div>
                            <div className="impact-items">
                              {items.map((item, i) => {
                                // Calculate global index for keyboard nav
                                let globalIndex = 0;
                                let gIdx = 0;
                                for (const [f, its] of Object.entries(impactData.reduce((acc, curr) => {
                                  acc[curr.file_path] = acc[curr.file_path] || [];
                                  acc[curr.file_path].push(curr);
                                  return acc;
                                }, {}))) {
                                  if (f === file) { globalIndex += i; break; }
                                  globalIndex += its.length;
                                }
                                const isFocused = focusedCallSite === globalIndex;
                                
                                // Extract code preview line
                                let codePreview = '...';
                                if (item.content) {
                                  // Attempt to find the specific line where the target is called
                                  const targetName = selectedResult.name || '';
                                  const lines = item.content.split('\n');
                                  const matchLine = lines.find(l => l.includes(targetName));
                                  if (matchLine) codePreview = matchLine.trim();
                                  else codePreview = lines[0].trim();
                                  if (codePreview.length > 80) codePreview = codePreview.slice(0, 80) + '...';
                                }

                                return (
                                  <div key={i} 
                                    className={`impact-item ${isFocused ? 'focused' : ''}`}
                                    onClick={() => window.location.href = `vscode://file/${item.file_path}:${item.start_line}:1`}
                                  >
                                    <div className="impact-item-top">
                                      <div className="impact-caller">
                                        <Zap size={14} color="#aaff00" />
                                        <span>{item.name}</span>
                                        <span className="impact-caller-line" onClick={(e) => { e.stopPropagation(); window.location.href = `vscode://file/${item.file_path}:${item.start_line}:1`; }}>
                                          L:{item.start_line}
                                        </span>
                                      </div>
                                      <div className={`impact-severity-badge ${item.isDirect ? 'direct' : 'indirect'}`}>
                                        {item.isDirect ? 'DIRECT' : 'TRANSITIVE'}
                                      </div>
                                    </div>
                                    <div className="impact-code-preview">
                                      {codePreview}
                                    </div>
                                    <div className="impact-actions">
                                      <button className="ghost-btn" onClick={(e) => { e.stopPropagation(); window.location.href = `vscode://file/${item.file_path}:${item.start_line}:1`; }}>
                                        Open line <ArrowUpRight size={10} />
                                      </button>
                                      <button className="ghost-btn" onClick={(e) => { 
                                        e.stopPropagation(); 
                                        navigator.clipboard.writeText(`${file.split(/[/\\]/).pop()}:${item.start_line}`);
                                      }}>
                                        <Copy size={10} /> Copy reference
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  ) : (
                    <div className="impact-empty">
                      <Stethoscope size={40} opacity={0.4} color="#61AFEF" />
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#888', marginTop: '12px' }}>Health</div>
                      <div style={{ marginTop: '8px' }}>No callers found.<br/>This function may be a safe entry point or unused.</div>
                      <button className="action-btn" style={{marginTop: '1.5rem'}}>Send to Stale Code Detector</button>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'complexity' && (
                <div className="impact-container">
                  <div className="complexity-container">
                    {(() => {
                      const score = selectedResult.complexity || 1;
                      const level = score <= 5 ? 'low' : score <= 10 ? 'med' : 'high';
                      const label = score <= 5 ? 'Low' : score <= 10 ? 'Moderate' : 'High';
                      
                      // Mock breakdown based on content regex
                      const content = selectedResult.content || '';
                      const ifs = (content.match(/\bif\s*\(/g) || []).length;
                      const loops = (content.match(/\b(for|while)\s*\(/g) || []).length;
                      const ternaries = (content.match(/\?/g) || []).length;
                      const callbacks = (content.match(/=>/g) || []).length;

                      return (
                        <>
                          <div className="complexity-scorecard">
                            <div className={`complexity-score ${level}`}>{score}</div>
                            <div className="complexity-label">Cyclomatic complexity — {label}</div>
                            <div className="complexity-breakdown">
                              <div className="breakdown-item">if statements ({ifs})</div>
                              <span>·</span>
                              <div className="breakdown-item">loops ({loops})</div>
                              <span>·</span>
                              <div className="breakdown-item">ternaries ({ternaries})</div>
                              <span>·</span>
                              <div className="breakdown-item">callbacks ({callbacks})</div>
                            </div>
                          </div>
                          
                          <div className="complexity-recommendation">
                            This function has {score} decision paths. 
                            {score > 10 ? ' Consider splitting into 2–3 smaller functions to improve maintainability and reduce bug risk.' 
                              : score > 5 ? ' It is starting to grow complex. Keep an eye on it.' 
                              : ' It is well within the recommended complexity threshold.'}
                          </div>

                          {score > 5 && (
                            <div>
                              <div className="complexity-list-title">Refactor Candidates</div>
                              <div className="complexity-candidate">
                                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#61AFEF' }}>ƒ extractHelperData</span>
                                <span className="stat-chip amber" style={{ fontSize: '12px' }}>Score: {Math.max(1, score - 3)}</span>
                              </div>
                              <div className="complexity-candidate">
                                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#61AFEF' }}>ƒ parseConditionals</span>
                                <span className="stat-chip amber" style={{ fontSize: '12px' }}>Score: {Math.max(1, score - 5)}</span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)'}}>
              Select a file to view its content
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="status-bar">
        <div className="status-left">
          <div className="status-indicator-sm green"></div>
          <span>Connected</span>
          <div className="divider-v-sm"></div>
          <span>Ready</span>
        </div>
        
        {selectedResult && selectedResult.path && (
          <div className="status-center" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#888' }}>{selectedResult.path.split(/[/\\]/).join(' / ')}</span>
            {selectedResult.name && <>
              <span style={{ color: '#555' }}>/</span>
              <span style={{ color: '#aaff00' }}>{selectedResult.name}</span>
            </>}
          </div>
        )}

        <div className="status-right">
          <div className="shortcut-group">
            <kbd>⌘</kbd><kbd>K</kbd> <span>Search</span>
          </div>
          <div className="shortcut-group">
            <kbd>T</kbd> <span>Impact</span>
          </div>
          <div className="shortcut-group">
            <kbd>↑</kbd><kbd>↓</kbd> <span>Navigate</span>
          </div>
          <div className="shortcut-group">
            <kbd>↵</kbd> <span>Open line</span>
          </div>
          <div className="shortcut-group">
            <kbd>C</kbd> <span>Copy ref</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default DashboardPage;
