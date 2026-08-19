/**
 * store/index.js
 * ------------------------------------------------------------------
 * JSON-file persistence layer.
 *
 * WHY JSON AND NOT POSTGRES (defend this in viva):
 *   The corpus is small (hundreds of records). An exact in-memory cosine
 *   scan over 150 x 256-dim vectors takes well under a millisecond, so an
 *   ANN index would add operational complexity for zero measurable gain.
 *   More importantly, our contribution is a CUSTOM SCORING FUNCTION —
 *   keeping ranking in application code makes it trivial to swap modes and
 *   run ablations, which is the whole experimental design.
 *
 *   The repository layer below is deliberately the only place that touches
 *   storage, so migrating to Postgres + pgvector is a single-file change.
 *   See README "Scaling path" for the equivalent SQL.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const FILES = {
  experiences: path.join(DATA_DIR, 'experiences.json'),
  experiencesReal: path.join(DATA_DIR, 'experiences_real.json'),
  resumes: path.join(DATA_DIR, 'resumes.json'),
  plans: path.join(DATA_DIR, 'plans.json'),
  staging: path.join(DATA_DIR, 'staging.json'),
  ingestionRuns: path.join(DATA_DIR, 'ingestion_runs.json'),
  rejected: path.join(DATA_DIR, 'rejected.json'),
  reviewAudit: path.join(DATA_DIR, 'review_audit.json'),
};

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[store] failed to read ${file}:`, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // write-then-rename so a crash mid-write cannot corrupt the corpus
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/* ------------------------------------------------------------------ */
/* In-memory cache — the corpus is read on every query, written rarely  */
/* ------------------------------------------------------------------ */

let _cache = null;

function loadAll() {
  if (_cache) return _cache;
  _cache = readJson(FILES.experiences, []);
  return _cache;
}

function invalidate() { _cache = null; }

/**
 * Write the corpus back to disk.
 *
 * NOTE: embeddings are stripped before writing. They are derived data —
 * regenerating them is cheap (local provider) and storing 139 x 256 floats
 * in the same file as your source-of-truth records makes the file ~15x
 * larger and impossible to read in a diff. Embeddings live in a separate
 * cache file instead (see corpus.service.js).
 */
function persist() {
  const all = loadAll();
  writeJson(FILES.experiences, all.map(({ embedding, ...rest }) => rest));
  // keep the in-memory cache (with embeddings) — only disk is stripped
}

/* ------------------------------------------------------------------ */
/* Experiences repository (full CRUD)                                  */
/* ------------------------------------------------------------------ */

const experiences = {
  all() { return loadAll(); },

  list({ company, year, topic, source, q, page = 1, limit = 20 } = {}) {
    let rows = loadAll();
    if (company) rows = rows.filter(e => e.company.toLowerCase() === String(company).toLowerCase());
    if (year) rows = rows.filter(e => e.year === Number(year));
    if (source) rows = rows.filter(e => e.source === source);
    if (topic) rows = rows.filter(e => (e.topics || []).some(t => t.toLowerCase() === String(topic).toLowerCase()));
    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter(e => (e.raw_text || '').toLowerCase().includes(needle));
    }
    rows = [...rows].sort((a, b) => (b.year - a.year) || ((b.month || 0) - (a.month || 0)));

    const total = rows.length;
    const start = (Number(page) - 1) * Number(limit);
    return {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)) || 1,
      // never ship 256-dim vectors to the browser
      items: rows.slice(start, start + Number(limit)).map(stripEmbedding),
    };
  },

  get(id) {
    const row = loadAll().find(e => e.id === id);
    return row ? stripEmbedding(row) : null;
  },

  getRaw(id) { return loadAll().find(e => e.id === id) || null; },

  create(payload) {
    const all = loadAll();
    const row = {
      id: payload.id || `usr_${crypto.randomBytes(6).toString('hex')}`,
      company: payload.company,
      role: payload.role || null,
      year: Number(payload.year),
      month: payload.month ? Number(payload.month) : null,
      rounds: payload.rounds || [],
      total_rounds: payload.total_rounds || (payload.rounds || []).length || null,
      topics: payload.topics || [],
      questions: payload.questions || [],
      difficulty: payload.difficulty || null,
      outcome: payload.outcome || 'unknown',
      raw_text: payload.raw_text || '',
      source: payload.source || 'user',
      source_url: payload.source_url || null,
      embedding: payload.embedding || null,
      created_at: new Date().toISOString(),
    };
    all.push(row);
    persist();
    return stripEmbedding(row);
  },

  update(id, patch) {
    const all = loadAll();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch, id, updated_at: new Date().toISOString() };
    persist();
    return stripEmbedding(all[idx]);
  },

  remove(id) {
    const all = loadAll();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    persist();
    return true;
  },

  companies() {
    const set = {};
    for (const e of loadAll()) {
      set[e.company] = set[e.company] || { name: e.company, count: 0, minYear: e.year, maxYear: e.year };
      set[e.company].count++;
      set[e.company].minYear = Math.min(set[e.company].minYear, e.year);
      set[e.company].maxYear = Math.max(set[e.company].maxYear, e.year);
    }
    return Object.values(set).sort((a, b) => b.count - a.count);
  },
};

function stripEmbedding(row) {
  const { embedding, ...rest } = row;
  return { ...rest, hasEmbedding: Array.isArray(embedding) && embedding.length > 0 };
}

/* ------------------------------------------------------------------ */
/* Generic collections (resumes, plans)                                */
/* ------------------------------------------------------------------ */

function collection(file) {
  return {
    list(filterFn) {
      const rows = readJson(file, []);
      return filterFn ? rows.filter(filterFn) : rows;
    },
    get(id) { return readJson(file, []).find(r => r.id === id) || null; },
    create(payload) {
      const rows = readJson(file, []);
      const row = { id: `${crypto.randomBytes(8).toString('hex')}`, created_at: new Date().toISOString(), ...payload };
      rows.push(row);
      writeJson(file, rows);
      return row;
    },
    update(id, patch) {
      const rows = readJson(file, []);
      const i = rows.findIndex(r => r.id === id);
      if (i === -1) return null;
      rows[i] = { ...rows[i], ...patch, id };
      writeJson(file, rows);
      return rows[i];
    },
    remove(id) {
      const rows = readJson(file, []);
      const i = rows.findIndex(r => r.id === id);
      if (i === -1) return false;
      rows.splice(i, 1);
      writeJson(file, rows);
      return true;
    },
  };
}

module.exports = {
  experiences,
  resumes: collection(FILES.resumes),
  plans: collection(FILES.plans),
  staging: collection(FILES.staging),
  ingestionRuns: collection(FILES.ingestionRuns),
  rejected: collection(FILES.rejected),
  reviewAudit: collection(FILES.reviewAudit),
  invalidate,
  persist,
  FILES,
};
