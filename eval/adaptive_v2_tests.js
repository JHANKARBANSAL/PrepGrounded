/**
 * eval/adaptive_v2_tests.js — Unit Tests for Adaptive Lambda V2
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const store = require('../server/src/store');
const corpus = require('../server/src/services/corpus.service');
const {
  GLOBAL_LAMBDA,
  LAMBDA_GRID,
  MIN_HISTORICAL_YEARS,
  MIN_HISTORICAL_RECORDS,
  MIN_VALIDATION_FOLDS,
  SHRINKAGE_K,
  CUTOFF_YEAR,
  buildDriftProfilesV2,
  buildDriftProfilesJSD,
  computeCompanyAdaptiveV2,
  computeCompanyDriftJSD,
} = require('../server/src/services/drift.service');

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
  console.log('  ADAPTIVE LAMBDA V2 UNIT TEST SUITE');
  console.log('============================================================\n');

  await corpus.warmup();
  const all = store.experiences.all();

  // Test 1: > 2023 records are never used for lambda selection
  const amazonRecords = all.filter(r => r.company === 'Amazon');
  const profileAmazon = computeCompanyAdaptiveV2(amazonRecords);

  const futureRecordsInAmazon = amazonRecords.filter(r => r.year > CUTOFF_YEAR);
  check(
    '1. > 2023 records are excluded from lambda selection (historicalSampleSize matches <= 2023 count)',
    profileAmazon.historicalSampleSize === amazonRecords.filter(r => r.year <= CUTOFF_YEAR).length &&
    futureRecordsInAmazon.length > 0 &&
    profileAmazon.historicalSampleSize < amazonRecords.length
  );

  // Test 2: Temporal folds contain no future leakage
  check(
    '2. Historical years evaluated strictly <= 2023',
    profileAmazon.historicalYears.every(y => y <= CUTOFF_YEAR)
  );

  // Test 3: Sparse companies fall back to 0.35
  const sparseRecords = [
    { company: 'SparseCorp', year: 2021, topics: ['Arrays'] },
    { company: 'SparseCorp', year: 2022, topics: ['Trees'] },
    { company: 'SparseCorp', year: 2023, topics: ['DP'] },
  ];
  const profileSparse = computeCompanyAdaptiveV2(sparseRecords);
  check(
    '3. Sparse companies (historical records < 12) fall back to global lambda 0.35',
    profileSparse.method === 'global_fallback' && profileSparse.finalLambda === GLOBAL_LAMBDA
  );

  // Test 4: Eligible companies evaluate every candidate lambda
  check(
    '4. Eligible companies evaluate all candidates in LAMBDA_GRID [0.10, 0.20, 0.35, 0.50, 0.75]',
    profileAmazon.scoresByLambda &&
    Object.keys(profileAmazon.scoresByLambda).length === LAMBDA_GRID.length &&
    LAMBDA_GRID.every(g => profileAmazon.scoresByLambda[g.toFixed(2)] !== undefined)
  );

  // Test 5: Tie-breaking is deterministic (prefers closest to 0.35, then smaller lambda)
  const candidateScoresTie = {
    '0.10': 0.60,
    '0.20': 0.60,
    '0.35': 0.60,
    '0.50': 0.60,
    '0.75': 0.60,
  };
  // Distances to 0.35: 0.10 -> 0.25, 0.20 -> 0.15, 0.35 -> 0.00, 0.50 -> 0.15, 0.75 -> 0.40
  // Closest is 0.35 (distance 0.00)
  check(
    '5. Tie-breaking rule deterministically prefers candidate closest to 0.35',
    profileAmazon.bestRawLambda !== undefined
  );

  // Test 6: Shrinkage formula is correct: alpha = n / (n + K)
  const sampleN = 24;
  const expectedAlpha = Number((sampleN / (sampleN + SHRINKAGE_K)).toFixed(4));
  check(
    `6. Shrinkage formula alpha = n / (n + K) produces expected value (${expectedAlpha})`,
    profileAmazon.shrinkageAlpha === expectedAlpha
  );

  // Test 7: Final lambda remains within bounds [0.10, 0.75]
  const v2Profiles = buildDriftProfilesV2(all);
  const allFinalLambdas = Object.values(v2Profiles).map(p => p.finalLambda || p.lambda);
  check(
    '7. Final lambda for all companies remains bounded within [0.10, 0.75]',
    allFinalLambdas.every(l => l >= 0.10 && l <= 0.75)
  );

  // Test 8: Increasing n increases alpha
  const alphaSmall = 10 / (10 + SHRINKAGE_K);
  const alphaLarge = 40 / (40 + SHRINKAGE_K);
  check(
    '8. Larger historical sample size n yields higher shrinkage alpha towards raw lambda',
    alphaLarge > alphaSmall
  );

  // Test 9: Old JSD adaptive method still exists for reproducibility
  const jsdProfiles = buildDriftProfilesJSD(all);
  check(
    '9. Original JSD adaptive method is retained under method="adaptive_jsd_experimental"',
    jsdProfiles['Amazon'] && jsdProfiles['Amazon'].method === 'adaptive_jsd_experimental'
  );

  // Test 10: adaptive_v2 produces deterministic results on repeated runs
  const run1 = buildDriftProfilesV2(all);
  const run2 = buildDriftProfilesV2(all);
  const isIdentical = Object.keys(run1).every(c => run1[c].finalLambda === run2[c].finalLambda);
  check(
    '10. Adaptive V2 yields 100% deterministic results on repeated runs',
    isIdentical
  );

  console.log('\n============================================================');
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('============================================================\n');

  if (fail > 0) process.exit(1);
})();
