/**
 * components.jsx — chhote reusable pieces
 */

export function Tile({ label, value, note }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

/**
 * Horizontal bar chart — single series (magnitude), isliye legend ki
 * zaroorat nahi; title hi series ka naam hai. Har bar pe direct label hai.
 */
export function BarChart({ rows, max }) {
  const ceiling = max ?? Math.max(...rows.map(r => r.value), 1);
  return (
    <div>
      {rows.map(r => (
        <div className="bar-row" key={r.name}>
          <div className="name">{r.name}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(r.value / ceiling) * 100}%` }} />
          </div>
          <div className="val">{r.label ?? r.value}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Score breakdown — 3 series, hamesha numeric labels ke saath.
 * Labels optional nahi hain: aqua light surface pe 3:1 se neeche hai,
 * toh identity color-alone nahi carry kar sakti (dataviz relief rule).
 */
export function ScoreBars({ scores, hideOutcome = false }) {
  if (!scores) return null;
  const rows = [
    ['similarity', 'sim', scores.similarity],
    ['recency', 'rec', scores.recency],
    ...(!hideOutcome ? [['outcome', 'out', scores.outcome]] : []),
  ].filter(([, , v]) => v !== null && v !== undefined);

  return (
    <div className="score-bars">
      {rows.map(([label, cls, v]) => (
        <div className="score-bar" key={label}>
          <div className="k">{label}</div>
          <div className="t"><div className={`f ${cls}`} style={{ width: `${Math.min(1, v) * 100}%` }} /></div>
          <div className="v">{typeof v === 'number' ? v.toFixed(2) : v}</div>
        </div>
      ))}
    </div>
  );
}

export function ScoreLegend() {
  return (
    <div className="legend">
      <span className="item"><span className="swatch" style={{ background: 'var(--series-1)' }} />similarity</span>
      <span className="item"><span className="swatch" style={{ background: 'var(--series-2)' }} />recency</span>
      <span className="item"><span className="swatch" style={{ background: 'var(--series-3)' }} />outcome</span>
    </div>
  );
}

export function WhyThisResult({ result, modeLabel, companyRecordCount, isProduction = false, freshnessPreference = 'balanced' }) {
  const scores = result.scores || result._scores;
  if (!scores) return null;

  const now = new Date().getFullYear();
  const ageYears = result.year ? Math.max(0, now - result.year) : null;
  const recencyLabel = ageYears !== null
    ? (ageYears <= 2 ? `Recent interview (${ageYears}y old)` : `${ageYears} years old`)
    : 'Unknown age';

  const simScore = scores.similarity;
  const simLabel = simScore !== null && simScore !== undefined
    ? (simScore >= 0.50 ? 'Strong semantic match' : simScore >= 0.25 ? 'Moderate semantic match' : 'Baseline match')
    : 'N/A';

  const modelName = modeLabel || (isProduction ? 'Production (Semantic + Recency)' : 'Semantic + Recency');

  const pref = result.freshnessPreference || freshnessPreference || 'balanced';
  const PREF_NAMES = { broad: 'Broad History', balanced: 'Balanced', recent: 'Recent First' };
  const prefName = PREF_NAMES[pref] || 'Balanced';
  const lambdaUsed = result.lambdaUsed || scores.lambda || 0.35;

  return (
    <div className="why-result" style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border, #e5e7eb)', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: 'var(--text-muted, #6b7280)', marginBottom: 4 }}>
        Why this result? <span style={{ color: 'var(--primary, #2563eb)' }}>({modelName})</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span className="chip" style={{ fontSize: 11, background: 'var(--bg-subtle, #f3f4f6)' }}>{simLabel} ({scores.similarity})</span>
        <span className="chip" style={{ fontSize: 11, background: 'var(--bg-subtle, #f3f4f6)' }}>{recencyLabel} (recency: {scores.recency})</span>
        {scores.final !== undefined && (
          <span className="chip" style={{ fontSize: 11, background: 'var(--bg-subtle, #f3f4f6)', fontWeight: 600 }}>Score: {scores.final}</span>
        )}
        {companyRecordCount !== undefined && companyRecordCount !== null && companyRecordCount < 5 && (
          <span className="chip" style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', borderColor: '#fde68a' }}>
            ⚠️ Limited evidence ({companyRecordCount} records)
          </span>
        )}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted, #6b7280)' }}>
        Freshness preference: <strong>{prefName}</strong>
        <span style={{ marginLeft: 6, opacity: 0.7 }} title={`Temporal decay λ = ${lambdaUsed}`}> (λ = {lambdaUsed})</span>
      </div>
      {result.source_url && (
        <div style={{ marginTop: 4, fontSize: 11 }}>
          Source: <a href={result.source_url} target="_blank" rel="noreferrer">{result.source_site || 'Original post'} ↗</a>
        </div>
      )}
    </div>
  );
}

export function Citation({ c, companyRecordCount }) {
  return (
    <details className="citation">
      <summary>
        <strong>{c.company}</strong> {c.month || '?'}/{c.year}
        {' · '}<span style={{ textTransform: 'capitalize' }}>{c.outcome}</span>
        {' · '}<span className="mono">{c.id}</span>
      </summary>
      <div className="body">
        <div style={{ marginBottom: 6 }}>{(c.topics || []).map(t => <span className="chip" key={t}>{t}</span>)}</div>
        <p style={{ margin: '6px 0' }}>{c.snippet}</p>
        {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer">view original ↗</a>}
        <ScoreBars scores={c.scores} />
        <WhyThisResult result={c} modeLabel="Semantic + Recency" companyRecordCount={companyRecordCount} />
      </div>
    </details>
  );
}
