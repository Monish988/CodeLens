import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Search, LayoutGrid, History, Bookmark, Share2, Settings, HelpCircle } from 'lucide-react';
import './Layout.css';

const Layout = () => {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Main Search Dashboard', icon: <Search size={18} /> },
    { path: '/explore', label: 'Explore Workspace', icon: <LayoutGrid size={18} /> },
    { path: '/history', label: 'Search History', icon: <History size={18} /> },
    { path: '/contexts', label: 'Saved Contexts', icon: <Bookmark size={18} /> },
    { path: '/dependency', label: 'Dependency Graph', icon: <Share2 size={18} /> },
  ];

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <Search size={20} className="logo-icon" color="var(--accent-green)" />
          </div>
          <span className="logo-text">CodeLens</span>
        </div>

        <nav className="sidebar-nav">
          <ul>
            {navItems.map((item, index) => (
              <li key={index}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => 
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <NavLink to="/settings" className={({ isActive }) => `settings-btn ${isActive ? 'active' : ''}`}>
            <Settings size={18} />
            <span>Settings & Help</span>
          </NavLink>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
