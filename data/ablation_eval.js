/**
 * data/ablation_eval.js — Full Component Ablation Study on 204-Record Corpus
 */

const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const corpus = require('../server/src/services/corpus.service');
const store = require('../server/src/store');
const { embed } = require('../server/src/services/embedding.service');
const { recencyScore, OUTCOME_WEIGHT } = require('../server/src/services/retrieval.service');

const QUERIES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eval', 'queries.json'), 'utf8'));
const K = 10;
const HOLDOUT_CUTOFF = 2023;
const TOPIC_K = 5;
const NOW = new Date().getFullYear();

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = n => (n * 100).toFixed(1) + '%';

function topTopics(records, n) {
  const count = {};
  for (const r of records) for (const t of new Set(r.topics || [])) count[t] = (count[t] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

function hitRate(predicted, actual) {
  if (!predicted.length || !actual.length) return 0;
  const set = new Set(actual);
  return predicted.filter(t => set.has(t)).length / predicted.length;
}

(async () => {
  await corpus.warmup();
  const all = store.experiences.all();
  const profiles = corpus.getDriftProfiles();

  const VARIANTS = [
    { name: 'Variant A', label: 'Semantic retrieval only', wSim: 1.0, wRec: 0.0, wOut: 0.0, lambdaMode: 'none' },
    { name: 'Variant B', label: 'Semantic + Recency (Fixed λ=0.35)', wSim: 0.60, wRec: 0.40, wOut: 0.0, lambdaMode: 'fixed' },
    { name: 'Variant C', label: 'Semantic + Outcome weighting', wSim: 0.80, wRec: 0.0, wOut: 0.20, lambdaMode: 'none' },
    { name: 'Variant D', label: 'Semantic + Recency + Outcome (Fixed λ=0.35)', wSim: 0.60, wRec: 0.30, wOut: 0.10, lambdaMode: 'fixed' },
    { name: 'Variant E', label: 'Semantic + Recency + Outcome (Adaptive λ)', wSim: 0.60, wRec: 0.30, wOut: 0.10, lambdaMode: 'adaptive' },
  ];

  function retrieveAblation(qv, pool, opts) {
    const { variant, company, k = 10, maxYear = null } = opts;
    let filtered = pool;
    if (company) {
      const c = company.toLowerCase();
      filtered = filtered.filter(e => (e.company || '').toLowerCase() === c);
    }
    if (maxYear !== null) filtered = filtered.filter(e => e.year <= maxYear);

    const scored = filtered.map(e => {
      const similarity = require('../server/src/services/embedding.service').cosine(qv, e.embedding || []);
      if (variant.wRec === 0 && variant.wOut === 0) {
        return { ...e, _scores: { final: similarity, similarity } };
      }

      let lam = 0.35;
      if (variant.lambdaMode === 'adaptive') {
        const p = profiles[e.company];
        lam = p ? p.lambda : 0.35;
      }

      const rec = recencyScore(e.year, e.month, lam);
      const out = OUTCOME_WEIGHT[e.outcome] ?? OUTCOME_WEIGHT.unknown;
      const final = variant.wSim * similarity + variant.wRec * rec + variant.wOut * out;

      return { ...e, _scores: { final, similarity, recency: rec, outcome: out, lambda: lam } };
    });

    scored.sort((a, b) => b._scores.final - a._scores.final);
    return scored.slice(0, k);
  }

  /* 1. RETRIEVAL METRICS */
  const retrievalScores = {};
  for (const v of VARIANTS) {
    const ages = [];
    for (const q of QUERIES) {
      const qv = await embed(q.query);
      const rows = retrieveAblation(qv, all, { variant: v, company: q.company, k: K });
      rows.forEach(r => ages.push(NOW - r.year));
    }
    retrievalScores[v.name] = {
      avgAge: avg(ages),
      freshness: ages.filter(a => a <= 2).length / ages.length,
      staleness: ages.filter(a => a > 4).length / ages.length,
    };
  }

  /* 2. HOLDOUT PREDICTION */
  const eligible = [...new Set(all.map(r => r.company))].filter(c => {
    const train = all.filter(r => r.company === c && r.year <= HOLDOUT_CUTOFF).length;
    const test = all.filter(r => r.company === c && r.year > HOLDOUT_CUTOFF).length;
    return train >= 5 && test >= 3;
  });

  const holdoutScores = {};
  const perCompanyScores = {};

  for (const v of VARIANTS) holdoutScores[v.name] = [];

  for (const company of eligible) {
    const heldOut = all.filter(r => r.company === company && r.year > HOLDOUT_CUTOFF);
    const actual = topTopics(heldOut, TOPIC_K);
    perCompanyScores[company] = { company, actual, scores: {} };

    for (const v of VARIANTS) {
      const qv = await embed(`${company} interview process rounds questions`);
      const rows = retrieveAblation(qv, all, {
        variant: v, company, k: K, maxYear: HOLDOUT_CUTOFF
      });
      const score = hitRate(topTopics(rows, TOPIC_K), actual);
      holdoutScores[v.name].push(score);
      perCompanyScores[company].scores[v.name] = score;
    }
  }

  console.log('\n============================================================');
  console.log('  ABLATION STUDY REPORT (204-Record Corpus)');
  console.log('============================================================\n');

  console.log('--- ABLATION RESULTS TABLE ---');
  console.log('Variant'.padEnd(12) + ' | Description'.padEnd(42) + ' | Hit Rate@5 | Freshness@10 | Staleness@10 | Avg Age');
  console.log('-'.repeat(100));

  for (const v of VARIANTS) {
    const r = retrievalScores[v.name];
    const h = avg(holdoutScores[v.name]);
    console.log(
      v.name.padEnd(12) + ' | ' +
      v.label.padEnd(42) + ' | ' +
      h.toFixed(3).padStart(10) + ' | ' +
      pct(r.freshness).padStart(12) + ' | ' +
      pct(r.staleness).padStart(12) + ' | ' +
      (r.avgAge.toFixed(2) + 'y').padStart(7)
    );
  }

  console.log('\n--- PER-COMPANY HOLDOUT BREAKDOWN (Topic Hit Rate@5) ---');
  console.log('Company'.padEnd(12) + ' | Variant A | Variant B | Variant C | Variant D | Variant E');
  console.log('-'.repeat(75));
  for (const c of eligible) {
    const s = perCompanyScores[c].scores;
    console.log(
      `${c.padEnd(12)} | ${s['Variant A'].toFixed(3)}   | ${s['Variant B'].toFixed(3)}   | ${s['Variant C'].toFixed(3)}   | ${s['Variant D'].toFixed(3)}   | ${s['Variant E'].toFixed(3)}`
    );
  }

  console.log('\n============================================================\n');
})();
