/**
 * Experiences.jsx — corpus pe CRUD
 *
 * Demo tip: yahan ek naya record add karo, phir Compare page pe jaake usi
 * ka koi unique word search karo — wo turant top pe aayega. Isse dikhta hai
 * ki write path pe embedding ban rahi hai, query time pe nahi.
 */

import { useEffect, useState } from 'react';
import { api } from '../api';

const TAXONOMY = ['DP','Arrays','Strings','Graphs','Trees','LinkedList','Recursion',
  'Greedy','SlidingWindow','BinarySearch','OOPs','DBMS','OS','Networks',
  'SystemDesign','Aptitude','Behavioral','Projects'];

const BLANK = {
  company: '', role: '', year: new Date().getFullYear(), month: '',
  total_rounds: 1, topics: [], questions: [], outcome: 'unknown',
};

export default function Experiences() {
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
    if (!confirm('Delete this record? Isse company ka λ recompute hoga.')) return;
    try { await api.deleteExperience(id); await load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <>
      <div className="card">
        <h2>Corpus — {total} records</h2>
        <p className="sub">
          Naya record add karte hi wo embed hokar searchable ho jaata hai,
          aur us company ka λ recompute ho jaata hai.
        </p>

        <div className="filters">
          <label className="field">
            <span>Company</span>
            <select value={filters.company}
                    onChange={e => { setPage(1); setFilters(f => ({ ...f, company: e.target.value })); }}>
              <option value="">All</option>
              {companies.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Year</span>
            <input type="number" value={filters.year} placeholder="any"
                   onChange={e => { setPage(1); setFilters(f => ({ ...f, year: e.target.value })); }} />
          </label>
          <label className="field">
            <span>Topic</span>
            <select value={filters.topic}
                    onChange={e => { setPage(1); setFilters(f => ({ ...f, topic: e.target.value })); }}>
              <option value="">All</option>
              {TAXONOMY.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button className="primary" onClick={() => setEditing({ ...BLANK })}>+ Add record</button>
        </div>

        {error && <p className="error">{error}</p>}
        {loading ? <p className="loading">Loading…</p> : (
          <table>
            <thead>
              <tr><th>Company</th><th>Year</th><th>Role</th><th>Topics</th><th>Outcome</th><th>Source</th><th /></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.company}</strong></td>
                  <td>{r.month ? `${r.month}/` : ''}{r.year}</td>
                  <td>{r.role || '—'}</td>
                  <td>{(r.topics || []).slice(0, 5).map(t => <span className="chip" key={t}>{t}</span>)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.outcome}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {r.source_url
                      ? <a href={r.source_url} target="_blank" rel="noreferrer">{r.source_site}</a>
                      : r.source_site}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="ghost" onClick={() => setEditing({
                      ...r, questions: (r.questions || []).join('\n'),
                    })}>Edit</button>{' '}
                    <button className="ghost danger" onClick={() => remove(r.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Page {page} of {Math.max(1, Math.ceil(total / 15))}
          </span>
          <button className="ghost" disabled={page >= Math.ceil(total / 15)} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" onSubmit={save}>
            <h2 style={{ marginTop: 0 }}>{editing.id ? 'Edit record' : 'New record'}</h2>

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
              <label className="field"><span>Total rounds</span>
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
              <span>Topics * — sirf controlled vocabulary se</span>
              <div>
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
              <span>Questions — ek line mein ek</span>
              <textarea value={editing.questions || ''}
                        onChange={e => setEditing(x => ({ ...x, questions: e.target.value }))} />
            </label>

            {error && <p className="error">{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" type="submit">Save</button>
              <button className="ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
