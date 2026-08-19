/**
 * client/src/pages/Staging.jsx — Human Review & Approval Interface
 *
 * Provides reviewer interface for staged ingestion candidates:
 *   - Displays staged records pending human review.
 *   - Enables Approve, Reject, and Edit operations.
 *   - On approval: item is promoted to approved corpus, embedded, indexed, and made immediately searchable.
 */

import { useEffect, useState } from 'react';
import { api } from '../api';

const TAXONOMY = ['DP','Arrays','Strings','Graphs','Trees','LinkedList','Recursion',
  'Greedy','SlidingWindow','BinarySearch','OOPs','DBMS','OS','Networks',
  'SystemDesign','Aptitude','Behavioral','Projects'];

export default function Staging() {
  const [staged, setStaged] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);

  async function loadData() {
    setLoading(true); setError(null);
    try {
      const s = await api.stagingList();
      setStaged(s.items || []);
      const a = await api.auditList();
      setAuditLogs(a || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleApprove(id) {
    setMsg(null); setError(null);
    try {
      const res = await api.approveStaged(id);
      setMsg(`Approved! Record promoted to corpus & indexed. (${res.item?.company || 'Record'})`);
      await loadData();
    } catch (e) {
      setError(`Approve failed: ${e.message}`);
    }
  }

  async function handleReject(id) {
    const reason = prompt('Enter rejection reason:', 'Unverified candidate details');
    if (reason === null) return;
    setMsg(null); setError(null);
    try {
      await api.rejectStaged(id, reason);
      setMsg('Record rejected and saved to permanent rejected log.');
      await loadData();
    } catch (e) {
      setError(`Reject failed: ${e.message}`);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setMsg(null); setError(null);
    try {
      await api.editStaged(editing.id, editing);
      setMsg('Staged record updated successfully.');
      setEditing(null);
      await loadData();
    } catch (e) {
      setError(`Edit failed: ${e.message}`);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Staging — Human Review ({staged.length} pending)</h2>
        <p className="sub">
          Review newly ingested interview experiences. Approve to promote records directly into the live searchable index.
        </p>

        {msg && <p style={{ color: 'var(--success, #10b981)', fontWeight: 600 }}>{msg}</p>}
        {error && <p className="error">{error}</p>}

        {loading ? <p className="loading">Loading staged items…</p> : staged.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No pending staged items. All newly ingested records have been reviewed!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {staged.map(item => (
              <div key={item.id} className="card" style={{ border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>
                    {item.company} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>({item.year})</span>
                  </h3>
                  <span className="tag" style={{ fontSize: 11 }}>
                    {item.extraction_method || 'deterministic_grounded_fallback'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--text-muted)', margin: '8px 0' }}>
                  <span>Role: <strong>{item.role || 'SDE'}</strong></span>
                  <span>Outcome: <strong style={{ textTransform: 'capitalize' }}>{item.outcome}</strong></span>
                  <span>Source: <a href={item.source_url} target="_blank" rel="noreferrer">{item.source_site || 'link'}</a></span>
                </div>

                <div className="topics" style={{ marginBottom: 10 }}>
                  {(item.topics || []).map(t => <span key={t} className="chip">{t}</span>)}
                </div>

                <div className="snippet" style={{ fontSize: 12, background: 'var(--bg)', padding: 8, borderRadius: 4, marginBottom: 12 }}>
                  {item.raw_text_preview || (item.raw_text || '').slice(0, 250)}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" onClick={() => handleApprove(item.id)}>✓ Approve & Index</button>
                  <button className="ghost" onClick={() => setEditing({ ...item })}>✎ Edit</button>
                  <button className="ghost danger" onClick={() => handleReject(item.id)}>✕ Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {auditLogs.length > 0 && (
        <div className="card">
          <h2>Review Audit Trail</h2>
          <p className="sub">History of all human review decisions.</p>
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Action</th><th>Record ID</th><th>Company</th><th>Details</th></tr>
            </thead>
            <tbody>
              {auditLogs.slice(0, 10).map(a => (
                <tr key={a.id || a.timestamp}>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(a.timestamp).toLocaleString()}</td>
                  <td><strong style={{ textTransform: 'uppercase', color: a.action === 'approve' ? '#10b981' : a.action === 'reject' ? '#ef4444' : '#3b82f6' }}>{a.action}</strong></td>
                  <td style={{ fontSize: 11 }}>{a.recordId}</td>
                  <td>{a.company || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.reason || (a.newValues ? 'Field values updated' : 'Promoted to corpus')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" onSubmit={saveEdit}>
            <h2 style={{ marginTop: 0 }}>Edit Staged Record</h2>

            <div className="grid-2">
              <label className="field"><span>Company *</span>
                <input required value={editing.company} onChange={e => setEditing(x => ({ ...x, company: e.target.value }))} /></label>
              <label className="field"><span>Role</span>
                <input value={editing.role || ''} onChange={e => setEditing(x => ({ ...x, role: e.target.value }))} /></label>
              <label className="field"><span>Year *</span>
                <input required type="number" value={editing.year} onChange={e => setEditing(x => ({ ...x, year: e.target.value }))} /></label>
              <label className="field"><span>Month</span>
                <input type="number" min="1" max="12" value={editing.month || ''} onChange={e => setEditing(x => ({ ...x, month: e.target.value }))} /></label>
              <label className="field"><span>Outcome</span>
                <select value={editing.outcome} onChange={e => setEditing(x => ({ ...x, outcome: e.target.value }))}>
                  <option value="selected">selected</option>
                  <option value="rejected">rejected</option>
                  <option value="unknown">unknown</option>
                </select></label>
            </div>

            <label className="field">
              <span>Topics</span>
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

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="primary" type="submit">Save Changes</button>
              <button className="ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
