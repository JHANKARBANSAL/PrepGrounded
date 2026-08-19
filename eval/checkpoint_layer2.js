/**
 * eval/checkpoint_layer2.js — CRUD write path ka gate
 * Run: node eval/checkpoint_layer2.js
 *
 * Ye teen cheezein prove karta hai jo normal CRUD test nahi karte:
 *   1. naya record save hote hi SEARCHABLE ho jaata hai (auto-embed)
 *   2. edit karne pe re-embed hota hai, aur naya content search mein reflect hota hai
 *   3. record add/delete karne pe DRIFT recompute hota hai (cache invalidation)
 *
 * Server chalu nahi karta — app ko import karke supertest-style calls karta hai.
 */

process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';

const app = require('../server/src/app');
const corpus = require('../server/src/services/corpus.service');
const store = require('../server/src/store');

const PORT = 4999;

const api = (path, opts = {}) =>
  fetch(`http://localhost:${PORT}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(async r => ({ status: r.status, body: await r.json() }));

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

(async () => {
  await corpus.warmup();
  const server = app.listen(PORT);

  console.log('\n' + '='.repeat(62));
  console.log('  CHECKPOINT LAYER 2 — CRUD write path');
  console.log('='.repeat(62) + '\n');

  const before = store.experiences.all().length;
  const driftBefore = corpus.getDriftProfiles()['Amazon']?.lambda;

  // ---------- 1. VALIDATION reject karta hai? ----------
  console.log('  VALIDATION');
  const badYear = await api('/api/experiences', {
    method: 'POST',
    body: { company: 'Amazon', year: 1850, topics: ['DP'] },
  });
  check('galat year reject hua', badYear.status === 400, badYear.body.details?.[0]);

  const badTopic = await api('/api/experiences', {
    method: 'POST',
    body: { company: 'Amazon', year: 2025, topics: ['Dynamic Programming'] },
  });
  check('vocabulary ke bahar ka topic reject hua', badTopic.status === 400);

  const noCompany = await api('/api/experiences', {
    method: 'POST',
    body: { year: 2025, topics: ['DP'] },
  });
  check('company missing reject hua', noCompany.status === 400);

  // ---------- 2. CREATE + turant searchable ----------
  console.log('\n  CREATE');
  const created = await api('/api/experiences', {
    method: 'POST',
    body: {
      company: 'Amazon',
      role: 'SDE-1',
      year: 2026,
      month: 8,
      total_rounds: 2,
      rounds: [
        { round_number: 1, round_type: 'DSA', topics: ['SlidingWindow'],
          questions: ['Zigzag conversion of matrix'], difficulty: 'medium' },
      ],
      topics: ['SlidingWindow'],
      questions: ['Zigzag conversion of matrix'],
      outcome: 'selected',
    },
  });
  check('record create hua', created.status === 201, created.body.id);
  check('corpus size badha', store.experiences.all().length === before + 1);

  // Ek bilkul unique phrase se search — agar embedding bani hai toh ye milega
  const search = await api('/api/retrieve', {
    method: 'POST',
    body: { query: 'Zigzag conversion of matrix', company: 'Amazon', mode: 'baseline', k: 3 },
  });
  const found = search.body.results?.some(r => r.id === created.body.id);
  check('naya record TURANT searchable hai (auto-embed)', found,
        found ? `top-${search.body.results.findIndex(r => r.id === created.body.id) + 1}` : 'nahi mila');

  // ---------- 3. DRIFT recompute hua? ----------
  console.log('\n  CACHE INVALIDATION');
  const driftAfter = corpus.getDriftProfiles()['Amazon']?.lambda;
  check('Amazon ka lambda recompute hua', driftBefore !== driftAfter,
        `${driftBefore} → ${driftAfter}`);

  // ---------- 4. UPDATE + re-embed ----------
  console.log('\n  UPDATE');
  const updated = await api(`/api/experiences/${created.body.id}`, {
    method: 'PUT',
    body: { topics: ['Graphs'], questions: ['Rotten oranges variant on hexagonal grid'] },
  });
  check('update hua', updated.status === 200);
  check('content badla toh re-embed hua', updated.body._reEmbedded === true);

  const search2 = await api('/api/retrieve', {
    method: 'POST',
    body: { query: 'hexagonal grid rotten oranges', company: 'Amazon', mode: 'baseline', k: 3 },
  });
  check('naya content search mein reflect hua',
        search2.body.results?.some(r => r.id === created.body.id));

  // Sirf metadata badlo — re-embed NAHI hona chahiye
  const metaOnly = await api(`/api/experiences/${created.body.id}`, {
    method: 'PUT',
    body: { source_url: 'https://example.com/changed' },
  });
  check('sirf metadata badla toh re-embed SKIP hua', metaOnly.body._reEmbedded === false);

  // ---------- 5. DELETE ----------
  console.log('\n  DELETE');
  const del = await api(`/api/experiences/${created.body.id}`, { method: 'DELETE' });
  check('delete hua', del.status === 200);
  check('corpus size wapas original', store.experiences.all().length === before);

  const missing = await api(`/api/experiences/${created.body.id}`);
  check('deleted record 404 deta hai', missing.status === 404);

  // ---------- 6. READ / filters ----------
  console.log('\n  READ + FILTERS');
  const list = await api('/api/experiences?company=Amazon&limit=5');
  check('company filter kaam kar raha', list.body.items?.every(r => r.company === 'Amazon'),
        `${list.body.total} total`);
  check('pagination kaam kar rahi', list.body.items?.length <= 5);
  check('embedding response mein LEAK nahi hui', !('embedding' in (list.body.items?.[0] || {})));

  const health = await api('/api/corpus/health');
  check('corpus health endpoint chalu hai', health.status === 200,
        `${health.body.totalRecords} records, ${health.body.companiesDriftReady} drift-ready`);

  // ---------- summary ----------
  console.log('\n' + '='.repeat(62));
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('='.repeat(62) + '\n');

  server.close();
  process.exit(fail > 0 ? 1 : 0);
})();
