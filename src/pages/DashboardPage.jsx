import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, File as FileIcon, Folder, Copy, ExternalLink, Activity, Box, Variable, PlaySquare, Bookmark, X } from 'lucide-react';
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

const ResultCard = ({ result, isSelected, onClick, searchQuery }) => {
  const displayName = result.name === 'anonymous' 
    ? (result.content ? result.content.split('\n')[0].slice(0, 40) + '...' : 'anonymous')
    : (result.name || result.path?.split(/[/\\]/).pop());

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1a1a1a',
        backgroundColor: isSelected ? '#1a1a1a' : 'transparent',
        cursor: 'pointer',
        borderLeft: isSelected ? '2px solid #aaff00' : '2px solid transparent',
      }}
    >
      <div style={{ 
        fontSize: '12px', 
        color: '#aaff00', 
        fontFamily: 'monospace',
        marginBottom: '4px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {displayName}
      </div>

      <div style={{
        fontSize: '11px',
        color: '#888',
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {result.line && (
          <span style={{ color: '#555', marginRight: '6px' }}>
            {result.line}
          </span>
        )}
        {result.highlighted_snippet ? (
          <span dangerouslySetInnerHTML={{ __html: result.highlighted_snippet.replace(/\n/g, ' ') }} />
        ) : (
          <HighlightedSnippet 
            text={result.content || ''} 
            query={searchQuery} 
          />
        )}
      </div>
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
    const fetchSearch = async () => {
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
          const fetchedResults = data.results || [];
          setResults(fetchedResults);
          
          addToHistory(query, activeWorkspace, fetchedResults.length, false, false);
          
          if (fetchedResults.length > 0 && !selectedResult) {
            handleSelectResult(fetchedResults[0]);
          }
        }
      } catch (err) {

      }
      setSearchTime(Math.round(performance.now() - start));
    };

    const timer = setTimeout(fetchSearch, 200);
    return () => clearTimeout(timer);
  }, [query, contextId, searchMode]);

  const handleSelectResult = async (result) => {
    setSelectedResult(result);
    try {
      const res = await fetch(apiUrl(`/api/file?path=${encodeURIComponent(result.path)}`));
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content || '');
      }
    } catch (err) {

    }
  };

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

  return (
    <div className="dashboard-container">
      {/* Top Search Area */}
      <div className="advanced-search-area">
        <div className="search-bar-container">
          <Search size={20} className="search-icon-lg" />
          <input 
            type="text" 
            className="search-input-lg" 
            placeholder="Search code..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          
          <div className="search-mode-toggle">
            <button 
              className={`mode-btn ${searchMode === 'symbol' ? 'active' : ''}`}
              onClick={() => setSearchMode('symbol')}
            >
              Symbol Search
            </button>
            <button 
              className={`mode-btn ${searchMode === 'global' ? 'active' : ''}`}
              onClick={() => setSearchMode('global')}
            >
              Global Search
            </button>
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
            padding: '6px 14px',
            borderBottom: '1px solid #1f1f1f',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#555',
            fontFamily: 'monospace',
          }}>
            <span>{results.length} RESULTS</span>
            <span>{searchTime}ms</span>
          </div>

          <div className="results-list">
            {results.map((result, idx) => (
              <ResultCard 
                key={idx} 
                result={result} 
                isSelected={selectedResult === result} 
                onClick={() => handleSelectResult(result)} 
                searchQuery={query}
              />
            ))}
            
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
                    <span className="file-name">{getFileName(selectedResult.path)}</span>
                    <span className="file-path">{selectedResult.path}</span>
                  </div>
                </div>
                <div className="editor-actions">
                  <button className="action-btn"><Copy size={14} /> Copy Path</button>
                  <button className="primary-sm-btn"><ExternalLink size={14} /> Open in Editor</button>
                </div>
              </div>

              <div className="editor-content-adv">
                {fileContent.split('\n').map((line, idx) => {
                  const lineNum = idx + 1;
                  // Extremely basic simulated highlighting for the actual snippet content (since tree-sitter gives start/end)
                  // In a robust implementation, we'd use a real highlighter (like Prism/Highlight.js)
                  // For the prototype, we just highlight the content that matches the result.
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
        
        <div className="status-right">
          <div className="shortcut-group">
            <kbd>⌘</kbd><kbd>K</kbd> <span>Search</span>
          </div>
          <div className="shortcut-group">
            <kbd>↑</kbd><kbd>↓</kbd> <span>Navigate</span>
          </div>
          <div className="shortcut-group">
            <kbd>↵</kbd> <span>Open</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default DashboardPage;
