/**
 * data/final_holdout_v2_comparison.js — Final Unseen Holdout Evaluation (4 Variants)
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
const { buildDriftProfilesV2, buildDriftProfilesJSD } = require('../server/src/services/drift.service');

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

  const jsdProfiles = buildDriftProfilesJSD(all);
  const v2Profiles = buildDriftProfilesV2(all);

  const VARIANTS = [
    { id: 'variant_a', name: 'Variant A: Semantic-Only Baseline (λ=0)', mode: 'baseline' },
    { id: 'variant_b', name: 'Variant B: Fixed Global λ = 0.35', mode: 'fixed' },
    { id: 'variant_c', name: 'Variant C: Old JSD Adaptive λ (Experimental)', mode: 'jsd' },
    { id: 'variant_d', name: 'Variant D: Adaptive Lambda V2 (Frozen)', mode: 'v2' },
  ];

  function retrieveVariant(qv, pool, opts) {
    const { variant, company, k = 10, maxYear = null } = opts;
    let filtered = pool;
    if (company) {
      const c = company.toLowerCase();
      filtered = filtered.filter(e => (e.company || '').toLowerCase() === c);
    }
    if (maxYear !== null) filtered = filtered.filter(e => e.year <= maxYear);

    const scored = filtered.map(e => {
      const similarity = require('../server/src/services/embedding.service').cosine(qv, e.embedding || []);

      if (variant.mode === 'baseline') {
        return { ...e, _scores: { final: similarity, similarity } };
      }

      let lam = 0.35;
      if (variant.mode === 'jsd') {
        const p = jsdProfiles[e.company];
        lam = p ? p.lambda : 0.35;
      } else if (variant.mode === 'v2') {
        const p = v2Profiles[e.company];
        lam = p ? (p.finalLambda || p.lambda) : 0.35;
      } else {
        lam = 0.35;
      }

      const rec = recencyScore(e.year, e.month, lam);
      const out = OUTCOME_WEIGHT[e.outcome] ?? OUTCOME_WEIGHT.unknown;
      const final = WEIGHTS.similarity * similarity + WEIGHTS.recency * rec + WEIGHTS.outcome * out;

      return { ...e, _scores: { final, similarity, recency: rec, outcome: out, lambda: lam } };
    });

    scored.sort((a, b) => b._scores.final - a._scores.final);
    return scored.slice(0, k);
  }

  /* 1. Retrieval Surface Metrics */
  const retrievalRes = {};
  for (const v of VARIANTS) {
    const ages = [];
    for (const q of QUERIES) {
      const qv = await embed(q.query);
      const rows = retrieveVariant(qv, all, { variant: v, company: q.company, k: K });
      rows.forEach(r => ages.push(NOW - r.year));
    }
    retrievalRes[v.id] = {
      avgAge: avg(ages),
      freshness: ages.filter(a => a <= 2).length / ages.length,
      staleness: ages.filter(a => a > 4).length / ages.length,
    };
  }

  /* 2. Holdout Prediction (> 2023) across 5 eligible companies */
  const eligible = [...new Set(all.map(r => r.company))].filter(c => {
    const train = all.filter(r => r.company === c && r.year <= HOLDOUT_CUTOFF).length;
    const test = all.filter(r => r.company === c && r.year > HOLDOUT_CUTOFF).length;
    return train >= 5 && test >= 3;
  });

  const holdoutRes = {};
  const companyHoldoutDetails = [];

  for (const v of VARIANTS) holdoutRes[v.id] = [];

  for (const company of eligible) {
    const trainCount = all.filter(r => r.company === company && r.year <= HOLDOUT_CUTOFF).length;
    const testRecords = all.filter(r => r.company === company && r.year > HOLDOUT_CUTOFF);
    const actual = topTopics(testRecords, TOPIC_K);

    const detailRow = {
      company,
      trainCount,
      testCount: testRecords.length,
      lambdas: {
        baseline: 0.0,
        fixed: 0.35,
        jsd: jsdProfiles[company]?.lambda || 0.35,
        v2: v2Profiles[company]?.finalLambda || 0.35,
      },
      scores: {},
    };

    for (const v of VARIANTS) {
      const qv = await embed(`${company} interview process rounds questions`);
      const rows = retrieveVariant(qv, all, {
        variant: v, company, k: K, maxYear: HOLDOUT_CUTOFF
      });
      const score = hitRate(topTopics(rows, TOPIC_K), actual);
      holdoutRes[v.id].push(score);
      detailRow.scores[v.id] = score;
    }

    companyHoldoutDetails.push(detailRow);
  }

  console.log('====================================================================================================');
  console.log('  FINAL UNSEEN HOLDOUT EVALUATION (Semantic vs Fixed vs JSD-Adaptive vs Adaptive V2)');
  console.log('====================================================================================================\n');

  console.log('--- 1. OVERALL SYSTEM COMPARISON TABLE ---');
  console.log('Variant Architecture'.padEnd(46) + ' | Topic Hit Rate@5 | Freshness@10 | Staleness@10 | Avg Age');
  console.log('-'.repeat(98));

  for (const v of VARIANTS) {
    const r = retrievalRes[v.id];
    const h = avg(holdoutRes[v.id]);
    console.log(
      v.name.padEnd(46) + ' | ' +
      h.toFixed(3).padStart(16) + ' | ' +
      pct(r.freshness).padStart(12) + ' | ' +
      pct(r.staleness).padStart(12) + ' | ' +
      (r.avgAge.toFixed(2) + 'y').padStart(7)
    );
  }

  console.log('\n--- 2. PER-COMPANY HOLDOUT BREAKDOWN (> 2023) ---');
  console.log('Company'.padEnd(12) + ' | Baseline (λ=0) | Fixed λ=0.35 | Old JSD Adaptive | Adaptive V2 | V2 Lambda');
  console.log('-'.repeat(92));

  for (const r of companyHoldoutDetails) {
    console.log(
      r.company.padEnd(12) + ' | ' +
      r.scores['variant_a'].toFixed(3).padStart(14) + ' | ' +
      r.scores['variant_b'].toFixed(3).padStart(12) + ' | ' +
      `${r.scores['variant_c'].toFixed(3)} (λ=${r.lambdas.jsd.toFixed(2)})`.padStart(16) + ' | ' +
      `${r.scores['variant_d'].toFixed(3)} (λ=${r.lambdas.v2.toFixed(2)})`.padStart(11) + ' | ' +
      r.lambdas.v2.toFixed(4).padStart(9)
    );
  }

  console.log('\n====================================================================================================\n');
})();
