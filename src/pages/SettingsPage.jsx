import React from 'react';
import './SettingsPage.css';

const SettingsPage = () => {
  return (
    <div className="settings-container">
      <div className="settings-content">
        
        {/* Mocking the partial top section shown in image */}
        <div className="settings-section">
          <div className="settings-card">
            <div className="card-info">
              <h4>Open Settings</h4>
              <p>Show this configuration panel</p>
            </div>
            <div className="card-action">
              <div className="shortcut-keys">
                <kbd>⌘</kbd>
                <kbd>,</kbd>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="section-title">SEARCH & FILTERING</h3>
          
          <div className="settings-list">
            <div className="settings-card">
              <div className="card-info">
                <h4>Focus Search Input</h4>
                <p>Jump to active search box</p>
              </div>
              <div className="card-action">
                <div className="shortcut-keys">
                  <kbd>/</kbd>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <div className="card-info">
                <h4>Toggle Regex Mode</h4>
                <p>Switch between exact and regex matching</p>
              </div>
              <div className="card-action">
                <div className="shortcut-keys">
                  <kbd>⌘</kbd>
                  <kbd>⌥</kbd>
                  <kbd>R</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsPage;
