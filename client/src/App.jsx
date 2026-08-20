/**
 * App.jsx — Product Navigation Shell
 */

import { useEffect, useState } from 'react';
import { api } from './api';

import Search from './pages/Search';
import Insights from './pages/Insights';
import ExploreData from './pages/ExploreData';
import Research from './pages/Research';
import Staging from './pages/Staging';
import Health from './pages/Health';

const PRIMARY_PAGES = [
  ['search', 'Search', Search],
  ['insights', 'Insights', Insights],
  ['explore', 'Explore Data', ExploreData],
];

const SECONDARY_PAGES = {
  staging: ['Staging Review', Staging],
  health: ['System Health', Health],
};

export default function App() {
  const [page, setPage] = useState('search');
  const [health, setHealth] = useState(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setDown(true));
  }, []);

  // Determine current page component
  let CurrentComponent = Search;
  const prim = PRIMARY_PAGES.find(p => p[0] === page);
  if (prim) {
    CurrentComponent = prim[2];
  } else if (SECONDARY_PAGES[page]) {
    CurrentComponent = SECONDARY_PAGES[page][1];
  }

  return (
    <div className="app">
      {/* Header Bar */}
      <header className="topbar">
        <div className="brand" onClick={() => setPage('search')} style={{ cursor: 'pointer' }}>
          <h1 className="brand-title">PrepGrounded</h1>
          <span className="brand-tag">Evidence-Grounded Placement Preparation</span>
        </div>

        {health && (
          <div className="header-meta">
            <span className="meta-pill">{health.corpusSize} Verified Records</span>
            <span className="meta-pill">{health.companyCount || 33} Companies</span>
          </div>
        )}
      </header>

      {down && (
        <div className="card error-card" style={{ marginBottom: 16 }}>
          <p className="error">
            ⚠️ Search backend is currently unreachable. Make sure the server is running on port 4000.
          </p>
        </div>
      )}

      {/* Main Navigation Bar */}
      <nav className="nav">
        {PRIMARY_PAGES.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            aria-current={page === key ? 'page' : undefined}
            className="nav-item"
          >
            {label}
          </button>
        ))}

        {/* System Admin Quick Access */}
        <div className="nav-secondary">
          <button
            className={`nav-item-sm ${page === 'staging' ? 'active' : ''}`}
            onClick={() => setPage('staging')}
            title="Human Review & Approval Workflow"
          >
            Staging
          </button>
          <button
            className={`nav-item-sm ${page === 'health' ? 'active' : ''}`}
            onClick={() => setPage('health')}
            title="System Health & Diagnostic Status"
          >
            Health
          </button>
        </div>
      </nav>

      {/* Main Active Page Content */}
      <main className="main-content">
        <CurrentComponent onNavigate={(target) => setPage(target)} />
      </main>

      {/* Product Footer */}
      <footer className="product-footer">
        <p>
          <strong>PrepGrounded Engine</strong> — Powered by Semantic Relevance & Temporal Decay.
          {' '}• <button className="link-btn" onClick={() => setPage('research')}>Retrieval Research Lab</button>
          {' '}• <button className="link-btn" onClick={() => setPage('health')}>System Health</button>
        </p>
      </footer>
    </div>
  );
}
