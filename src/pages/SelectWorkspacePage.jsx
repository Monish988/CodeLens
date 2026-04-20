import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderPlus, FolderOpen, Lock } from 'lucide-react';
import './SelectWorkspacePage.css';
import { apiUrl } from '../api';

const SelectWorkspacePage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Waiting for folder...');
  const [stats, setStats] = useState({ queued: 0, parsing: 0, ready: 0 });
  const [isIndexing, setIsIndexing] = useState(false);
  const [eventSource, setEventSource] = useState(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [backendReady, setBackendReady] = useState(true);
  const [backendMessage, setBackendMessage] = useState('');

  useEffect(() => {
    fetch(apiUrl('/api/workspaces'))
      .then(res => res.json())
      .then(data => {
        setBackendReady(true);
        setBackendMessage('');
        if (data.workspaces) setRecentWorkspaces(data.workspaces);
      })
      .catch(err => {

        setBackendReady(false);
        setBackendMessage('Backend is not reachable. Start it with: npm run server');
      });

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [eventSource]);

  // ── Drag & Drop ────────────────────────────────────────────────────────

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDialogError('');

    // Method 1: FileSystem Entry API (Electron / Vite desktop builds expose real paths)
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;

        if (entry && entry.isDirectory) {
          const file = item.getAsFile();
          // In Electron / Vite-node builds, File.path is the real filesystem path
          const realPath = file?.path || null;
          if (realPath && realPath.startsWith('/')) {
            triggerIndex(realPath);
            return;
          }
        }

        if (entry && entry.isFile) {
          const file = item.getAsFile();
          if (file?.path && file.path.startsWith('/')) {
            // Dropped a file — use its parent directory
            const dir = file.path.split('/').slice(0, -1).join('/');
            if (dir) { triggerIndex(dir); return; }
          }
        }
      }
    }

    // Method 2: DataTransfer.files fallback
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const f = files[0];
      if (f.path && f.path.startsWith('/')) {
        const parts = f.path.split('/');
        // If no extension or name matches a directory heuristic, use as-is
        const looksLikeDir = !parts[parts.length - 1].includes('.');
        const dir = looksLikeDir ? f.path : parts.slice(0, -1).join('/');
        if (dir) { triggerIndex(dir); return; }
      }
    }

    // Method 3: Try to read from dataTransfer text (some OS/browser combos)
    const text = e.dataTransfer?.getData('text/plain');
    if (text && text.trim().startsWith('/')) {
      triggerIndex(text.trim());
      return;
    }

    setDialogError(
      "Couldn't read folder path from the drop. Paste the path in the field below instead."
    );
  };

  // ── Open Folder (native dialog via backend) ─────────────────────────────

  const handleOpenFolder = async () => {
    setDialogError('');
    if (!backendReady) {
      setDialogError(backendMessage || 'Backend is not reachable. Start it with: npm run server');
      return;
    }
    try {
      const pickRes = await fetch(apiUrl('/api/workspace/pick'), { method: 'POST' });
      if (!pickRes.ok) {
        setDialogError('Native dialog unavailable. Please paste the folder path below.');
        return;
      }
      const { path: workspacePath } = await pickRes.json();
      if (!workspacePath) {
        setDialogError('No folder was selected. You can paste the path below.');
        return;
      }
      triggerIndex(workspacePath);
    } catch (err) {

      setDialogError('Could not open folder dialog. Please paste your folder path below.');
    }
  };

  // ── Manual path input ─────────────────────────────────────────────────

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const trimmed = manualPath.trim();
    if (!trimmed) return;
    setDialogError('');
    triggerIndex(trimmed);
  };

  // ── Indexing ──────────────────────────────────────────────────────────

  const triggerIndex = async (workspacePath) => {
    if (!backendReady) {
      setDialogError(backendMessage || 'Backend is not reachable. Start it with: npm run server');
      return;
    }
    try {
      setStatus('Initializing indexer...');
      setIsIndexing(true);
      
      const es = new EventSource(apiUrl('/api/progress'));
      setEventSource(es);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'queued') {
          setStatus('Queued...');
          setStats({ queued: data.totalFiles || 0, parsing: 0, ready: 0 });
        } else if (data.status === 'indexing') {
          setStatus(`Indexing ${data.path}...`);
          setStats(prev => ({ ...prev, parsing: data.processedFiles || 0 }));
        } else if (data.status === 'ready') {
          setStatus('Ready!');
          setStats(prev => ({ ...prev, ready: prev.parsing }));
          es.close();
          setTimeout(() => navigate('/dashboard'), 1000);
        } else if (data.status === 'error') {
          setStatus('Error indexing workspace.');
          es.close();
          setIsIndexing(false);
        }
      };

      const res = await fetch(apiUrl('/api/index'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Failed: ${error.error}`);
        setStatus('Waiting for folder...');
        setIsIndexing(false);
        es.close();
      }
    } catch (err) {

      setStatus('Connection failed.');
      setIsIndexing(false);
    }
  };

  const handleSkip = () => navigate('/dashboard');

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="select-workspace-container">
      <header className="sw-header">
        <div className="logo">
          <div className="logo-icon-container">
            <Search size={16} className="logo-icon" color="var(--accent-green)" />
          </div>
          <span>CodeLens</span>
        </div>
        <div className="sw-steps">
          <span className="step-text">STEP 1 OF 1</span>
          <button className="skip-btn" onClick={handleSkip}>Skip to Demo</button>
        </div>
      </header>

      <main className="sw-main">
        <div className="sw-title-section">
          <h1>Select Workspace</h1>
          <p>
            Choose a folder to index. CodeLens builds a high-performance local graph of your
            codebase for instant search and symbol navigation. All data stays on your machine.
          </p>
        </div>

        <div className="sw-box">

          {/* ── Dropzone ── */}
          <div
            className={`sw-dropzone${isDragging ? ' dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="dropzone-content">
              <div className="drop-icon">
                <FolderPlus
                  size={24}
                  color={isDragging ? 'var(--accent-green)' : 'var(--text-secondary)'}
                />
              </div>
              <h2>{isDragging ? 'Release to Index' : 'Drag & Drop'}</h2>
              <p>{isDragging ? 'folder detected' : 'your project folder here'}</p>

              <div className="divider"><span>OR</span></div>

              <button
                className="open-folder-btn"
                onClick={handleOpenFolder}
                disabled={isIndexing}
                style={{ opacity: isIndexing ? 0.5 : 1 }}
              >
                <FolderOpen size={16} />
                <span>{isIndexing ? 'Indexing...' : 'Open Folder'}</span>
              </button>

              {/* ── Manual path input ── */}
              <form onSubmit={handleManualSubmit} className="manual-path-form">
                <input
                  type="text"
                  className="manual-path-input"
                  placeholder="Or paste folder path: /home/user/my-project"
                  value={manualPath}
                  onChange={e => setManualPath(e.target.value)}
                  disabled={isIndexing}
                />
                <button
                  type="submit"
                  className="manual-path-btn"
                  disabled={isIndexing || !manualPath.trim()}
                >
                  Index
                </button>
              </form>

              {dialogError && (
                <p className="dialog-error">{dialogError}</p>
              )}
              {!backendReady && !dialogError && (
                <p className="dialog-error">{backendMessage}</p>
              )}
            </div>
          </div>

          {/* ── Recent workspaces ── */}
          <div className="sw-recent">
            <h3><HistoryIcon /> RECENT WORKSPACES</h3>
            <ul className="recent-list">
              {recentWorkspaces.map((ws, idx) => {
                const name = ws.path.split('/').pop() || ws.path.split('\\').pop();
                return (
                  <li
                    key={idx}
                    className="recent-item"
                    onClick={() => triggerIndex(ws.path)}
                    style={{ cursor: 'pointer' }}
                  >
                    <FolderOpen size={16} className="recent-icon" />
                    <div className="recent-info">
                      <span className="recent-name">{name}</span>
                      <span className="recent-path">
                        {ws.path.length > 30 ? '...' + ws.path.slice(-30) : ws.path}
                      </span>
                    </div>
                  </li>
                );
              })}
              {recentWorkspaces.length === 0 && (
                <li className="recent-item" style={{ opacity: 0.5 }}>No recent workspaces.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="sw-status">
          <div className="status-indicator">
            <div className={`dot${isIndexing ? ' blink' : ''}`}></div>
            <span>{status}</span>
          </div>
          <div className="status-stats">
            <span>Queued: {stats.queued}</span>
            <span>Parsing: {stats.parsing}</span>
            <span>Ready: {stats.ready}</span>
          </div>
        </div>

        <div className="sw-security">
          <Lock size={14} />
          <span>
            100% Local. ASTs and vector indexes are stored securely in{' '}
            <code className="inline-code">~/.codelens/cache</code>
          </span>
        </div>
      </main>

      <footer className="sw-footer">
        <button className="back-btn">Back</button>
        <button className="next-btn" disabled>Next: Configure Ignore Rules</button>
      </footer>
    </div>
  );
};

const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

export default SelectWorkspacePage;
