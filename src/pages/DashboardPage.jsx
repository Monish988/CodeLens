import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, File as FileIcon, Folder, Copy, ExternalLink, Activity, Box, Variable, PlaySquare, Bookmark, X } from 'lucide-react';
import './DashboardPage.css';
import { apiUrl } from '../api';

const DashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const contextId = searchParams.get('contextId');
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [searchTime, setSearchTime] = useState(0);

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
        if (contextId) url.searchParams.append('contextId', contextId);

        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          if (data.results && data.results.length > 0 && !selectedResult) {
            handleSelectResult(data.results[0]);
          }
        }
      } catch (err) {

      }
      setSearchTime(Math.round(performance.now() - start));
    };

    const timer = setTimeout(fetchSearch, 200);
    return () => clearTimeout(timer);
  }, [query, contextId]);

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
            <button className="mode-btn active">Keyword</button>
            <button className="mode-btn">Semantic</button>
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
        <div className="results-pane-adv">
          <div className="results-header">
            <span className="results-count">{results.length} RESULTS</span>
            {query && <span className="results-time">{searchTime}ms</span>}
          </div>

          <div className="results-list">
            {results.map((result, idx) => {
              const fileType = getFileExtension(result.path);
              const fileName = getFileName(result.path);
              
              // We simulate the snippet logic for the UI listing
              return (
                <div 
                  key={idx} 
                  className={`result-card ${selectedResult === result ? 'active' : ''}`}
                  onClick={() => handleSelectResult(result)}
                >
                  <div className="card-top">
                    <div className="card-title">
                      <span className={`file-type-icon ${fileType.class}`}>{fileType.label}</span>
                      <span className="bold">{fileName}</span>
                    </div>
                    <span className={`type-badge ${result.type}`}>
                      {result.type}
                    </span>
                  </div>
                  <div className="card-path">{result.path}</div>
                  <div className="card-snippet" style={{maxHeight: '60px', overflow: 'hidden'}}>
                    <div className="snippet-line">
                      <span className="code-text" style={{whiteSpace: 'pre-wrap'}}>{result.content.split('\\n')[0]}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            
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
