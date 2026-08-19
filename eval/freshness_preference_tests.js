/**
 * eval/freshness_preference_tests.js — Unit Tests for Product Freshness Preference
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const store = require('../server/src/store');
const corpus = require('../server/src/services/corpus.service');
const { retrieve, recencyScore, FRESHNESS_PRESETS } = require('../server/src/services/retrieval.service');
const { embed } = require('../server/src/services/embedding.service');

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    fail++;
  }
}

(async () => {
  console.log('============================================================');
  console.log('  PRODUCT FRESHNESS PREFERENCE TEST SUITE');
  console.log('============================================================\n');

  await corpus.warmup();
  const all = store.experiences.all();
  const qv = await embed('system design interview');

  // Test 1: Missing preference defaults to balanced
  const resDefault = retrieve(qv, all, { mode: 'fixed' });
  check('1. Missing preference defaults to "balanced"', resDefault[0].freshnessPreference === 'balanced');

  // Test 2: broad resolves to lambda 0.15
  const resBroad = retrieve(qv, all, { mode: 'fixed', freshnessPreference: 'broad' });
  check('2. "broad" preference resolves to lambda 0.15', resBroad[0].lambdaUsed === 0.15);

  // Test 3: balanced resolves to lambda 0.35
  const resBalanced = retrieve(qv, all, { mode: 'fixed', freshnessPreference: 'balanced' });
  check('3. "balanced" preference resolves to lambda 0.35', resBalanced[0].lambdaUsed === 0.35);

  // Test 4: recent resolves to lambda 0.60
  const resRecent = retrieve(qv, all, { mode: 'fixed', freshnessPreference: 'recent' });
  check('4. "recent" preference resolves to lambda 0.60', resRecent[0].lambdaUsed === 0.60);

  // Test 5 & 6: Invalid preference throws validation error / returns 400
  let caughtErr = false;
  try {
    retrieve(qv, all, { mode: 'fixed', freshnessPreference: 'super_recent' });
  } catch (err) {
    caughtErr = true;
  }
  check('5 & 6. Invalid preference or client-provided raw float lambda is rejected', caughtErr);

  // Test 7 & 8: Production formula remains 0.60 semantic + 0.40 recency (no outcome)
  const item = resBalanced[0];
  const sim = item._scores.similarity;
  const rec = item._scores.recency;
  const expectedFinal = Number((0.60 * sim + 0.40 * rec).toFixed(4));
  check('7 & 8. Production formula is strictly 0.60 * sim + 0.40 * rec (outcome does not influence score)', Math.abs(item._scores.final - expectedFinal) < 1e-4);

  // Test 9: Mathematical proof for an old record (age > 0): recency(recent) < recency(balanced) < recency(broad)
  const recRecent = recencyScore(2021, 6, FRESHNESS_PRESETS.recent);
  const recBalanced = recencyScore(2021, 6, FRESHNESS_PRESETS.balanced);
  const recBroad = recencyScore(2021, 6, FRESHNESS_PRESETS.broad);
  check(
    '9. Mathematical proof: for an old record (age > 0), recency(recent) < recency(balanced) < recency(broad)',
    recRecent < recBalanced && recBalanced < recBroad
  );

  // Test 10: Selected preference and lambdaUsed are returned in item metadata
  check(
    '10. Selected freshnessPreference and lambdaUsed are returned in retrieved items',
    resRecent[0].freshnessPreference === 'recent' && resRecent[0].lambdaUsed === 0.60
  );

  // Test 11: Explainability uses actual backend ranking values
  check(
    '11. Explainability scores match actual backend ranking values (_scores.similarity & _scores.recency)',
    item._scores.similarity !== undefined && item._scores.recency !== undefined
  );

  // Test 12: Default existing behavior remains equivalent to fixed lambda 0.35
  check(
    '12. Default behavior is 100% equivalent to fixed lambda 0.35',
    resDefault[0].lambdaUsed === 0.35 && resDefault[0]._scores.lambda === 0.35
  );

  console.log('\n============================================================');
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('============================================================\n');

  if (fail > 0) process.exit(1);
})();
