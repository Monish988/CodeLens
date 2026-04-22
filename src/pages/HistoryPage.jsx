import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Search, Download, Trash2, RotateCcw } from 'lucide-react';
import './HistoryPage.css';

// Utility for dates
const isSameDay = (d1, d2) => 
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

const differenceInDays = (d1, d2) => {
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const formatDateGroup = (date) => {
  const now = new Date();
  if (isSameDay(date, now)) return 'TODAY';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'YESTERDAY';
  
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
};

const groupByDate = (items) => {
  const groups = {};
  items.forEach(item => {
    const d = new Date(item.timestamp);
    const label = formatDateGroup(d);
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });
  return Object.keys(groups).map(label => ({
    label,
    entries: groups[label]
  }));
};

const AnimatedNumber = ({ value }) => {
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseInt(value, 10);
    if (isNaN(end) || end === 0) {
      setDisplayVal(0);
      return;
    }
    
    const duration = 600;
    let startTime = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setDisplayVal(Math.floor(progress * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayVal(end);
      }
    };
    window.requestAnimationFrame(step);
  }, [value]);

  return <>{displayVal.toLocaleString()}</>;
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('codelens-search-history') || '[]'); }
    catch { return []; }
  });
  
  const [savedContextsCount, setSavedContextsCount] = useState(0);
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem('codelens-contexts') || '[]');
      setSavedContextsCount(c.length);
    } catch {}
  }, []);

  const [filterQuery, setFilterQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'today' | '7days'
  const [confirmClear, setConfirmClear] = useState(false);
  
  const searchInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('codelens-search-history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setFilterQuery('');
        setConfirmClear(false);
      }
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        if (e.key === '1') setTimeFilter('all');
        if (e.key === '2') setTimeFilter('today');
        if (e.key === '3') setTimeFilter('7days');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filteredHistory, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codelens-history.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    setHistory([]);
    setConfirmClear(false);
  };

  const deleteEntry = (id, e) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const navigateToSearch = (query) => {
    navigate(`/dashboard?q=${encodeURIComponent(query)}`);
  };

  const filteredHistory = history
    .filter(entry => {
      const qLower = filterQuery.toLowerCase();
      const matchesQuery = (entry.query || '').toLowerCase().includes(qLower) || 
                           (entry.workspace || '').toLowerCase().includes(qLower);
      
      const now = new Date();
      const entryDate = new Date(entry.timestamp);
      
      let matchesTime = true;
      if (timeFilter === 'today') {
        matchesTime = isSameDay(entryDate, now);
      } else if (timeFilter === '7days') {
        matchesTime = differenceInDays(entryDate, now) <= 7;
      }
      
      return matchesQuery && matchesTime;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const grouped = groupByDate(filteredHistory);

  return (
    <div className="h-container">
      {/* Top Bar */}
      <div className="h-topbar">
        <div className="h-title">
          <Clock size={16} />
          <span>Search History</span>
        </div>
        <div className="h-actions">
          <div className="h-search-wrapper">
            <Search size={14} className="h-search-icon" />
            <input 
              ref={searchInputRef}
              type="text" 
              className="h-search-input" 
              placeholder="Search history..." 
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          </div>
          <button className="h-export-btn" onClick={handleExport}>
            <Download size={14} /> Export
          </button>
          
          {confirmClear ? (
            <div className="h-confirm-row">
              <span className="h-confirm-text">Are you sure?</span>
              <button className="h-confirm-yes" onClick={handleClearAll}>Yes, clear</button>
              <button className="h-confirm-no" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          ) : (
            <button className="h-clear-btn" onClick={() => setConfirmClear(true)}>
              <Trash2 size={14} /> Clear All
            </button>
          )}
        </div>
      </div>

      <div className="h-content">
        {/* Stats Row */}
        <div className="h-stats-row">
          <div className="h-stat-card">
            <span className="h-stat-label">TOTAL QUERIES</span>
            <span className="h-stat-value"><AnimatedNumber value={history.length} /></span>
          </div>
          <div className="h-stat-card">
            <span className="h-stat-label">SAVED CONTEXTS</span>
            <span className="h-stat-value"><AnimatedNumber value={savedContextsCount} /></span>
          </div>
          
          <div className="h-time-filters">
            <button 
              className={`h-pill ${timeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTimeFilter('all')}
            >All Time</button>
            <button 
              className={`h-pill ${timeFilter === 'today' ? 'active' : ''}`}
              onClick={() => setTimeFilter('today')}
            >Today</button>
            <button 
              className={`h-pill ${timeFilter === '7days' ? 'active' : ''}`}
              onClick={() => setTimeFilter('7days')}
            >Last 7 Days</button>
          </div>
        </div>

        {/* Empty States */}
        {history.length === 0 ? (
          <div className="h-empty">
            <Clock size={48} className="h-empty-icon" />
            <h3>No search history yet</h3>
            <p>Searches you run will appear here automatically.</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="h-empty">
            <Search size={48} className="h-empty-icon" />
            <h3>No results for "{filterQuery}"</h3>
            <p>Try a different search term or change the time filter.</p>
          </div>
        ) : (
          <div className="h-list">
            {grouped.map(group => (
              <div key={group.label} className="h-group">
                <div className="h-group-header">
                  <span className="h-group-label">{group.label}</span>
                  <div className="h-group-line" />
                </div>
                
                {group.entries.map(entry => (
                  <div key={entry.id} className="h-card" onClick={() => navigateToSearch(entry.query)}>
                    <div className="h-card-left">
                      <Search size={16} className="h-card-icon" />
                    </div>
                    
                    <div className="h-card-center">
                      <div className="h-card-top">
                        <span className="h-query">{entry.query}</span>
                        {entry.workspace && <span className="h-workspace-pill">{entry.workspace}</span>}
                      </div>
                      <div className="h-card-bottom">
                        <span className="h-time">
                          {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="h-dot">•</span>
                        <span className="h-meta">Regex: {entry.regex ? 'on' : 'off'}</span>
                        <span className="h-dot">•</span>
                        <span className="h-meta">Case: {entry.caseSensitive ? 'on' : 'off'}</span>
                      </div>
                    </div>
                    
                    <div className="h-card-right">
                      {entry.resultCount > 0 ? (
                        <span className="h-badge h-badge-green">{entry.resultCount} results</span>
                      ) : (
                        <span className="h-badge h-badge-gray">0 results</span>
                      )}
                      <div className="h-card-hover-actions">
                        <button className="h-icon-btn" onClick={(e) => { e.stopPropagation(); navigateToSearch(entry.query); }} title="Re-run search">
                          <RotateCcw size={14} />
                        </button>
                        <button className="h-icon-btn" onClick={(e) => deleteEntry(entry.id, e)} title="Delete entry">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
