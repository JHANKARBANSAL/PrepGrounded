/**
 * Research.jsx — Retrieval Research Lab (Technical Evaluator & Benchmark Comparison)
 *
 * Exposes the 3-arm comparison (Baseline vs Production vs Experimental Adaptive λ).
 */

import { useEffect, useState } from 'react';
import { api } from '../api';
import { ScoreBars, ScoreLegend, Tile, WhyThisResult } from '../components';

const MODE_LABEL = {
  baseline: 'Baseline (Semantic Only)',
  fixed: 'Production (Semantic + Recency)',
  adaptive: 'Experimental (Adaptive λ)',
};
const MODE_SUB = {
  baseline: 'Cosine similarity only — time-blind RAG baseline',
  fixed: 'Production retrieval — semantic + recency decay (fixed λ=0.35)',
  adaptive: 'Experimental research model — dynamic per-company drift λ',
};

const NOW = new Date().getFullYear();

export default function Research({ onNavigate }) {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('Amazon');
  const [query, setQuery] = useState('system design rounds and interview process');
  const [freshnessPref, setFreshnessPref] = useState('balanced');
  const [outcomeFilter, setOutcomeFilter] = useState('any');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.companies().then(setCompanies).catch(() => {});
  }, []);

  async function runResearch(e) {
    e?.preventDefault();
    setLoading(true); setError(null);
    try {
      setData(await api.compare({
        query: query.trim(),
        company: company || null,
        freshnessPreference: freshnessPref,
        outcomeFilter: outcomeFilter === 'any' ? null : outcomeFilter,
        k: 10,
      }));
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  useEffect(() => { runResearch(); }, [company, freshnessPref, outcomeFilter]);

  const drift = data?.driftProfile;
  const selectedCompObj = companies.find(c => (c.name || '').toLowerCase() === (data?.company || company || '').toLowerCase());
  const companyRecordCount = selectedCompObj ? selectedCompObj.count : null;

  return (
    <div className="research-page">
      {/* Header */}
      <div className="research-header">
        <div>
          <h2>Retrieval Research Lab</h2>
          <p className="sub">
            See how time-aware retrieval changes interview recommendations across 3 model arms.
          </p>
        </div>
        <div className="admin-links">
          {onNavigate && (
            <>
              <button className="btn-ghost btn-sm" onClick={() => onNavigate('staging')}>
                🛠️ Staging Review
              </button>
              <button className="btn-ghost btn-sm" onClick={() => onNavigate('health')}>
                🩺 System Health
              </button>
            </>
          )}
        </div>
      </div>

      {/* Top Model Performance Summary Card */}
      {data && (
        <div className="card summary-banner">
          <h4>Multi-Arm Model Comparison Summary</h4>
          <div className="summary-tiles">
            {data.arms.map(a => (
              <div className={`summary-tile ${a.mode === 'fixed' ? 'highlight' : ''}`} key={a.mode}>
                <div className="mode-badge">{a.mode.toUpperCase()}</div>
                <div className="age-val">{a.avgAgeYears} yrs</div>
                <div className="age-label">Average Result Age</div>
                <div className="rates">
                  {Math.round(a.freshRate * 100)}% fresh (≤2y) · {Math.round(a.staleRate * 100)}% stale (&gt;4y)
                </div>
              </div>
            ))}
          </div>
          <p className="summary-footer-text">
            💡 Production retrieval prioritizes newer evidence while preserving semantic relevance.
          </p>
        </div>
      )}

      {/* Research Controls */}
      <div className="card research-card">
        <form onSubmit={runResearch}>
          <div className="filters">
            <label className="field" style={{ flex: 1, minWidth: 260 }}>
              <span>Search Query</span>
              <input value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <label className="field" style={{ minWidth: 160 }}>
              <span>Company</span>
              <select value={company} onChange={e => setCompany(e.target.value)}>
                <option value="">All Companies</option>
                {companies.map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
                ))}
              </select>
            </label>
            <button className="btn-primary" disabled={loading} style={{ height: 38, marginTop: 22 }}>
              {loading ? 'Running Benchmark…' : 'Run Benchmark'}
            </button>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      {/* Benchmark Grid (3 Columns) */}
      {data && (
        <div className="card research-grid-card">
          <div className="benchmark-header">
            <h3>Side-by-Side Model Retrieval Breakdown</h3>
            <ScoreLegend />
          </div>

          <div className="grid-3">
            {data.arms.map(arm => (
              <div className={`compare-col ${arm.mode === 'fixed' ? 'winner' : ''}`} key={arm.mode}>
                <div className="col-header">
                  <span className={`arm-tag ${arm.mode}`}>
                    {arm.mode === 'fixed' ? 'PRODUCTION' : arm.mode === 'adaptive' ? 'EXPERIMENTAL' : 'BASELINE'}
                  </span>
                  <h3>{MODE_LABEL[arm.mode]}</h3>
                  <div className="meta">{MODE_SUB[arm.mode]}</div>
                  {arm.mode === 'adaptive' && (
                    <div className="exp-warning">
                      ⚠️ Research experiment — not used for production ranking.
                    </div>
                  )}
                </div>

                {arm.results.map(r => (
                  <div className="result" key={r.id}>
                    <div className={`year-badge ${NOW - r.year > 4 ? 'old' : ''}`}>{r.year}</div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.company} — {r.role || 'SDE'}</div>
                      <div className="topics">{(r.topics || []).slice(0, 4).join(', ')}</div>
                      <div className="outcome">
                        Outcome: <strong>{r.outcome}</strong> · {r.source_site}
                      </div>
                      <ScoreBars scores={r.scores} hideOutcome={arm.mode === 'fixed'} />
                      <WhyThisResult result={r} modeLabel={MODE_LABEL[arm.mode]} companyRecordCount={companyRecordCount} isProduction={arm.mode === 'fixed'} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
