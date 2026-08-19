/**
 * App.jsx — shell + tab navigation
 *
 * react-router use nahi kiya jaan-boojh kar: 4 pages ke liye ek dependency
 * aur uska setup overhead worth nahi hai. useState kaafi hai.
 */

import { useEffect, useState } from 'react';
import { api } from './api';
import Compare from './pages/Compare';
import Analyze from './pages/Analyze';
import Experiences from './pages/Experiences';
import Health from './pages/Health';
import Staging from './pages/Staging';

// Compare pehle hai kyunki wahi novelty dikhata hai — demo wahin se shuru hoti hai
const PAGES = [
  ['compare', 'Compare', Compare],
  ['analyze', 'Analyze', Analyze],
  ['corpus', 'Corpus', Experiences],
  ['staging', 'Staging Review', Staging],
  ['health', 'Health', Health],
];

export default function App() {
  const [page, setPage] = useState('compare');
  const [health, setHealth] = useState(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setDown(true));
  }, []);

  const Current = PAGES.find(p => p[0] === page)[2];

  return (
    <div className="app">
      <div className="topbar">
        <h1>PrepGrounded</h1>
        <span className="tag">evidence-grounded placement prep</span>
        {health && (
          <span className="tag" style={{ marginLeft: 'auto' }}>
            {health.corpusSize} records · embeddings: {health.embeddingProvider}
          </span>
        )}
      </div>

      {down && (
        <div className="card">
          <p className="error">
            Backend reachable nahi hai. Doosre terminal mein chalao:
            {' '}<code>npm --prefix server start</code>
          </p>
        </div>
      )}

      <nav className="nav">
        {PAGES.map(([key, label]) => (
          <button key={key} onClick={() => setPage(key)}
                  aria-current={page === key ? 'page' : undefined}>
            {label}
          </button>
        ))}
      </nav>

      <Current />
    </div>
  );
}
