/**
 * Compare.jsx — ⭐ ye page project ka novelty dikhata hai
 *
 * Ek query, teen columns: baseline / fixed / adaptive. Saal jaan-boojh kar
 * bade aur bold hain — 5 saal se purane records red mein. Demo mein examiner
 * ko 5 second mein samajh aa jaata hai ki baseline purane records la raha hai
 * aur aapka scoring naye.
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

export default function Compare() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('Amazon');
  const [query, setQuery] = useState('system design rounds and interview process');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [freshnessPref, setFreshnessPref] = useState('balanced');
  const [outcomeFilter, setOutcomeFilter] = useState('any');

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
        k: 10
      }));
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  useEffect(() => { run(); }, [freshnessPref, outcomeFilter]);   // re-run on preference or filter change

  const drift = data?.driftProfile;

  const selectedCompObj = companies.find(c => (c.name || '').toLowerCase() === (data?.company || company || '').toLowerCase());
  const companyRecordCount = selectedCompObj ? selectedCompObj.count : null;

  return (
    <>
      <div className="card">
        <h2>Retrieval comparison</h2>
        <p className="sub">
          Ek hi query, teen scoring strategies. Production retrieval uses <strong>Semantic + Recency</strong>.
        </p>
        <form onSubmit={run}>
          <div className="filters">
            <label className="field" style={{ flex: 1, minWidth: 280 }}>
              <span>Query</span>
              <input value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <label className="field">
              <span>Company</span>
              <select value={company} onChange={e => setCompany(e.target.value)}>
                <option value="">All companies</option>
                {companies.map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={loading}>{loading ? 'Running…' : 'Compare'}</button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Freshness Preference</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className={`chip ${freshnessPref === 'broad' ? 'good' : ''}`}
                        style={{ cursor: 'pointer', background: 'none' }}
                        onClick={() => setFreshnessPref('broad')}>
                  Broad History
                </button>
                <button type="button" className={`chip ${freshnessPref === 'balanced' ? 'good' : ''}`}
                        style={{ cursor: 'pointer', background: 'none' }}
                        onClick={() => setFreshnessPref('balanced')}>
                  Balanced
                </button>
                <button type="button" className={`chip ${freshnessPref === 'recent' ? 'good' : ''}`}
                        style={{ cursor: 'pointer', background: 'none' }}
                        onClick={() => setFreshnessPref('recent')}>
                  Recent First
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)', marginTop: 4 }}>
                {PREF_DESCRIPTIONS[freshnessPref]}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Outcome Filter</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {['any', 'selected', 'rejected', 'unknown'].map(opt => (
                  <button key={opt} type="button" className={`chip ${outcomeFilter === opt ? 'good' : ''}`}
                          style={{ cursor: 'pointer', background: 'none', textTransform: 'capitalize' }}
                          onClick={() => setOutcomeFilter(opt)}>
                    {opt}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)', marginTop: 4 }}>
                Filter candidate interview result
              </div>
            </div>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      {data && (
        <>
          <div className="card">
            <h3>Diagnostic parameters</h3>
            <div className="mono" style={{ fontSize: 12 }}>
              company: {data.company || 'All'} · freshnessPreference: {data.freshnessPreference} (λ={data.lambdaUsed}) · outcomeFilter: {data.outcomeFilter || 'any'}
            </div>
            {drift && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Learned λ for {drift.company}: <strong>{drift.lambda}</strong> (drift = {drift.drift})
              </div>
            )}
          </div>

          <div className="card">
            <div className="tiles">
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
              <div className="note">
                <strong>{data.company}</strong> — measured drift {drift.drift}, learned λ {drift.lambda}
                {' '}(half-life ~{(Math.log(2) / drift.lambda).toFixed(1)} years),
                {' '}from {drift.sampleSize} records across {drift.years?.length} years.
                {drift.method === 'fallback_insufficient_years' &&
                  ' Not enough years for drift — using the global default λ.'}
                {companyRecordCount !== null && companyRecordCount < 5 && (
                  <div style={{ color: '#b45309', fontWeight: 600, marginTop: 4 }}>
                    ⚠️ Limited evidence for {data.company} ({companyRecordCount} total records in corpus)
                  </div>
                )}
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
                            <span className="chip" style={{ marginLeft: 6, fontSize: 11 }}
                                  title="Based on source provenance, interview structure, topic evidence, and report completeness.">
                              Evidence quality: {r.evidenceLabel} ({r.evidenceQuality})
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
            <div className="note">
              Red saal = 4 saal se purana, yaani us waqt ka hiring process aaj se
              alag hone ki sambhavna hai.
            </div>
          </div>
        </>
      )}
    </>
  );
}
