/**
 * Compare.jsx — Production Retrieval Feed with Filter Dropdowns & Optional Benchmark Mode
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
  baseline: 'cosine similarity only — time-blind RAG',
  fixed: 'production retrieval — semantic + recency decay (fixed λ=0.35)',
  adaptive: 'experimental research model — dynamic per-company drift λ',
};

const NOW = new Date().getFullYear();
const YEARS_LIST = ['All years', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];

export default function Compare() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('Amazon');
  const [yearFilter, setYearFilter] = useState('All years');
  const [query, setQuery] = useState('system design rounds and interview process');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [freshnessPref, setFreshnessPref] = useState('balanced');
  const [outcomeFilter, setOutcomeFilter] = useState('any');
  const [showBenchmark, setShowBenchmark] = useState(false); // Hidden by default

  const PREF_DESCRIPTIONS = {
    broad: 'Explore recurring patterns across more years.',
    balanced: 'Balance relevance with recent interview trends.',
    recent: 'Prioritize the latest interview experiences.',
  };

  useEffect(() => {
    api.companies().then(setCompanies).catch(() => {});
  }, []);

  async function run(e) {
    e?.preventDefault();
    setLoading(true); setError(null);
    try {
      setData(await api.compare({
        query,
        company: company || null,
        freshnessPreference: freshnessPref,
        outcomeFilter: outcomeFilter === 'any' ? null : outcomeFilter,
        k: 10,
      }));
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  useEffect(() => { run(); }, [freshnessPref, outcomeFilter]);

  const drift = data?.driftProfile;
  const selectedCompObj = companies.find(c => (c.name || '').toLowerCase() === (data?.company || company || '').toLowerCase());
  const companyRecordCount = selectedCompObj ? selectedCompObj.count : null;

  // Filter production results by year if selected
  const productionArm = data?.arms?.find(a => a.mode === 'fixed');
  let productionResults = productionArm?.results || [];

  if (yearFilter !== 'All years') {
    const targetY = Number(yearFilter);
    productionResults = productionResults.filter(r => r.year === targetY);
  }

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>Interview Search & Analysis</h2>
            <p className="sub">
              Search verified interview experiences powered by <strong>Semantic + Recency</strong>.
            </p>
          </div>
          <button
            type="button"
            className="chip"
            style={{ cursor: 'pointer', fontSize: 12, padding: '6px 12px', background: showBenchmark ? 'var(--primary-subtle, #eff6ff)' : 'none' }}
            onClick={() => setShowBenchmark(!showBenchmark)}
          >
            {showBenchmark ? '📱 Switch to Clean Feed View' : '📊 Benchmark Mode (3 Columns)'}
          </button>
        </div>

        <form onSubmit={run} style={{ marginTop: 14 }}>
          <div className="filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1, minWidth: 260 }}>
              <span>Search Query</span>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search topics, questions, or roles..." />
            </label>

            <label className="field" style={{ minWidth: 160 }}>
              <span>Company</span>
              <select value={company} onChange={e => setCompany(e.target.value)}>
                <option value="">All companies</option>
                {companies.map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
                ))}
              </select>
            </label>

            <label className="field" style={{ minWidth: 130 }}>
              <span>Interview Year</span>
              <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                {YEARS_LIST.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>

            <button className="primary" disabled={loading} style={{ height: 38 }}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted, #6b7280)' }}>
                Freshness Preference
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className={`chip ${freshnessPref === 'broad' ? 'good' : ''}`}
                        style={{ cursor: 'pointer', background: 'none', fontSize: 12 }}
                        onClick={() => setFreshnessPref('broad')}>
                  Broad History
                </button>
                <button type="button" className={`chip ${freshnessPref === 'balanced' ? 'good' : ''}`}
                        style={{ cursor: 'pointer', background: 'none', fontSize: 12 }}
                        onClick={() => setFreshnessPref('balanced')}>
                  Balanced
                </button>
                <button type="button" className={`chip ${freshnessPref === 'recent' ? 'good' : ''}`}
                        style={{ cursor: 'pointer', background: 'none', fontSize: 12 }}
                        onClick={() => setFreshnessPref('recent')}>
                  Recent First
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7280)', marginTop: 4 }}>
                {PREF_DESCRIPTIONS[freshnessPref]}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted, #6b7280)' }}>
                Outcome Filter
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['any', 'selected', 'rejected', 'unknown'].map(opt => (
                  <button key={opt} type="button" className={`chip ${outcomeFilter === opt ? 'good' : ''}`}
                          style={{ cursor: 'pointer', background: 'none', fontSize: 12, textTransform: 'capitalize' }}
                          onClick={() => setOutcomeFilter(opt)}>
                    {opt}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7280)', marginTop: 4 }}>
                Filter candidate result status
              </div>
            </div>
          </div>
        </form>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      </div>

      {data && (
        <>
          {/* ================================================================= */}
          {/* DEFAULT CLEAN SINGLE-COLUMN PRODUCTION FEED VIEW                 */}
          {/* ================================================================= */}
          {!showBenchmark ? (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>
                  Interview Experiences ({productionResults.length} found)
                </h3>
                <span className="tag" style={{ fontSize: 12 }}>
                  Model: Production (Semantic + Recency)
                </span>
              </div>

              {productionResults.length === 0 ? (
                <p style={{ color: 'var(--text-muted, #6b7280)', fontStyle: 'italic', padding: '20px 0' }}>
                  No interview experiences found for the selected company and year filter.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {productionResults.map(r => (
                    <div
                      key={r.id}
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        border: '1px solid var(--border, #e5e7eb)',
                        background: 'var(--bg-card, #ffffff)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>
                          {r.company} <span style={{ fontWeight: 400, opacity: 0.8 }}>— {r.role || 'SDE'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className={`year-badge ${NOW - r.year > 4 ? 'old' : ''}`} style={{ fontSize: 12, padding: '2px 8px' }}>
                            {r.year}
                          </span>
                          <span className="chip" style={{ fontSize: 11, textTransform: 'capitalize', fontWeight: 600 }}>
                            {r.outcome}
                          </span>
                          {r.evidenceLabel && (
                            <span className="chip" style={{ fontSize: 11, background: 'var(--bg-subtle, #f3f4f6)' }}>
                              Quality: {r.evidenceLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="topics" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0' }}>
                        {(r.topics || []).map(t => (
                          <span className="chip" key={t} style={{ fontSize: 11 }}>{t}</span>
                        ))}
                      </div>

                      {r.snippet && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted, #4b5563)', margin: 0, lineHeight: 1.5 }}>
                          "{r.snippet}"
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
                        <WhyThisResult result={r} companyRecordCount={companyRecordCount} isProduction={true} />

                        {r.source_url && (
                          <a href={r.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600 }}>
                            {r.source_site || 'Original Post'} ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ================================================================= */
            /* BENCHMARK COMPARISON MODE (3 COLUMNS)                             */
            /* ================================================================= */
            <>
              <div className="card">
                <h3>Benchmark Diagnostic Metrics</h3>
                <div className="tiles" style={{ marginTop: 10 }}>
                  {data.arms.map(a => (
                    <Tile
                      key={a.mode}
                      label={MODE_LABEL[a.mode]}
                      value={`${a.avgAgeYears}y`}
                      note={`avg age · ${Math.round(a.freshRate * 100)}% fresh · ${Math.round(a.staleRate * 100)}% stale`}
                    />
                  ))}
                </div>
                {drift && (
                  <div className="note" style={{ marginTop: 10 }}>
                    <strong>{data.company}</strong> — measured drift {drift.drift}, learned λ {drift.lambda}
                    {' '}(half-life ~{(Math.log(2) / drift.lambda).toFixed(1)} years),
                    {' '}from {drift.sampleSize} records across {drift.years?.length} years.
                  </div>
                )}
              </div>

              <div className="card">
                <ScoreLegend />
                <div className="grid-3">
                  {data.arms.map(arm => (
                    <div className={`compare-col ${arm.mode === 'fixed' ? 'winner' : ''}`} key={arm.mode}>
                      <h3>{MODE_LABEL[arm.mode]}</h3>
                      <div className="meta">{MODE_SUB[arm.mode]}</div>
                      {arm.results.map(r => (
                        <div className="result" key={r.id}>
                          <div className={`year-badge ${NOW - r.year > 4 ? 'old' : ''}`}>{r.year}</div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{r.company} — {r.role || 'SDE'}</div>
                            <div className="topics">{(r.topics || []).slice(0, 4).join(', ')}</div>
                            <div className="outcome">
                              Outcome: <strong>{r.outcome}</strong> · {r.source_site}
                              {r.evidenceLabel && (
                                <span className="chip" style={{ marginLeft: 6, fontSize: 11 }}>
                                  Quality: {r.evidenceLabel}
                                </span>
                              )}
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
            </>
          )}
        </>
      )}
    </>
  );
}
