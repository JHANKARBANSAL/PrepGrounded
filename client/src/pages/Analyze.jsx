/**
 * Analyze.jsx — resume/skills + company → stats, gaps, plan, citations
 *
 * Form aur report ek hi page pe hain — alag Report page banane se ek extra
 * navigation step aata jo demo mein waqt kharab karta hai.
 */

import { useEffect, useState } from 'react';
import { api } from '../api';
import { Tile, BarChart, Citation } from '../components';

const TAXONOMY = ['DP','Arrays','Strings','Graphs','Trees','LinkedList','Recursion',
  'Greedy','SlidingWindow','BinarySearch','OOPs','DBMS','OS','Networks',
  'SystemDesign','Aptitude','Behavioral','Projects'];

export default function Analyze() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('Amazon');
  const [role, setRole] = useState('SDE-1');
  const [skills, setSkills] = useState(['Arrays', 'OOPs']);
  const [mode, setMode] = useState('adaptive');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { api.companies().then(setCompanies).catch(() => {}); }, []);

  const toggle = (t) =>
    setSkills(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t]);

  async function run(e) {
    e.preventDefault();
    setLoading(true); setError(null); setData(null);
    try {
      setData(await api.analyze({ company, role, skills, mode }));
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  return (
    <>
      <div className="card">
        <h2>Analyze readiness</h2>
        <p className="sub">
          Apni skills select karo — system inhe company ke counted statistics ke
          against compare karega.
        </p>

        <form onSubmit={run}>
          <div className="grid-3">
            <label className="field">
              <span>Company</span>
              <select value={company} onChange={e => setCompany(e.target.value)}>
                {companies.map(c => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
              </select>
            </label>
            <label className="field">
              <span>Role</span>
              <input value={role} onChange={e => setRole(e.target.value)} />
            </label>
            <label className="field">
              <span>Retrieval mode</span>
              <select value={mode} onChange={e => setMode(e.target.value)}>
                <option value="adaptive">Adaptive λ</option>
                <option value="fixed">Fixed λ</option>
                <option value="baseline">Baseline (cosine only)</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>Your skills — jo aapke resume/projects mein hain</span>
            <div>
              {TAXONOMY.map(t => (
                <button
                  type="button" key={t}
                  onClick={() => toggle(t)}
                  className={`chip ${skills.includes(t) ? 'good' : ''}`}
                  style={{ cursor: 'pointer', background: 'none' }}
                >
                  {skills.includes(t) ? '✓ ' : ''}{t}
                </button>
              ))}
            </div>
          </label>

          <button className="primary" disabled={loading || !skills.length}>
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>

      {loading && <p className="loading">Counting statistics, computing gaps, retrieving evidence…</p>}

      {data && (
        <>
          <div className="card">
            <div className="tiles">
              <Tile label="Readiness" value={`${data.readinessScore}%`}
                    note="weighted by how often each topic is asked" />
              <Tile label="Critical gaps" value={data.criticalGapCount}
                    note="asked in ≥50% of interviews" />
              <Tile label="Sample size" value={data.stats.sampleSize}
                    note={`confidence: ${data.stats.confidence}`} />
              <Tile label="Typical rounds" value={data.stats.typicalRounds ?? '—'}
                    note={data.stats.yearRange ? `${data.stats.yearRange[0]}–${data.stats.yearRange[1]}` : ''} />
            </div>
            {/* Honesty guard ka output — chhupana nahi hai, dikhana hai */}
            <div className="note">{data.stats.windowNote}</div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>What {data.company} actually asks</h2>
              <p className="sub">Counted across {data.stats.sampleSize} interview records — not estimated.</p>
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
              <h2>Your gaps</h2>
              <p className="sub">Topics they ask that your skills don't cover.</p>
              {data.gaps.length === 0 && <p style={{ fontSize: 13 }}>No significant gaps — focus on depth and mocks.</p>}
              <table>
                <thead>
                  <tr><th>Topic</th><th>Asked in</th><th>Priority</th></tr>
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
            </div>
          </div>

          <div className="card">
            <h2>4-week plan</h2>
            <p className="sub">{data.plan.summary}</p>
            {data.plan.weeks.map(w => (
              <div className="week" key={w.week}>
                <h4>Week {w.week}</h4>
                <div className="focus">{w.focus}</div>
                <div>{(w.topics || []).map(t => <span className="chip" key={t}>{t}</span>)}</div>
                {w.practice?.length > 0 && <ul>{w.practice.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  cited: {(w.citations || []).join(', ') || '—'}
                </div>
              </div>
            ))}
            <div className="note">
              {data.plan.confidenceNote}
              {data.plan.groundingCheck && <><br />Grounding check: {data.plan.groundingCheck.note}</>}
              <br />Generated by: <span className="mono">{data.plan.generatedBy}</span>
            </div>
          </div>

          <div className="card">
            <h2>Evidence ({data.citations.length} records)</h2>
            <p className="sub">Har claim in records se aayi hai. Kholo aur khud verify karo.</p>
            {data.citations.map(c => <Citation c={c} key={c.id} />)}
          </div>
        </>
      )}
    </>
  );
}
