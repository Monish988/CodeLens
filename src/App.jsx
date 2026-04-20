import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';

// Pages
import SelectWorkspacePage from './pages/SelectWorkspacePage';
import DashboardPage from './pages/DashboardPage';
import ExplorePage from './pages/ExplorePage';
import HistoryPage from './pages/HistoryPage';
import ContextsPage from './pages/ContextsPage';
import DependencyGraphPage from './pages/DependencyGraphPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SelectWorkspacePage />} />
        
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/contexts" element={<ContextsPage />} />
          <Route path="/dependency" element={<DependencyGraphPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
