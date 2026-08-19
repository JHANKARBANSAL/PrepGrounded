/**
 * Health.jsx — corpus density vs the drift threshold
 *
 * Ye page jaan-boojh kar aapki sabse badi limitation dikhata hai: koi bhi
 * company abhi drift-analysis threshold pe nahi hai. Chhupane ke bajaye
 * measure karke dikhana zyada credible hai — aur demo mein ek line milti hai:
 * "jab ye bars bhar jaayenge, adaptive λ apne aap valid ho jaayega."
 */

import { useEffect, useState } from 'react';
import { api } from '../api';
import { Tile, BarChart } from '../components';

export default function Health() {
  const [h, setH] = useState(null);
  const [drift, setDrift] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.corpusHealth().then(setH).catch(e => setError(e.message));
    api.drift().then(setDrift).catch(() => {});
  }, []);

  if (error) return <div className="card"><p className="error">{error}</p></div>;
  if (!h) return <p className="loading">Loading corpus health…</p>;

  const years = Object.entries(h.yearDistribution).sort((a, b) => a[0] - b[0]);

  return (
    <>
      <div className="card">
        <h2>Corpus health</h2>
        <p className="sub">Real records only — zero synthetic.</p>
        <div className="tiles">
          <Tile label="Records" value={h.totalRecords} />
          <Tile label="Companies" value={h.distinctCompanies} />
          <Tile label="Years covered" value={h.distinctYears} />
          <Tile label="Drift-ready" value={`${h.companiesDriftReady}/${h.distinctCompanies}`}
                note={`needs ${h.densityTarget} records/year`} />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Records per year</h2>
          <p className="sub">Recency-heavy — log purane interviews kam post karte hain.</p>
          <BarChart rows={years.map(([y, n]) => ({ name: y, value: n }))} />
        </div>

        <div className="card">
          <h2>Sources</h2>
          <p className="sub">Multi-source, taaki ek site ka posting bias corpus pe na chhaye.</p>
          <BarChart rows={Object.entries(h.sourceDistribution)
            .sort((a, b) => b[1] - a[1])
            .map(([s, n]) => ({ name: s, value: n }))} />
        </div>
      </div>

      <div className="card">
        <h2>Drift readiness</h2>
        <p className="sub">
          Adaptive λ ko har company-year pe ~{h.densityTarget} records chahiye.
          Usse neeche drift estimate sampling noise se dominated ho jaata hai.
        </p>
        <BarChart
          rows={h.companies.slice(0, 12).map(c => ({
            name: c.company,
            value: Math.round(c.densityProgress * 100),
            label: `${c.recordsPerYear}/yr`,
          }))}
          max={100}
        />
        <div className="note">
          Abhi <strong>{h.companiesDriftReady}</strong> companies threshold pe hain.
          Layer 7 ki live ingestion corpus badhati rahegi — jab bars bhar jaayenge,
          adaptive λ apne aap valid ho jaayega, koi code change ke bina.
        </div>
      </div>

      {drift && (
        <div className="card">
          <h2>Learned λ per company</h2>
          <p className="sub">{drift.note}</p>
          <table>
            <thead>
              <tr><th>Company</th><th>Records</th><th>Years</th><th>Drift</th><th>λ</th><th>Half-life</th><th>Method</th></tr>
            </thead>
            <tbody>
              {drift.profiles.map(p => (
                <tr key={p.company}>
                  <td><strong>{p.company}</strong></td>
                  <td>{p.sampleSize}</td>
                  <td>{p.years?.length ?? 0}</td>
                  <td>{p.drift}</td>
                  <td>{p.lambda}</td>
                  <td>{p.halfLifeYears}y</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {p.method === 'adaptive_jsd' ? 'measured' : 'fallback'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note"><strong>Caveat:</strong> {drift.caveat}</div>
        </div>
      )}
    </>
  );
}
