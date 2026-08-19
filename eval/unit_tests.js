/**
 * eval/unit_tests.js — math layer ke unit tests
 * Run: node eval/unit_tests.js
 *
 * KYUN: examiner poochega "kaise pata aapka system sahi jawab de raha hai?"
 * Counting aur scoring DETERMINISTIC hain — matlab unhe exactly test kiya
 * ja sakta hai. Ek chhota fixture banao jiska jawab aap HAATH se jaante ho,
 * aur check karo ki code wahi deta hai.
 *
 * Ye fixture corpus ka hissa NAHI hai — ye test data hai, 5 fake records
 * jinke numbers maine khud calculate kiye hain.
 */

process.env.EMBEDDING_PROVIDER = 'local';
process.env.LAMBDA_BASE = '0.35';
process.env.W_SIM = '0.60';
process.env.W_REC = '0.30';
process.env.W_OUT = '0.10';

const { computeStats, computeGaps } = require('../server/src/services/aggregation.service');
const { recencyScore, halfLife, OUTCOME_WEIGHT } = require('../server/src/services/retrieval.service');
const { topicDistribution, jensenShannon, computeCompanyDrift } = require('../server/src/services/drift.service');
const { cosine } = require('../server/src/services/embedding.service');
const { sanitize } = require('../server/src/services/planner.service');

let pass = 0, fail = 0;

function eq(label, actual, expected, tol = 0) {
  const ok = tol === 0 ? actual === expected : Math.abs(actual - expected) <= tol;
  console.log(`  ${ok ? '✅' : '❌'} ${label}${ok ? '' : `  — got ${actual}, expected ${expected}`}`);
  ok ? pass++ : fail++;
}
function truthy(label, v) {
  console.log(`  ${v ? '✅' : '❌'} ${label}`);
  v ? pass++ : fail++;
}

/* ================================================================
   FIXTURE — 5 records, answers hand-calculated
   ================================================================
   DP        : records 1,2,3     → 3/5 = 60%
   Arrays    : records 1,2,4,5   → 4/5 = 80%
   Graphs    : record  3         → 1/5 = 20%
   OOPs      : record  5         → 1/5 = 20%
   rounds    : 3,3,4,2,3 → mean 3.0 → 3
   outcomes  : selected×2, rejected×2, unknown×1
*/
const FIXTURE = [
  { id: 'f1', company: 'TestCo', year: 2025, month: 6, total_rounds: 3, topics: ['DP', 'Arrays'],  outcome: 'selected', rounds: [] },
  { id: 'f2', company: 'TestCo', year: 2025, month: 6, total_rounds: 3, topics: ['DP', 'Arrays'],  outcome: 'rejected', rounds: [] },
  { id: 'f3', company: 'TestCo', year: 2025, month: 6, total_rounds: 4, topics: ['DP', 'Graphs'],  outcome: 'selected', rounds: [] },
  { id: 'f4', company: 'TestCo', year: 2025, month: 6, total_rounds: 2, topics: ['Arrays'],        outcome: 'unknown',  rounds: [] },
  { id: 'f5', company: 'TestCo', year: 2025, month: 6, total_rounds: 3, topics: ['Arrays', 'OOPs'],outcome: 'rejected', rounds: [] },
];

console.log('\n' + '='.repeat(60));
console.log('  UNIT TESTS — deterministic math');
console.log('='.repeat(60));

/* ---------------------------------------------------------------- */
console.log('\n  COUNTING (aggregation.service)');

// monthsBack bada rakha taaki saare 5 records window mein aayein
const stats = computeStats(FIXTURE, { monthsBack: 600 });

eq('sample size', stats.sampleSize, 5);
const byTopic = Object.fromEntries(stats.topicFrequency.map(t => [t.topic, t]));
eq('DP count',     byTopic.DP.count, 3);
eq('DP pct',       byTopic.DP.pct, 60);
eq('Arrays count', byTopic.Arrays.count, 4);
eq('Arrays pct',   byTopic.Arrays.pct, 80);
eq('Graphs pct',   byTopic.Graphs.pct, 20);
eq('typical rounds (mean 3.0)', stats.typicalRounds, 3);
eq('outcome: selected', stats.outcomeMix.selected, 2);
eq('outcome: rejected', stats.outcomeMix.rejected, 2);
truthy('topicFrequency sorted descending',
  stats.topicFrequency.every((t, i) => i === 0 || t.count <= stats.topicFrequency[i - 1].count));

// Determinism — 50 baar chalao, output badalna nahi chahiye
const first = JSON.stringify(computeStats(FIXTURE, { monthsBack: 600 }));
let stable = true;
for (let i = 0; i < 50; i++) {
  if (JSON.stringify(computeStats(FIXTURE, { monthsBack: 600 })) !== first) stable = false;
}
truthy('50 runs → identical output (deterministic)', stable);

/* ---------------------------------------------------------------- */
console.log('\n  GAP ANALYSIS');

// resume mein Arrays hai. Company DP(60) Arrays(80) Graphs(20) OOPs(20) poochti hai.
// gaps = DP, Graphs, OOPs.  covered = Arrays.
// readiness = 80 / (60+80+20+20) = 80/180 = 44.4% → 44
const g = computeGaps(['Arrays'], stats);
eq('gap count', g.gaps.length, 3);
truthy('Arrays covered, gaps mein nahi', !g.gaps.some(x => x.topic === 'Arrays'));
truthy('DP gaps mein hai', g.gaps.some(x => x.topic === 'DP'));
eq('readiness = 80/180', g.readinessScore, 44);
eq('DP priority (60% → critical)', g.gaps.find(x => x.topic === 'DP').priority, 'critical');
eq('Graphs priority (20% → medium)', g.gaps.find(x => x.topic === 'Graphs').priority, 'medium');

// Empty resume → readiness 0
eq('khaali resume → readiness 0', computeGaps([], stats).readinessScore, 0);
// Sab topics → readiness 100
eq('sab topics → readiness 100',
   computeGaps(['DP','Arrays','Graphs','OOPs'], stats).readinessScore, 100);

/* ---------------------------------------------------------------- */
console.log('\n  RECENCY DECAY (retrieval.service)');

// e^(-0.35 × 0) = 1
eq('age 0 → score 1.0', recencyScore(new Date().getFullYear(), new Date().getMonth() + 1, 0.35), 1, 0.02);
// half-life = ln(2)/0.35 = 1.98
eq('half-life(0.35) ≈ 1.98y', halfLife(0.35), 1.98, 0.01);
eq('half-life(0.7) ≈ 0.99y', halfLife(0.7), 0.99, 0.01);
// Purana record hamesha naye se kam
truthy('purana record < naya record',
  recencyScore(2018, 6, 0.35) < recencyScore(2025, 6, 0.35));
// Future-dated record clamp hona chahiye (Math.max(0, age))
eq('future date clamp hui (score ≤ 1)',
   recencyScore(new Date().getFullYear() + 5, 6, 0.35) <= 1.0001, true);
// month matter karta hai
truthy('month use ho raha hai (Jan vs Dec alag)',
  recencyScore(2024, 12, 0.35) > recencyScore(2024, 1, 0.35));

eq('outcome weight: selected', OUTCOME_WEIGHT.selected, 1.0);
eq('outcome weight: rejected', OUTCOME_WEIGHT.rejected, 0.7);

/* ---------------------------------------------------------------- */
console.log('\n  COSINE SIMILARITY (embedding.service)');

eq('identical vectors → 1', cosine([1, 0, 0], [1, 0, 0]), 1, 1e-9);
eq('orthogonal vectors → 0', cosine([1, 0], [0, 1]), 0, 1e-9);
eq('scale-invariant (normalize kaam kar rahi)', cosine([1, 1], [5, 5]), 1, 1e-9);
eq('zero vector → 0 (no divide-by-zero)', cosine([0, 0], [1, 1]), 0);

/* ---------------------------------------------------------------- */
console.log('\n  JENSEN-SHANNON DIVERGENCE (drift.service)');

const d1 = topicDistribution([{ topics: ['DP', 'Arrays'] }]);
eq('distribution sums to 1', Object.values(d1).reduce((a, b) => a + b, 0), 1, 1e-9);

eq('same distribution → JSD 0', jensenShannon(d1, d1), 0, 1e-9);

// Bilkul disjoint supports → JSD = 1 (log base 2 ke saath)
const dA = topicDistribution([{ topics: ['DP'] }]);
const dB = topicDistribution([{ topics: ['OOPs'] }]);
eq('disjoint distributions → JSD 1', jensenShannon(dA, dB), 1, 1e-9);

// Symmetry — yehi wajah hai ki KL ke bajaye JSD use kiya
eq('symmetric: JSD(A,B) = JSD(B,A)',
   jensenShannon(dA, dB) - jensenShannon(dB, dA), 0, 1e-12);

truthy('JSD hamesha 0-1 ke beech',
  [dA, dB, d1].every(x => [dA, dB, d1].every(y => {
    const v = jensenShannon(x, y);
    return v >= -1e-9 && v <= 1 + 1e-9;
  })));

/* ---------------------------------------------------------------- */
console.log('\n  DRIFT FALLBACK');

// 2 saal ka data → fallback hona chahiye, drift calculate nahi
const twoYears = [
  { year: 2024, topics: ['DP'] },
  { year: 2025, topics: ['Graphs'] },
];
const dr = computeCompanyDrift(twoYears);
eq('2 saal → fallback method', dr.method, 'fallback_insufficient_years');
eq('2 saal → drift 0', dr.drift, 0);
eq('2 saal → default lambda', dr.lambda, 0.35);

// 3 saal, koi change nahi → drift ~0
const stableCo = [
  { year: 2023, topics: ['Aptitude', 'OOPs'] },
  { year: 2024, topics: ['Aptitude', 'OOPs'] },
  { year: 2025, topics: ['Aptitude', 'OOPs'] },
];
const drStable = computeCompanyDrift(stableCo);
eq('stable company → drift ~0', drStable.drift, 0, 0.001);
eq('stable company → lambda = base', drStable.lambda, 0.35, 0.001);

// 3 saal, poora change → drift high
const volatileCo = [
  { year: 2023, topics: ['Aptitude'] },
  { year: 2024, topics: ['DP'] },
  { year: 2025, topics: ['SystemDesign'] },
];
const drVol = computeCompanyDrift(volatileCo);
truthy('volatile company ka drift stable se zyada', drVol.drift > drStable.drift);
truthy('volatile company ka lambda base se zyada', drVol.lambda > 0.35);

// Year gap normalize ho raha hai?
const gapped = [
  { year: 2019, topics: ['Aptitude'] },
  { year: 2025, topics: ['DP'] },
  { year: 2026, topics: ['DP'] },
];
truthy('6-saal ka gap normalize hua (drift < 1-saal jump)',
  computeCompanyDrift(gapped).drift < drVol.drift);

/* ---------------------------------------------------------------- */
console.log('\n  GROUNDING SANITIZER (planner.service)');

const dirty = sanitize(
  { weeks: [
    { week: 1, topics: ['DP', 'Blockchain'], practice: ['a'], citations: ['ok_1', 'fake'] },
    { week: 2, topics: ['Graphs'], practice: ['b'], citations: ['fake_only'] },
  ]},
  { allowedTopics: ['DP', 'Graphs'], validIds: ['ok_1'] }
);
eq('invented topic hataya', dirty.weeks[0].topics.length, 1);
eq('invented citation hatayi', dirty.weeks[0].citations.length, 1);
eq('sirf-fake citations wala week khaali', dirty.weeks[1].citations.length, 0);
eq('groundingCheck fail hua', dirty.groundingCheck.passed, false);
eq('uncited weeks gine gaye', dirty.groundingCheck.weeksWithoutCitation, 1);

const clean = sanitize(
  { weeks: [{ week: 1, topics: ['DP'], practice: ['a'], citations: ['ok_1'] }] },
  { allowedTopics: ['DP'], validIds: ['ok_1'] }
);
eq('saaf plan pass hua', clean.groundingCheck.passed, true);

/* ---------------------------------------------------------------- */
console.log('\n' + '='.repeat(60));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(60) + '\n');
process.exit(fail > 0 ? 1 : 0);
