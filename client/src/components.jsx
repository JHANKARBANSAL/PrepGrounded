/**
 * components.jsx — Reusable UI Components for PrepGrounded
 */

import { useState } from 'react';

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
 * BarChart Component
 */
export function BarChart({ rows, max }) {
  const ceiling = max ?? Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="bar-chart">
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
 * ScoreBars Component for Technical Research Views
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

/**
 * EvidenceQualityBadge — User-Facing Evidence Quality Indicator
 *
 * High    -> [ ✓ High-quality evidence ]
 * Medium  -> [ Medium evidence ]
 * Limited -> [ Limited evidence ]
 */
export function EvidenceQualityBadge({ label, breakdown, flags = [] }) {
  if (!label) return null;

  let badgeClass = 'high';
  let badgeText = '✓ High-quality evidence';

  if (label === 'Medium') {
    badgeClass = 'medium';
    badgeText = 'Medium evidence';
  } else if (label === 'Limited') {
    badgeClass = 'limited';
    badgeText = 'Limited evidence';
  }

  // Construct human-readable tooltip explanations based strictly on evidence flags
  const reasons = [];
  if (label === 'High') {
    reasons.push('✓ Source information available');
    reasons.push('✓ Detailed interview structure');
    reasons.push('✓ Topics supported by source text');
  }

  if (flags.includes('unsupported_outcome')) {
    reasons.push('⚠️ Candidate outcome could not be explicitly verified from source text.');
  }
  if (flags.includes('unsupported_topics')) {
    reasons.push('⚠️ Some extracted topics are not explicitly supported by source text.');
  }
  if (flags.includes('sparse_content')) {
    reasons.push('⚠️ Limited source detail is available.');
  }
  if (flags.includes('missing_source_metadata')) {
    reasons.push('⚠️ Source metadata is incomplete.');
  }

  const tooltipTitle = reasons.length ? reasons.join('\n') : `Evidence Quality Tier: ${label}`;

  return (
    <span className={`evidence-badge ${badgeClass}`} title={tooltipTitle}>
      {badgeText}
    </span>
  );
}

/**
 * HumanWhyThisResult — Human-Readable Result Explanation
 */
export function HumanWhyThisResult({ result, companyRecordCount }) {
  const scores = result.scores || result._scores;
  if (!scores) return null;

  const now = new Date().getFullYear();
  const ageYears = result.year ? Math.max(0, now - result.year) : null;

  // Translate recency into human readable copy
  let recencyText = 'Interview from recent years';
  if (ageYears !== null) {
    if (ageYears === 0) recencyText = 'Recent interview — less than a year old';
    else if (ageYears === 1) recencyText = 'Recent interview — about 1 year old';
    else if (ageYears <= 2) recencyText = `Recent interview — about ${ageYears} years old`;
    else recencyText = `Interview experience from ${ageYears} years ago`;
  }

  // Translate similarity score into human readable copy
  const simScore = scores.similarity;
  let simText = 'Partial match';
  if (simScore >= 0.50) simText = 'Strong match for your search';
  else if (simScore >= 0.25) simText = 'Relevant to your search';

  return (
    <details className="why-result-details">
      <summary className="why-summary-btn">
        <span>💡 Why this result?</span>
      </summary>
      <div className="why-details-body">
        <div className="why-bullet">✓ {simText}</div>
        <div className="why-bullet">✓ {recencyText}</div>
        <div className="why-bullet">✓ Grounded evidence from {result.source_site || 'verified post'}</div>

        {companyRecordCount !== null && companyRecordCount < 5 && (
          <div className="why-warning-bullet">
            ⚠️ Note: Limited overall records available for {result.company} ({companyRecordCount} in corpus).
          </div>
        )}

        <div className="tech-debug-box">
          <div className="tech-debug-title">Technical Retrieval Parameters</div>
          <div>Semantic Similarity: <strong>{scores.similarity}</strong></div>
          <div>Recency Score: <strong>{scores.recency}</strong></div>
          <div>Production Score: <strong>{scores.final}</strong></div>
        </div>
      </div>
    </details>
  );
}

/**
 * TrendInsightCard — Progressive Disclosure Company Freshness Insight
 */
export function TrendInsightCard({ company, driftProfile, companyRecordCount }) {
  const [expanded, setExpanded] = useState(false);
  if (!company) return null;

  const lambda = driftProfile?.lambda ?? 0.35;
  const drift = driftProfile?.drift ?? 0.0;
  const halfLife = (Math.log(2) / lambda).toFixed(1);

  return (
    <div className="card trend-insight-card">
      <div className="trend-card-header">
        <div className="trend-title-row">
          <span className="insight-icon">📈</span>
          <span className="trend-title">Interview Trend Insight</span>
        </div>
        <button className="btn-ghost btn-xs" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide Details ▲' : 'Why? Technical Details ▼'}
        </button>
      </div>

      <p className="trend-copy">
        {company}'s interview process and question patterns evolve over time, so newer interview experiences are prioritized in your search.
      </p>

      {expanded && (
        <div className="trend-expanded-details">
          <div className="mono-detail">Measured Drift Index: <strong>{drift}</strong></div>
          <div className="mono-detail">Learned Decay (λ): <strong>{lambda}</strong></div>
          <div className="mono-detail">Estimated Half-life: <strong>~{halfLife} years</strong></div>
          <div className="mono-detail">Corpus Evidence Base: <strong>{companyRecordCount ?? '—'} records</strong></div>
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
        {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer">View Original Post ↗</a>}
        <ScoreBars scores={c.scores} />
      </div>
    </details>
  );
}

export function WhyThisResult(props) {
  return <HumanWhyThisResult {...props} />;
}
