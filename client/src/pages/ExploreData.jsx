/**
 * ExploreData.jsx — Interview Experience Library (formerly Experiences.jsx)
 *
 * Allows browsing, searching, and inspecting the approved corpus of 204 records.
 */

import { useEffect, useState } from 'react';
import { api } from '../api';

const TAXONOMY = [
  'DP', 'Arrays', 'Strings', 'Graphs', 'Trees', 'LinkedList', 'Recursion',
  'Greedy', 'SlidingWindow', 'BinarySearch', 'OOPs', 'DBMS', 'OS', 'Networks',
  'SystemDesign', 'Aptitude', 'Behavioral', 'Projects',
];

const BLANK = {
  company: '', role: '', year: new Date().getFullYear(), month: '',
  total_rounds: 1, topics: [], questions: [], outcome: 'unknown',
};

export default function ExploreData() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ company: '', year: '', topic: '' });
  const [companies, setCompanies] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await api.listExperiences({ ...filters, page, limit: 15 });
      setRows(d.items); setTotal(d.total);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, filters]);
  useEffect(() => { api.companies().then(setCompanies).catch(() => {}); }, []);

  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      const body = {
        ...editing,
        year: Number(editing.year),
        month: editing.month ? Number(editing.month) : null,
        total_rounds: Number(editing.total_rounds) || 1,
        questions: typeof editing.questions === 'string'
          ? editing.questions.split('\n').map(s => s.trim()).filter(Boolean)
          : editing.questions,
      };
      if (editing.id) await api.updateExperience(editing.id, body);
      else await api.createExperience(body);
      setEditing(null);
      await load();
      const c = await api.companies(); setCompanies(c);
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this record from verified corpus?')) return;
    try { await api.deleteExperience(id); await load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="explore-page">
      <div className="explore-header">
        <h2>Explore Interview Data</h2>
        <p className="sub">
          Browse the verified library of {total} approved interview experiences across {companies.length} target companies.
        </p>
      </div>

      <div className="card explore-card">
        <div className="filters">
          <label className="field">
            <span>Company</span>
            <select
              value={filters.company}
              onChange={e => { setPage(1); setFilters(f => ({ ...f, company: e.target.value })); }}
            >
              <option value="">All Companies</option>
              {companies.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Year</span>
            <input
              type="number"
              value={filters.year}
              placeholder="e.g. 2025"
              onChange={e => { setPage(1); setFilters(f => ({ ...f, year: e.target.value })); }}
            />
          </label>
          <label className="field">
            <span>Topic</span>
            <select
              value={filters.topic}
              onChange={e => { setPage(1); setFilters(f => ({ ...f, topic: e.target.value })); }}
            >
              <option value="">All Topics</option>
              {TAXONOMY.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button className="btn-primary" onClick={() => setEditing({ ...BLANK })} style={{ height: 38, marginTop: 22 }}>
            + Add Record
          </button>
        </div>

        {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
        {loading ? <p className="loading">Loading records…</p> : (
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Year</th>
                  <th>Role</th>
                  <th>Topics</th>
                  <th>Outcome</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.company}</strong></td>
                    <td>{r.month ? `${r.month}/` : ''}{r.year}</td>
                    <td>{r.role || '—'}</td>
                    <td>{(r.topics || []).slice(0, 4).map(t => <span className="chip" key={t}>{t}</span>)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.outcome}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.source_url ? (
                        <a href={r.source_url} target="_blank" rel="noreferrer" className="source-link">
                          {r.source_site || 'Source'} ↗
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{r.source_site || 'Internal'}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setEditing({
                          ...r, questions: (r.questions || []).join('\n'),
                        })}
                      >
                        Edit
                      </button>{' '}
                      <button className="btn-ghost btn-sm danger" onClick={() => remove(r.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            ← Previous
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Page {page} of {Math.max(1, Math.ceil(total / 15))}
          </span>
          <button className="btn-ghost btn-sm" disabled={page >= Math.ceil(total / 15)} onClick={() => setPage(p => p + 1)}>
            Next →
          </button>
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" onSubmit={save}>
            <h3 style={{ marginTop: 0 }}>{editing.id ? 'Edit Interview Record' : 'Add New Interview Record'}</h3>

            <div className="grid-2">
              <label className="field"><span>Company *</span>
                <input required value={editing.company}
                       onChange={e => setEditing(x => ({ ...x, company: e.target.value }))} /></label>
              <label className="field"><span>Role</span>
                <input value={editing.role || ''}
                       onChange={e => setEditing(x => ({ ...x, role: e.target.value }))} /></label>
              <label className="field"><span>Year *</span>
                <input required type="number" value={editing.year}
                       onChange={e => setEditing(x => ({ ...x, year: e.target.value }))} /></label>
              <label className="field"><span>Month</span>
                <input type="number" min="1" max="12" value={editing.month || ''}
                       onChange={e => setEditing(x => ({ ...x, month: e.target.value }))} /></label>
              <label className="field"><span>Total Rounds</span>
                <input type="number" min="1" value={editing.total_rounds || 1}
                       onChange={e => setEditing(x => ({ ...x, total_rounds: e.target.value }))} /></label>
              <label className="field"><span>Outcome</span>
                <select value={editing.outcome}
                        onChange={e => setEditing(x => ({ ...x, outcome: e.target.value }))}>
                  <option value="selected">selected</option>
                  <option value="rejected">rejected</option>
                  <option value="unknown">unknown</option>
                </select></label>
            </div>

            <label className="field">
              <span>Topics</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {TAXONOMY.map(t => (
                  <button type="button" key={t}
                    className={`chip ${(editing.topics || []).includes(t) ? 'good' : ''}`}
                    style={{ cursor: 'pointer', background: 'none' }}
                    onClick={() => setEditing(x => ({
                      ...x,
                      topics: (x.topics || []).includes(t)
                        ? x.topics.filter(y => y !== t)
                        : [...(x.topics || []), t],
                    }))}>
                    {(editing.topics || []).includes(t) ? '✓ ' : ''}{t}
                  </button>
                ))}
              </div>
            </label>

            <label className="field">
              <span>Questions (one per line)</span>
              <textarea value={editing.questions || ''}
                        onChange={e => setEditing(x => ({ ...x, questions: e.target.value }))} />
            </label>

            {error && <p className="error">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn-primary" type="submit">Save Record</button>
              <button className="btn-ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
