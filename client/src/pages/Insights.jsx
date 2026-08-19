/**
 * Insights.jsx — Placement Readiness Insights (formerly Analyze.jsx)
 *
 * Compares candidate skills against actual verified company interview statistics.
 */

import { useEffect, useState } from 'react';
import { api } from '../api';
import { BarChart, Citation, Tile } from '../components';

const TAXONOMY = [
  'DP', 'Arrays', 'Strings', 'Graphs', 'Trees', 'LinkedList', 'Recursion',
  'Greedy', 'SlidingWindow', 'BinarySearch', 'OOPs', 'DBMS', 'OS', 'Networks',
  'SystemDesign', 'Aptitude', 'Behavioral', 'Projects',
];

export default function Insights() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('Amazon');
  const [role, setRole] = useState('SDE-1');
  const [skills, setSkills] = useState(['Arrays', 'OOPs', 'Trees']);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.companies().then(setCompanies).catch(() => {});
  }, []);

  const toggleSkill = (t) =>
    setSkills(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t]);

  async function handleAnalyze(e) {
    e?.preventDefault();
    if (!skills.length) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      setData(await api.analyze({ company, role, skills, mode: 'fixed' }));
    } catch (err) {
      setError(err.message || 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="insights-page">
      <div className="insights-header">
        <h2>Placement Readiness Insights</h2>
        <p className="sub">
          Compare your current skills against actual verified interview data for your target company.
        </p>
      </div>

      <div className="card insights-card">
        <form onSubmit={handleAnalyze}>
          <div className="grid-2">
            <label className="field">
              <span>Target Company</span>
              <select value={company} onChange={e => setCompany(e.target.value)}>
                {companies.map(c => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
              </select>
            </label>
            <label className="field">
              <span>Target Role</span>
              <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. SDE-1, SDE Intern" />
            </label>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <span className="field-title" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              Select Your Current Skills (from your projects or coursework):
            </span>
            <div className="skills-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TAXONOMY.map(t => (
                <button
                  type="button"
                  key={t}
                  onClick={() => toggleSkill(t)}
                  className={`chip ${skills.includes(t) ? 'good' : ''}`}
                  style={{ cursor: 'pointer', background: skills.includes(t) ? 'var(--emerald-subtle)' : 'none' }}
                >
                  {skills.includes(t) ? '✓ ' : ''}{t}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary" disabled={loading || !skills.length} style={{ marginTop: 14 }}>
            {loading ? 'Generating Insights…' : 'Generate Readiness Insights'}
          </button>
          {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
        </form>
      </div>

      {loading && (
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">Analyzing company interview patterns and computing skill gaps...</p>
        </div>
      )}

      {data && (
        <div className="insights-results">
          <div className="card">
            <div className="tiles">
              <Tile
                label="Readiness Score"
                value={`${data.readinessScore}%`}
                note="Weighted by topic frequency in real interviews"
              />
              <Tile
                label="Critical Skill Gaps"
                value={data.criticalGapCount}
                note="Asked in ≥50% of interviews"
              />
              <Tile
                label="Verified Sample Size"
                value={data.stats.sampleSize}
                note={`Data confidence: ${data.stats.confidence}`}
              />
              <Tile
                label="Typical Rounds"
                value={data.stats.typicalRounds ?? '—'}
                note={data.stats.yearRange ? `${data.stats.yearRange[0]}–${data.stats.yearRange[1]}` : ''}
              />
            </div>
            {data.stats.windowNote && (
              <div className="note" style={{ marginTop: 12 }}>{data.stats.windowNote}</div>
            )}
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>What {data.company} Actually Asks</h3>
              <p className="sub">Frequency counted across {data.stats.sampleSize} verified interview records.</p>
              <BarChart
                rows={data.stats.topicFrequency.slice(0, 10).map(t => ({
                  name: t.topic,
                  value: t.pct,
                  label: `${t.count}/${t.total}`,
                }))}
                max={100}
              />
            </div>

            <div className="card">
              <h3>Your Skill Gaps</h3>
              <p className="sub">Topics frequently asked by {data.company} that are not in your skills list.</p>
              {data.gaps.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  🎉 No major gaps found! Focus on problem-solving speed and mock interviews.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr><th>Topic</th><th>Asked In</th><th>Priority</th></tr>
                  </thead>
                  <tbody>
                    {data.gaps.map(g => (
                      <tr key={g.topic}>
                        <td><strong>{g.topic}</strong></td>
                        <td>{g.askedPct}% <span style={{ color: 'var(--text-muted)' }}>({g.evidence})</span></td>
                        <td><span className={`chip ${g.priority}`}>{g.priority}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card">
            <h3>4-Week Preparation Roadmap</h3>
            <p className="sub">{data.plan.summary}</p>
            <div className="roadmap-list" style={{ marginTop: 12 }}>
              {data.plan.weeks.map(w => (
                <div className="week" key={w.week}>
                  <h4>Week {w.week}: {w.focus}</h4>
                  <div style={{ margin: '6px 0' }}>
                    {(w.topics || []).map(t => <span className="chip" key={t}>{t}</span>)}
                  </div>
                  {w.practice?.length > 0 && (
                    <ul>
                      {w.practice.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Verified Evidence Sources ({data.citations.length} records)</h3>
            <p className="sub">Grounding citations backing this readiness report.</p>
            {data.citations.map(c => <Citation c={c} key={c.id} />)}
          </div>
        </div>
      )}
    </div>
  );
}
