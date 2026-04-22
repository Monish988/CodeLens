import React, { useState, useEffect, useRef } from 'react';
import { Bookmark, Search, Plus, Edit3, Trash2, X, FileText, ChevronDown, MousePointer2, Sparkles, Copy, Check } from 'lucide-react';
import './ContextsPage.css';
import { apiUrl } from '../api';

const COLORS = [
  { id: 'green', hex: '#39FF14' },
  { id: 'blue', hex: '#3b82f6' },
  { id: 'purple', hex: '#a855f7' },
  { id: 'orange', hex: '#f97316' },
  { id: 'red', hex: '#ef4444' }
];

export default function ContextsPage() {
  const [contexts, setContexts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('codelens-contexts') || '[]');
    } catch { return []; }
  });
  const [selectedContext, setSelectedContext] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const searchInputRef = useRef(null);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('green');
  const [newFiles, setNewFiles] = useState([]);
  const [newFileInput, setNewFileInput] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [nameError, setNameError] = useState(false);

  // Detail Edit State
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  
  // Right Panel Inputs
  const [addFileInput, setAddFileInput] = useState('');
  const [addSearchInput, setAddSearchInput] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Autocomplete State
  const [fileSuggestions, setFileSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('codelens-contexts', JSON.stringify(contexts));
  }, [contexts]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey || e.shiftKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsCreating(true);
      }
      if (e.key === 'Escape') {
        if (isCreating) setIsCreating(false);
        else setSelectedContext(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreating]);

  // Autocomplete fetch effect
  useEffect(() => {
    if (addFileInput.trim().length < 2) {
      setFileSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl(`/api/files?q=${encodeURIComponent(addFileInput)}`));
        const data = await res.json();
        setFileSuggestions(data.files || []);
        setShowSuggestions(true);
      } catch (err) {
        console.error(err);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [addFileInput]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateSubmit = (e) => {
    if (e) e.preventDefault();
    if (!newName.trim()) {
      setNameError(true);
      return;
    }
    const newContext = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDesc.trim(),
      files: newFiles,
      searches: [],
      notes: newNotes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      color: newColor
    };
    const updated = [newContext, ...contexts];
    setContexts(updated);
    setSelectedContext(newContext);
    setIsCreating(false);
    resetModal();
  };

  const resetModal = () => {
    setNewName('');
    setNewDesc('');
    setNewColor('green');
    setNewFiles([]);
    setNewFileInput('');
    setNewNotes('');
    setNameError(false);
  };

  const handleModalKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleCreateSubmit();
    }
  };

  const handleAddModalFile = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = newFileInput.trim();
      if (val && !newFiles.includes(val)) {
        setNewFiles([...newFiles, val]);
      }
      setNewFileInput('');
    }
  };

  const removeModalFile = (file) => {
    setNewFiles(newFiles.filter(f => f !== file));
  };

  const updateContext = (id, updates) => {
    const updated = contexts.map(c => {
      if (c.id === id) {
        const newC = { ...c, ...updates, updatedAt: new Date().toISOString() };
        if (selectedContext?.id === id) setSelectedContext(newC);
        return newC;
      }
      return c;
    });
    setContexts(updated);
  };

  const deleteContext = (id) => {
    if (window.confirm('Are you sure you want to delete this context?')) {
      const updated = contexts.filter(c => c.id !== id);
      setContexts(updated);
      if (selectedContext?.id === id) setSelectedContext(null);
    }
  };

  // Right Panel Handlers
  const handleAddFileKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, fileSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && fileSuggestions[selectedIndex]) {
        const file = fileSuggestions[selectedIndex].path;
        if (!selectedContext.files.includes(file)) {
          updateContext(selectedContext.id, { files: [...selectedContext.files, file] });
        }
        setAddFileInput('');
        setShowSuggestions(false);
        setSelectedIndex(-1);
      } else if (addFileInput.trim()) {
        const file = addFileInput.trim();
        if (!selectedContext.files.includes(file)) {
          updateContext(selectedContext.id, { files: [...selectedContext.files, file] });
        }
        setAddFileInput('');
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleAddFile = (e) => {
    handleAddFileKeyDown(e);
  };

  const removeFile = (file) => {
    updateContext(selectedContext.id, { files: selectedContext.files.filter(f => f !== file) });
  };

  const handleAddSearch = (e) => {
    if (e.key === 'Enter' && addSearchInput.trim()) {
      const search = addSearchInput.trim();
      if (!selectedContext.searches) selectedContext.searches = [];
      if (!selectedContext.searches.includes(search)) {
        updateContext(selectedContext.id, { searches: [...selectedContext.searches, search] });
      }
      setAddSearchInput('');
    }
  };

  const removeSearch = (search) => {
    updateContext(selectedContext.id, { searches: selectedContext.searches.filter(s => s !== search) });
  };

  const handleNotesBlur = (e) => {
    updateContext(selectedContext.id, { notes: e.target.value });
  };

  const handleGenerateSummary = async () => {
    if (!selectedContext?.files?.length) return;
    setAiSummary('');
    setIsGeneratingSummary(true);
    setCopiedSummary(false);

    let finalSummaryText = '';

    try {
      const res = await fetch(apiUrl('/api/contexts/summary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedContext.files,
          contextName: selectedContext.name
        })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        
        const lines = chunk.split('\n').filter(l => l.startsWith('data:'));
        for (const line of lines) {
          const json = line.replace('data: ', '').trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const token = parsed.choices?.[0]?.delta?.content || '';
            finalSummaryText += token;
            setAiSummary(prev => prev + token);
          } catch {}
        }
      }
    } catch (e) {
      finalSummaryText = 'Error generating summary: ' + e.message;
      setAiSummary(finalSummaryText);
    } finally {
      setIsGeneratingSummary(false);
      updateContext(selectedContext.id, { cachedSummary: finalSummaryText });
    }
  };

  const copySummaryToClipboard = () => {
    navigator.clipboard.writeText(aiSummary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const filteredContexts = contexts.filter(c => 
    c.name.toLowerCase().includes(filterQuery.toLowerCase()) || 
    (c.description || '').toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="contexts-wrapper" onKeyDown={handleModalKeyDown}>
      {/* Center Panel */}
      <div className="contexts-center">
        {/* Toolbar */}
        <div className="c-toolbar">
          <div className="c-toolbar-left">
            <Bookmark size={18} className="text-muted" />
            <span className="c-toolbar-title">Saved Contexts</span>
          </div>
          <div className="c-toolbar-right">
            <div className="c-search-wrapper">
              <Search size={14} className="c-search-icon" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Filter contexts... (⌘K)" 
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="c-search-input"
              />
            </div>
            <button className="btn-new" onClick={() => setIsCreating(true)}>
              <Plus size={14} /> New Context
            </button>
          </div>
        </div>

        {/* Content */}
        {contexts.length === 0 && !loading ? (
          <div className="c-empty">
            <div className="c-empty-icon-wrap">
              <Bookmark size={48} className="c-empty-icon" />
              <div className="c-empty-badge"><Plus size={16} /></div>
            </div>
            <h2 className="c-empty-title">No saved contexts yet</h2>
            <p className="c-empty-desc">Group files, searches, and terminal outputs into reusable contexts for faster debugging.</p>
            <button className="btn-cta" onClick={() => setIsCreating(true)}>
              <Plus size={16} /> Create Your First Context
            </button>
            <div className="c-keyboard-hints">
              <div className="c-hint"><kbd>⌘ K</kbd> to search</div>
              <div className="c-hint"><kbd>↑ N</kbd> for a new context</div>
            </div>
          </div>
        ) : (
          <div className="c-list">
            {filteredContexts.map(c => (
              <div 
                key={c.id} 
                className={`c-card ${selectedContext?.id === c.id ? 'active' : ''}`}
                onClick={() => { setSelectedContext(c); setAiSummary(c.cachedSummary || ''); setIsEditingDetails(false); }}
                style={{ '--card-color': COLORS.find(col => col.id === c.color)?.hex || '#aaff00' }}
              >
                <div className="c-card-bar" />
                <div className="c-card-content">
                  <div className="c-card-top">
                    <span className="c-card-name">{c.name}</span>
                    <span className="c-card-date">{new Date(c.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {c.description && <div className="c-card-desc">{c.description}</div>}
                  <div className="c-card-bottom">
                    <span className="c-card-badge">{c.files?.length || 0} files</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div className="contexts-right">
        <div className="r-header">CONTEXT DETAILS</div>
        
        {!selectedContext ? (
          <div className="r-empty">
            <MousePointer2 size={32} className="r-empty-icon" />
            <span>Select a context to view details</span>
          </div>
        ) : (
          <div className="r-content">
            <div className="r-details-header">
              <div className="r-title-row">
                <div className="r-title-left">
                  <div className="r-color-dot" style={{ backgroundColor: COLORS.find(col => col.id === selectedContext.color)?.hex || '#aaff00' }} />
                  {isEditingDetails ? (
                    <input 
                      type="text" 
                      value={editName} 
                      onChange={e => setEditName(e.target.value)} 
                      onBlur={() => { updateContext(selectedContext.id, { name: editName }); setIsEditingDetails(false); }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                      autoFocus
                      className="r-edit-name"
                    />
                  ) : (
                    <h2 className="r-title-text">{selectedContext.name}</h2>
                  )}
                </div>
                <div className="r-actions">
                  <button className="r-icon-btn" onClick={() => {
                    setIsEditingDetails(!isEditingDetails);
                    setEditName(selectedContext.name);
                    setEditDesc(selectedContext.description || '');
                  }}>
                    <Edit3 size={14} />
                  </button>
                  <button className="r-icon-btn" onClick={() => deleteContext(selectedContext.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              
              {isEditingDetails ? (
                <textarea 
                  className="r-edit-desc"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  onBlur={() => updateContext(selectedContext.id, { description: editDesc })}
                  placeholder="Add a description..."
                />
              ) : (
                <p className="r-desc">{selectedContext.description || <span className="r-muted-italic">No description</span>}</p>
              )}
              
              <div className="r-stats">
                Files: {selectedContext.files?.length || 0} | Searches: {selectedContext.searches?.length || 0}
              </div>
            </div>

            <div className="r-sections">
              <div className="r-section">
                <div className="r-section-label">FILES</div>
                <div className="r-item-list">
                  {(selectedContext.files || []).map((f, i) => (
                    <div key={i} className="r-item">
                      <FileText size={14} className="r-item-icon" />
                      <span className="r-item-text" title={f}>{f}</span>
                      <button className="r-item-remove" onClick={() => removeFile(f)}><X size={14} /></button>
                    </div>
                  ))}
                  <div className="r-file-input-wrapper" ref={dropdownRef}>
                    <input 
                      type="text" 
                      className="r-inline-input" 
                      placeholder="+ Add file..."
                      value={addFileInput}
                      onChange={(e) => {
                        setAddFileInput(e.target.value);
                        setSelectedIndex(-1);
                      }}
                      onKeyDown={handleAddFile}
                    />
                    {showSuggestions && addFileInput.length >= 2 && (
                      <div className="suggestions-dropdown">
                        {fileSuggestions.length === 0 ? (
                          <div className="suggestion-item muted">No files found</div>
                        ) : (
                          fileSuggestions.map((s, i) => (
                            <div 
                              key={i} 
                              className={`suggestion-item ${i === selectedIndex ? 'selected' : ''}`}
                              onClick={() => {
                                if (!selectedContext.files.includes(s.path)) {
                                  updateContext(selectedContext.id, { files: [...selectedContext.files, s.path] });
                                }
                                setAddFileInput('');
                                setShowSuggestions(false);
                              }}
                            >
                              <div className="s-icon">
                                {(s.language === 'jsx' || s.language === 'js') ? <FileText size={12} color="#39FF14" /> :
                                 (s.language === 'ts' || s.language === 'tsx') ? <FileText size={12} color="#3b82f6" /> :
                                 <FileText size={12} color="#facc15" />}
                              </div>
                              <span className="s-name">{s.name || s.path.split('/').pop()}</span>
                              <span className="s-path" title={s.path}>...{s.path.slice(-30)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="r-section">
                <div className="r-section-label">SEARCHES</div>
                <div className="r-item-list">
                  {(selectedContext.searches || []).map((s, i) => (
                    <div key={i} className="r-item">
                      <Search size={14} className="r-item-icon" />
                      <span className="r-item-text" title={s}>{s}</span>
                      <button className="r-item-remove" onClick={() => removeSearch(s)}><X size={14} /></button>
                    </div>
                  ))}
                  <input 
                    type="text" 
                    className="r-inline-input" 
                    placeholder="+ Add search..."
                    value={addSearchInput}
                    onChange={(e) => setAddSearchInput(e.target.value)}
                    onKeyDown={handleAddSearch}
                  />
                </div>
              </div>

              <div className="r-section">
                <div className="r-section-label">NOTES</div>
                <textarea 
                  className="r-notes-input"
                  defaultValue={selectedContext.notes}
                  onBlur={handleNotesBlur}
                  placeholder="Freeform markdown notes..."
                />
              </div>
            </div>

            <div className="r-footer">
              <button 
                className="btn-summary" 
                onClick={handleGenerateSummary} 
                disabled={isGeneratingSummary || !selectedContext?.files?.length}
                title={!selectedContext?.files?.length ? "Add files to this context first" : ""}
              >
                <Sparkles size={16} /> 
                {isGeneratingSummary ? 'Generating...' : (aiSummary ? 'Regenerate Summary' : 'Generate AI Summary')}
              </button>
              {(aiSummary || isGeneratingSummary) && (
                <div className="ai-summary-box">
                  <div className="ai-summary-header">
                    <span className="ai-label"></span>
                    {aiSummary && !isGeneratingSummary && (
                      <button className="btn-copy-summary" onClick={copySummaryToClipboard} title="Copy to clipboard">
                        {copiedSummary ? <Check size={14} color="#39FF14" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                  <div className="ai-summary-content">
                    {aiSummary}
                    {isGeneratingSummary && <span className="blinking-cursor">▋</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {isCreating && (
        <div className="m-backdrop" onClick={() => setIsCreating(false)}>
          <div className="m-container" onClick={e => e.stopPropagation()}>
            <h3 className="m-title">Create New Context</h3>
            
            <div className="m-field">
              <label>Name</label>
              <input 
                type="text" 
                autoFocus
                placeholder="Context name"
                value={newName}
                onChange={e => { setNewName(e.target.value); setNameError(false); }}
                className={nameError ? 'm-input-error' : ''}
              />
            </div>
            
            <div className="m-field">
              <label>Description</label>
              <textarea 
                placeholder="Optional description" 
                rows={3}
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
            </div>
            
            <div className="m-field">
              <label>Color</label>
              <div className="m-colors">
                {COLORS.map(c => (
                  <button 
                    key={c.id} 
                    className={`m-color-btn ${newColor === c.id ? 'selected' : ''}`}
                    style={{ backgroundColor: c.hex }}
                    onClick={() => setNewColor(c.id)}
                    type="button"
                  />
                ))}
              </div>
            </div>
            
            <div className="m-field">
              <label>Add Files</label>
              <div className="m-files-wrapper">
                <div className="m-pills">
                  {newFiles.map(f => (
                    <div key={f} className="m-pill">
                      {f} <X size={12} onClick={() => removeModalFile(f)} className="m-pill-remove" />
                    </div>
                  ))}
                </div>
                <input 
                  type="text" 
                  placeholder="Type path and press Enter..." 
                  value={newFileInput}
                  onChange={e => setNewFileInput(e.target.value)}
                  onKeyDown={handleAddModalFile}
                  className="m-file-input"
                />
              </div>
            </div>
            
            <div className="m-field">
              <label>Notes</label>
              <textarea 
                placeholder="Markdown notes..." 
                rows={3}
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                className="m-notes"
              />
            </div>
            
            <div className="m-actions">
              <button className="btn-cancel" onClick={() => setIsCreating(false)}>Cancel</button>
              <button className="btn-create" onClick={handleCreateSubmit}>Create Context</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
