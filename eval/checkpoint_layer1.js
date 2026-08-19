/**
 * eval/checkpoint_layer1.js
 * ------------------------------------------------------------------
 * Run:  node eval/checkpoint_layer1.js
 *
 * This is the Layer 1 gate. It answers two questions:
 *
 *   1A. Does the embedding actually capture meaning?
 *       (if not, nothing downstream can work)
 *
 *   1B. Is baseline RAG time-blind on OUR corpus, and does the
 *       recency+outcome scoring measurably fix it?
 *
 * The numbers this prints are your first real result. Screenshot them.
 * ------------------------------------------------------------------
 */

process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';

const corpus = require('../server/src/services/corpus.service');
const store = require('../server/src/store');
const { embed, cosine, provider } = require('../server/src/services/embedding.service');
const { retrieve, WEIGHTS } = require('../server/src/services/retrieval.service');

const NOW = new Date().getFullYear();

// Queries span product + service companies deliberately: the two groups
// have very different topic profiles, so a bug that only shows up on one
// of them (e.g. Aptitude-heavy corpora) would otherwise go unnoticed.
const QUERIES = [
  { q: 'Amazon system design rounds and interview process', c: 'Amazon' },
  { q: 'Microsoft coding round data structures', c: 'Microsoft' },
  { q: 'TCS aptitude and technical interview', c: 'TCS' },
  { q: 'Google DSA interview questions', c: 'Google' },
  { q: 'Infosys technical round questions', c: 'Infosys' },
];

function metrics(records) {
  const ages = records.map(r => NOW - r.year);
  const n = ages.length || 1;
  return {
    avgAge: +(ages.reduce((a, b) => a + b, 0) / n).toFixed(2),
    // Freshness@10: fraction of results from the last 2 years.
    freshness: +(ages.filter(a => a <= 2).length / n).toFixed(2),
    // Staleness@10: fraction older than 4 years — likely a different process.
    staleness: +(ages.filter(a => a > 4).length / n).toFixed(2),
  };
}

(async () => {
  console.log('\n' + '='.repeat(64));
  console.log('  CHECKPOINT 1A — does the embedding capture meaning?');
  console.log('='.repeat(64));

  const a = await embed('dynamic programming and graph questions');
  const b = await embed('DP problems and graph traversal');
  const c = await embed('HR round about teamwork and conflict');

  const related = cosine(a, b);
  const unrelated = cosine(a, c);
  console.log(`  provider                 : ${provider}`);
  console.log(`  related   (DP↔DP)        : ${related.toFixed(4)}`);
  console.log(`  unrelated (DP↔HR)        : ${unrelated.toFixed(4)}`);
  const pass1a = related > unrelated * 1.5;
  console.log(`  verdict                  : ${pass1a ? '✅ PASS' : '❌ FAIL — check stopwords / normalization'}`);

  await corpus.warmup();

  console.log('\n' + '='.repeat(64));
  console.log('  CHECKPOINT 1B — is baseline RAG time-blind?');
  console.log('='.repeat(64));
  console.log(`  scoring weights: sim=${WEIGHTS.similarity} recency=${WEIGHTS.recency} outcome=${WEIGHTS.outcome}`);
  console.log(`  ${QUERIES.length} queries × top-10 = ${QUERIES.length * 10} retrieved records\n`);

  const results = {};
  for (const mode of ['baseline', 'fixed', 'adaptive']) {
    const all = [];
    for (const { q, c } of QUERIES) {
      const qv = await embed(q);
      all.push(...retrieve(qv, store.experiences.all(), {
        mode, company: c, k: 10, driftProfiles: corpus.getDriftProfiles(),
      }));
    }
    results[mode] = metrics(all);
  }

  console.log('  Mode        avgAge   Freshness@10   Staleness@10');
  console.log('  ' + '─'.repeat(50));
  for (const m of ['baseline', 'fixed', 'adaptive']) {
    const r = results[m];
    console.log(`  ${m.padEnd(11)} ${String(r.avgAge).padStart(5)}y ${String(r.freshness).padStart(11)} ${String(r.staleness).padStart(14)}`);
  }

  const B = results.baseline, F = results.fixed;
  const pct = (from, to) => (from === 0 ? 'n/a' : `${to > from ? '+' : ''}${Math.round((to - from) / from * 100)}%`);
  console.log('\n  baseline → fixed:');
  console.log(`    Freshness  ${B.freshness} → ${F.freshness}   (${pct(B.freshness, F.freshness)})`);
  console.log(`    Staleness  ${B.staleness} → ${F.staleness}   (${pct(B.staleness, F.staleness)})`);

  console.log('\n' + '='.repeat(64));
  console.log('  SIDE BY SIDE — "Amazon system design rounds" (years only)');
  console.log('='.repeat(64));
  const qv = await embed(QUERIES[0].q);
  for (const mode of ['baseline', 'fixed', 'adaptive']) {
    const res = retrieve(qv, store.experiences.all(), {
      mode, company: 'Amazon', k: 10, driftProfiles: corpus.getDriftProfiles(),
    });
    console.log(`  ${mode.padEnd(9)} ${res.map(r => r.year).join('  ')}`);
  }

  console.log('\n' + '='.repeat(64));
  console.log('  HONEST NOTE ON "adaptive"');
  console.log('='.repeat(64));
  console.log('  adaptive is expected to score at or slightly below fixed on this');
  console.log('  corpus. That is not a bug — it is the sample-density finding:');
  console.log('  with ~2-3 records per company-year, the measured drift is');
  console.log('  dominated by sampling noise rather than real process change.');
  console.log('  See data/DATA_README.md. Report this, do not hide it.\n');
})();
