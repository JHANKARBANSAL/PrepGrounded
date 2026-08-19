/**
 * api.js — backend calls ek jagah.
 * Vite dev server /api ko localhost:4000 pe proxy karta hai (vite.config.js).
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function call(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));

  // Server error ka message throw karo taaki UI usko dikha sake —
  // generic "something went wrong" se kaafi behtar hai
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  health:      ()      => call('/api/health'),
  corpusHealth:()      => call('/api/corpus/health'),
  companies:   ()      => call('/api/corpus/companies'),
  drift:       ()      => call('/api/retrieve/drift'),

  listExperiences: (q = {}) =>
    call('/api/experiences?' + new URLSearchParams(
      Object.entries(q).filter(([, v]) => v !== '' && v != null)
    )),
  createExperience: (body) => call('/api/experiences', { method: 'POST', body }),
  updateExperience: (id, body) => call(`/api/experiences/${id}`, { method: 'PUT', body }),
  deleteExperience: (id) => call(`/api/experiences/${id}`, { method: 'DELETE' }),

  compare: (body) => call('/api/retrieve/compare', { method: 'POST', body }),
  analyze: (body) => call('/api/analyze', { method: 'POST', body }),

  stagingList:   ()           => call('/api/ingest/staging'),
  approveStaged: (id)         => call(`/api/ingest/staging/${id}/approve`, { method: 'POST' }),
  rejectStaged:  (id, reason) => call(`/api/ingest/staging/${id}/reject`, { method: 'POST', body: { reason } }),
  editStaged:    (id, body)   => call(`/api/ingest/staging/${id}`, { method: 'PUT', body }),
  auditList:     ()           => call('/api/ingest/audit'),
};
