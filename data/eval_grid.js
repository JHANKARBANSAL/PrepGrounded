/**
 * data/eval_grid.js
 * Evaluates lambda strategies (lambda=0, fixed grid, adaptive) on the 204-record corpus.
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
const { recencyScore, WEIGHTS, OUTCOME_WEIGHT } = require('../server/src/services/retrieval.service');

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

  const GRID = [
    { name: 'lambda_0.00', label: 'No Temporal Decay (λ=0)', mode: 'baseline', lambda: 0 },
    { name: 'fixed_0.10', label: 'Fixed λ = 0.10', mode: 'fixed_override', lambda: 0.10 },
    { name: 'fixed_0.20', label: 'Fixed λ = 0.20', mode: 'fixed_override', lambda: 0.20 },
    { name: 'fixed_0.35', label: 'Fixed λ = 0.35 (Default)', mode: 'fixed', lambda: 0.35 },
    { name: 'fixed_0.50', label: 'Fixed λ = 0.50', mode: 'fixed_override', lambda: 0.50 },
    { name: 'fixed_0.75', label: 'Fixed λ = 0.75', mode: 'fixed_override', lambda: 0.75 },
    { name: 'adaptive',   label: 'Adaptive λ (Drift-Gated)', mode: 'adaptive', lambda: null },
  ];

  async function retrieveCustom(qv, pool, opts) {
    const { mode, company, k = 10, maxYear = null, lambdaOverride = null } = opts;
    let filtered = pool;
    if (company) {
      const c = company.toLowerCase();
      filtered = filtered.filter(e => (e.company || '').toLowerCase() === c);
    }
    if (maxYear !== null) filtered = filtered.filter(e => e.year <= maxYear);

    const scored = filtered.map(e => {
      const similarity = require('../server/src/services/embedding.service').cosine(qv, e.embedding || []);
      if (mode === 'baseline') {
        return { ...e, _scores: { final: similarity } };
      }
      let lam = 0.35;
      if (mode === 'adaptive') {
        const p = profiles[e.company];
        lam = p ? p.lambda : 0.35;
      } else if (lambdaOverride !== null) {
        lam = lambdaOverride;
      }

      const rec = recencyScore(e.year, e.month, lam);
      const out = OUTCOME_WEIGHT[e.outcome] ?? OUTCOME_WEIGHT.unknown;
      const final = WEIGHTS.similarity * similarity + WEIGHTS.recency * rec + WEIGHTS.outcome * out;
      return { ...e, _scores: { final, similarity, recency: rec, lambda: lam } };
    });

    scored.sort((a, b) => b._scores.final - a._scores.final);
    return scored.slice(0, k);
  }

  /* PART A: RETRIEVAL METRICS */
  const retrievalRes = {};
  for (const g of GRID) {
    const ages = [];
    for (const q of QUERIES) {
      const qv = await embed(q.query);
      const rows = await retrieveCustom(qv, all, { mode: g.mode, company: q.company, k: K, lambdaOverride: g.lambda });
      rows.forEach(r => ages.push(NOW - r.year));
    }
    retrievalRes[g.name] = {
      avgAge: avg(ages),
      freshness: ages.filter(a => a <= 2).length / ages.length,
      staleness: ages.filter(a => a > 4).length / ages.length,
    };
  }

  /* PART B: HOLDOUT PREDICTION */
  const eligible = [...new Set(all.map(r => r.company))].filter(c => {
    const train = all.filter(r => r.company === c && r.year <= HOLDOUT_CUTOFF).length;
    const test = all.filter(r => r.company === c && r.year > HOLDOUT_CUTOFF).length;
    return train >= 5 && test >= 3;
  });

  const holdoutRes = {};
  const perCompanyRes = {};

  for (const g of GRID) {
    holdoutRes[g.name] = [];
  }

  for (const company of eligible) {
    const heldOut = all.filter(r => r.company === company && r.year > HOLDOUT_CUTOFF);
    const actual = topTopics(heldOut, TOPIC_K);
    perCompanyRes[company] = { company, actual, scores: {} };

    for (const g of GRID) {
      const qv = await embed(`${company} interview process rounds questions`);
      const rows = await retrieveCustom(qv, all, {
        mode: g.mode, company, k: K, maxYear: HOLDOUT_CUTOFF, lambdaOverride: g.lambda
      });
      const score = hitRate(topTopics(rows, TOPIC_K), actual);
      holdoutRes[g.name].push(score);
      perCompanyRes[company].scores[g.name] = score;
    }
  }

  console.log('\n============================================================');
  console.log('  TEMPORAL DECAY GRID EVALUATION REPORT (204 Records)');
  console.log('============================================================\n');

  console.log('--- SUMMARY COMPARISON TABLE ---');
  console.log('Variant'.padEnd(16) + ' | Strategy'.padEnd(30) + ' | Freshness@10 | Staleness@10 | Topic Hit Rate@5');
  console.log('-'.repeat(85));

  for (const g of GRID) {
    const r = retrievalRes[g.name];
    const h = avg(holdoutRes[g.name]);
    console.log(
      g.name.padEnd(16) + ' | ' +
      g.label.padEnd(30) + ' | ' +
      pct(r.freshness).padStart(12) + ' | ' +
      pct(r.staleness).padStart(12) + ' | ' +
      h.toFixed(3).padStart(18)
    );
  }

  console.log('\n--- PER-COMPANY HOLDOUT BREAKDOWN (Topic Hit Rate@5) ---');
  console.log('Company'.padEnd(12) + ' | λ=0.00 | Fixed 0.35 | Adaptive λ | Winner');
  console.log('-'.repeat(60));
  for (const c of eligible) {
    const s = perCompanyRes[c].scores;
    const l0 = s['lambda_0.00'].toFixed(3);
    const f35 = s['fixed_0.35'].toFixed(3);
    const adapt = s['adaptive'].toFixed(3);
    let win = 'Tie';
    if (s['adaptive'] > s['fixed_0.35']) win = 'Adaptive';
    else if (s['fixed_0.35'] > s['adaptive']) win = 'Fixed 0.35';
    else if (s['fixed_0.35'] > s['lambda_0.00']) win = 'Fixed/Adaptive tie';

    console.log(`${c.padEnd(12)} | ${l0}  | ${f35}       | ${adapt}      | ${win}`);
  }

  console.log('\n============================================================\n');
})();
