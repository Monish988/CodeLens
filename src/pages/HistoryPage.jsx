import React from 'react';
import { Clock, Search, Download, Trash2 } from 'lucide-react';
import './HistoryPage.css';

const HistoryPage = () => {
  return (
    <div className="history-container">
      <div className="history-topbar">
        <div className="page-title">
          <Clock size={16} />
          <span className="bold">Search History</span>
        </div>
        
        <div className="history-actions">
          <div className="search-input-wrapper sm">
            <Search size={14} className="search-icon" />
            <input type="text" className="search-input" placeholder="Search history..." />
          </div>
          <button className="action-btn"><Download size={14} /> Export</button>
          <button className="danger-btn"><Trash2 size={14} /> Clear All</button>
        </div>
      </div>

      <div className="history-content">
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-label">TOTAL QUERIES</span>
            <span className="stat-value">1,284</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">SAVED CONTEXTS</span>
            <span className="stat-value">32</span>
          </div>
          
          <div className="time-filters">
            <button className="filter-btn">All Time</button>
            <button className="filter-btn active">Today</button>
            <button className="filter-btn">Last 7 Days</button>
          </div>
        </div>

        <div className="history-list">
          <div className="history-group">
            <h3 className="group-title">Today</h3>
            
            <div className="history-item">
              <div className="item-icon">
                <Search size={14} />
              </div>
              <div className="item-details">
                <div className="item-query-row">
                  <span className="query-text">function authenticateUser</span>
                  <span className="workspace-badge">frontend-monorepo</span>
                </div>
                <div className="item-meta">
                  <span>10:45 AM</span>
                  <span className="dot">•</span>
                  <span>Regex: off</span>
                  <span className="dot">•</span>
                  <span>Case: on</span>
                </div>
              </div>
              <div className="item-results">
                <span className="results-badge">24 results</span>
              </div>
            </div>

            <div className="history-item">
              <div className="item-icon">
                <Search size={14} />
              </div>
              <div className="item-details">
                <div className="item-query-row">
                  <span className="query-text">useMemo OR useCallback</span>
                  <span className="workspace-badge">frontend-monorepo</span>
                </div>
                <div className="item-meta">
                  <span>09:12 AM</span>
                  <span className="dot">•</span>
                  <span>Regex: on</span>
                  <span className="dot">•</span>
                  <span>Case: off</span>
                </div>
              </div>
              <div className="item-results">
                <span className="results-badge">142 results</span>
              </div>
            </div>
          </div>

          <div className="history-group">
            <h3 className="group-title">Yesterday</h3>
            
            <div className="history-item">
              <div className="item-icon">
                <Search size={14} />
              </div>
              <div className="item-details">
                <div className="item-query-row">
                  <span className="query-text">apiClient.get</span>
                  <span className="workspace-badge">backend-services</span>
                </div>
                <div className="item-meta">
                  <span>04:30 PM</span>
                  <span className="dot">•</span>
                  <span>Regex: off</span>
                  <span className="dot">•</span>
                  <span>Case: off</span>
                </div>
              </div>
              <div className="item-results">
                <span className="results-badge gray">8 results</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryPage;
