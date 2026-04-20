import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Search, Plus, Edit3, Trash2, X, FileText, ChevronDown, Zap, MousePointer2, GitBranch } from 'lucide-react';
import './ContextsPage.css';
import { apiUrl } from '../api';

const ContextsPage = () => {
  const navigate = useNavigate();
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContext, setSelectedContext] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newContextName, setNewContextName] = useState('');
  const [newContextNotes, setNewContextNotes] = useState('');
  
  // New Modal States
  const [workspaces, setWorkspaces] = useState([]);
  const [association, setAssociation] = useState('');
  const [depth, setDepth] = useState('STANDARD');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [nameError, setNameError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchContexts();
    fetchWorkspaces();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + K for search focus (We can't easily focus without a ref, but we can set up the listener)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector('.search-input')?.focus();
      }
      // Shift + N for new context
      if (e.shiftKey && e.key === 'N') {
        e.preventDefault();
        setIsModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchContexts = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/contexts'));
      const data = await res.json();
      setContexts(data.contexts || []);
      if (data.contexts?.length > 0 && !selectedContext) {
        // Only auto-select if requested or maybe don't auto-select to show empty details state
        // fetchContextDetails(data.contexts[0].id);
      }
    } catch (err) {

    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch(apiUrl('/api/workspaces'));
      const data = await res.json();
      setWorkspaces(data.workspaces || []);
      if (data.workspaces?.length > 0) {
        setAssociation(data.workspaces[0].path);
      }
    } catch (err) {

    }
  };

  const fetchContextDetails = async (id) => {
    try {
      const res = await fetch(apiUrl(`/api/contexts/${id}`));
      const data = await res.json();
      setSelectedContext(data);
    } catch (err) {

    }
  };

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleCreateContext = async (e) => {
    e.preventDefault();
    if (!newContextName.trim()) {
      setNameError(true);
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch(apiUrl('/api/contexts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newContextName, 
          notes: newContextNotes,
          tags,
          association,
          depth
        })
      });
      const data = await res.json();
      setContexts([data, ...contexts]);
      setIsModalOpen(false);
      
      // Reset state
      setNewContextName('');
      setNewContextNotes('');
      setTags([]);
      setDepth('STANDARD');
      setNameError(false);
      
      // Navigate to Dashboard with Context ID
      navigate(`/dashboard?contextId=${data.id}`);
    } catch (err) {

    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteContext = async (id) => {
    if (!window.confirm('Are you sure you want to delete this context?')) return;
    try {
      await fetch(apiUrl(`/api/contexts/${id}`), { method: 'DELETE' });
      const updated = contexts.filter(c => c.id !== id);
      setContexts(updated);
      if (selectedContext?.id === id) {
        setSelectedContext(null);
      }
    } catch (err) {

    }
  };

  const filteredContexts = contexts.filter(c => {
    const nameMatch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const tagMatch = c.tags && JSON.parse(c.tags).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return nameMatch || tagMatch;
  });

  return (
    <div className="contexts-container">
      {/* Main Content Area */}
      <div className="contexts-main">
        {/* Top Toolbar */}
        <div className="contexts-toolbar">
          <div className="page-title">
            <Bookmark size={18} className="title-icon" />
            <span className="bold">Saved Contexts</span>
          </div>
          
          <div className="toolbar-right">
            <div className="search-input-wrapper">
              <Search size={14} className="search-icon" />
              <input 
                type="text" 
                className="search-input" 
                placeholder="Filter contexts... (⌘K)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="primary-sm-btn" onClick={() => setIsModalOpen(true)}>
              <Plus size={14} /> New Context
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="contexts-content-area">
          {loading ? (
            <div className="loading-state">Loading contexts...</div>
          ) : contexts.length === 0 ? (
            <div className="contexts-empty-state">
              <div className="empty-icon-stack">
                <Bookmark size={48} className="base-icon" />
                <div className="plus-badge"><Plus size={20} /></div>
              </div>
              <h3>No saved contexts yet</h3>
              <p>Group files, searches, and terminal outputs into reusable contexts for faster debugging.</p>
              <button className="primary-action-btn" onClick={() => setIsModalOpen(true)}>
                <Zap size={16} /> Create Your First Context
              </button>
              <div className="shortcut-hints">
                <span><kbd>⌘</kbd> <kbd>K</kbd> to search</span>
                <span><kbd>⇧</kbd> <kbd>N</kbd> for a new context</span>
              </div>
            </div>
          ) : (
            <>
              <div className="contexts-filters">
                <button className="filter-select">Sort: Recent <ChevronDown size={14} /></button>
                <button className="filter-tag-btn">Tags</button>
              </div>

              {filteredContexts.length === 0 ? (
                <div className="empty-state">No contexts match your filter.</div>
              ) : (
                <div className="contexts-grid">
                  {filteredContexts.map(c => (
                    <div 
                      key={c.id} 
                      className={`context-card ${selectedContext?.id === c.id ? 'active' : ''}`}
                      onClick={() => fetchContextDetails(c.id)}
                    >
                      <div className="card-header">
                        <div className="card-title-row">
                          <FolderIcon gray={selectedContext?.id !== c.id} />
                          <span className="card-title">{c.name}</span>
                          <button 
                            className="more-btn" 
                            onClick={(e) => { e.stopPropagation(); handleDeleteContext(c.id); }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <span className="card-date">
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <div className="card-tags">
                        {c.tags && JSON.parse(c.tags).map(t => (
                          <span key={t} className="tag">{t}</span>
                        ))}
                      </div>
                      
                      <div className="card-stats">
                        <div className="stat-row">
                          <span>Active Items</span>
                          <span>{c.item_count || 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Status Footer */}
        <div className="status-footer">
          <div className="status-left">
            <span className="status-item ready">System Ready</span>
            <span className="status-item branch"><GitBranch size={12} /> main*</span>
          </div>
          <div className="status-right">
            <span className="status-item">UTF-8</span>
            <span className="status-item">{contexts.length} Contexts</span>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Context Details */}
      <div className="context-details-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">CONTEXT DETAILS</span>
        </div>
        
        {selectedContext ? (
          <div className="sidebar-content-wrapper">
            <div className="details-header">
              <h2>{selectedContext.name}</h2>
              <div className="details-actions">
                <button className="icon-btn"><Edit3 size={16} /></button>
                <button className="icon-btn" onClick={() => handleDeleteContext(selectedContext.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="details-content">
              <div className="section">
                <div className="section-title">NOTES</div>
                <div className="notes-box">
                  {selectedContext.notes || 'No notes provided for this context.'}
                </div>
              </div>

              <div className="section">
                <div className="section-title-row">
                  <div className="section-title">
                    PINNED SNIPPETS ({selectedContext.items?.filter(i => i.type === 'snippet').length || 0})
                  </div>
                </div>
                
                <div className="snippets-list">
                  {selectedContext.items?.filter(i => i.type === 'snippet').map(item => (
                    <div key={item.id} className="snippet-box">
                      <div className="snippet-header">
                        <span className="snippet-path">{item.file_path}</span>
                        <button className="close-btn"><X size={14} /></button>
                      </div>
                      <pre className="snippet-code">
                        {item.code_content}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section">
                <div className="section-title-row">
                  <div className="section-title">
                    FILES ({selectedContext.items?.filter(i => i.type === 'file').length || 0})
                  </div>
                </div>
                
                <div className="files-box">
                  {selectedContext.items?.filter(i => i.type === 'file').map(item => (
                    <div key={item.id} className="file-item">
                      <FileText size={14} className="file-icon" />
                      <span>{item.file_path}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="details-footer">
              <button 
                className="primary-search-btn full-width"
                onClick={() => navigate(`/dashboard?contextId=${selectedContext.id}`)}
              >
                <Search size={16} /> Search with Context
              </button>
            </div>
          </div>
        ) : (
          <div className="sidebar-empty">
            <MousePointer2 size={32} className="empty-pointer-icon" />
            <p>Select a context to view details</p>
          </div>
        )}
      </div>

      {/* New Context Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Context</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateContext}>
              <div className="form-group">
                <label>Context Name <span style={{color: '#ef4444'}}>*</span></label>
                <input 
                  type="text" 
                  autoFocus
                  className={nameError ? 'input-error' : ''}
                  placeholder="e.g., Auth Flow Migration"
                  value={newContextName}
                  onChange={(e) => {
                    setNewContextName(e.target.value);
                    if (e.target.value.trim()) setNameError(false);
                  }}
                  disabled={isCreating}
                />
                {nameError && <span className="error-text">Context name is required</span>}
              </div>

              <div className="form-group">
                <label>Project / Repo Association</label>
                <select 
                  className="select-input"
                  value={association} 
                  onChange={(e) => setAssociation(e.target.value)}
                  disabled={isCreating}
                >
                  <option value="">No association</option>
                  {workspaces.map(ws => (
                    <option key={ws.path} value={ws.path}>{ws.path}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Analysis Depth</label>
                <div className="segmented-control">
                  {['SHALLOW', 'STANDARD', 'SURGICAL'].map(d => (
                    <button 
                      key={d} 
                      type="button"
                      className={`segment-btn ${depth === d ? 'active' : ''}`}
                      onClick={() => setDepth(d)}
                      disabled={isCreating}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tags-input-container">
                  {tags.map(t => (
                    <span key={t} className="tag-pill">
                      {t}
                      <button type="button" onClick={() => handleRemoveTag(t)} disabled={isCreating}><X size={12} /></button>
                    </span>
                  ))}
                  <input 
                    type="text" 
                    className="tag-input"
                    placeholder="Add tag (press Enter)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Investigation Notes (Optional)</label>
                <textarea 
                  placeholder="What is this investigation bucket for?"
                  maxLength={280}
                  value={newContextNotes}
                  onChange={(e) => setNewContextNotes(e.target.value)}
                  disabled={isCreating}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={() => setIsModalOpen(false)} disabled={isCreating}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create Context'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const FolderIcon = ({ gray }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gray ? "var(--text-muted)" : "var(--accent-green)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
);

export default ContextsPage;

