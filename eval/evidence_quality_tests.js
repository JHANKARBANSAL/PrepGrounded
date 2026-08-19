/**
 * eval/evidence_quality_tests.js — Unit Tests for Evidence Quality V2
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const store = require('../server/src/store');
const corpus = require('../server/src/services/corpus.service');
const { retrieve } = require('../server/src/services/retrieval.service');
const { computeEvidenceQuality, getQualityLabelV2 } = require('../server/src/services/evidence_quality.service');
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
  console.log('  EVIDENCE QUALITY V2 UNIT TEST SUITE');
  console.log('============================================================\n');

  await corpus.warmup();
  const all = store.experiences.all();
  const qv = await embed('system design interview');

  // Synthetic Test Fixtures (Used only for testing, NOT added to production corpus)
  const strongFixture = {
    company: 'Amazon',
    role: 'Software Development Engineer',
    year: 2025,
    month: 5,
    total_rounds: 3,
    rounds: [
      { round_number: 1, round_name: 'Technical DSA', description: 'Solved Dynamic Programming and Binary Tree questions in 45 minutes with optimal time complexity.' },
      { round_number: 2, round_name: 'System Design', description: 'Designed a distributed rate limiter with Redis and sliding window algorithm handling high throughput.' }
    ],
    topics: ['Dynamic Programming', 'Binary Tree', 'System Design'],
    questions: ['Design a distributed rate limiter', 'Longest Palindromic Substring'],
    outcome: 'selected',
    source_site: 'geeksforgeeks',
    source_url: 'https://geeksforgeeks.org/amazon-interview-experience-2025',
    published_at: '2025-05-15',
    raw_text: 'Amazon interview experience for SDE role. I was selected and got the offer after three rigorous rounds. Round 1 covered Dynamic Programming and Binary Tree algorithms in detail. Round 2 covered System Design rate limiter architecture. The interviewers were very collaborative and focused on edge cases and scalability. Overall it was a great experience and I accepted the offer.',
  };

  const partialFixture = {
    company: 'Microsoft',
    role: 'SDE',
    year: 2023,
    total_rounds: 1,
    rounds: [{ round_number: 1, description: 'Short technical round covering basic array operations and data structure questions.' }],
    topics: ['Arrays', 'Graph'],
    outcome: 'selected',
    source_site: 'leetcode',
    source_url: 'https://leetcode.com/discuss/experience/12345',
    raw_text: 'Microsoft interview experience for SDE role. Candidate applied online and was selected after passing the initial screening. Covered array topics in the preliminary screening call. The interview was straightforward and focused on basic algorithmic problem solving skills including two pointer approach and hash maps.',
  };

  const weakFixture = {
    company: 'TCS',
    role: 'System Engineer',
    year: 2021,
    outcome: 'unknown',
    source_url: null,
    source_site: null,
    raw_text: 'Applied through portal.',
  };

  // Test 1: strong fully grounded record scores higher than weak sparse record
  const qStrong = computeEvidenceQuality(strongFixture);
  const qWeak = computeEvidenceQuality(weakFixture);
  check('1. Strong fully grounded record scores higher than weak sparse record', qStrong.evidenceQuality > qWeak.evidenceQuality);

  // Test 2: unknown outcome is not automatically penalized
  const unknownFixture = { ...strongFixture, outcome: 'unknown', raw_text: strongFixture.raw_text.replace('I was selected and got the offer', 'I completed the process') };
  const qUnknown = computeEvidenceQuality(unknownFixture);
  check('2. unknown outcome is not automatically penalized (outcomeIntegrity = 0.15)', qUnknown.evidenceBreakdown.outcomeIntegrity === 0.15);

  // Test 3: selected without explicit evidence loses quality
  const selNoEv = {
    ...strongFixture,
    rounds: [{ round_number: 1, description: 'Technical round covering algorithms.' }],
    raw_text: 'Amazon interview experience for SDE role. Round 1 covered algorithms. Round 2 covered system architecture.'
  };
  const qSelNoEv = computeEvidenceQuality(selNoEv);
  check('3. selected without explicit text evidence loses quality (unsupported_outcome flag)', qSelNoEv.evidenceFlags.includes('unsupported_outcome') && qSelNoEv.evidenceQuality < qStrong.evidenceQuality);

  // Test 4: rejected without explicit evidence loses quality
  const rejNoEv = {
    ...strongFixture,
    outcome: 'rejected',
    rounds: [{ round_number: 1, description: 'Technical round covering algorithms.' }],
    raw_text: 'Amazon interview experience for SDE role. Round 1 covered algorithms. Round 2 covered system architecture.'
  };
  const qRejNoEv = computeEvidenceQuality(rejNoEv);
  check('4. rejected without explicit text evidence loses quality (unsupported_outcome flag)', qRejNoEv.evidenceFlags.includes('unsupported_outcome'));

  // Test 5: grounded topics score higher than unsupported topics
  const ungroundedTopicsFixture = { ...strongFixture, topics: ['Quantum Computing', 'Compiler Optimization', 'Bioinformatics'] };
  const qUngrounded = computeEvidenceQuality(ungroundedTopicsFixture);
  check('5. Grounded topics score higher than unsupported topics', qStrong.evidenceBreakdown.topicGrounding > qUngrounded.evidenceBreakdown.topicGrounding);

  // Test 6: long text alone does not guarantee High quality
  const longBoilerplateFixture = { company: 'C', role: 'R', raw_text: 'lorem ipsum '.repeat(200), outcome: 'selected', topics: ['UnrelatedTopic'] };
  const qLongBoilerplate = computeEvidenceQuality(longBoilerplateFixture);
  check('6. Long text alone does not guarantee High quality', qLongBoilerplate.evidenceLabel !== 'High');

  // Test 7: missing provenance lowers score & caps at 0.70
  const noProvFixture = { ...strongFixture, source_url: null, source_site: null };
  const qNoProv = computeEvidenceQuality(noProvFixture);
  check('7. Missing provenance lowers score and caps final score <= 0.70', qNoProv.evidenceQuality <= 0.70 && qNoProv.evidenceFlags.includes('missing_source_metadata'));

  // Test 8: weak/no round detail lowers score
  const noRoundFixture = { ...strongFixture, total_rounds: 0, rounds: [] };
  const qNoRound = computeEvidenceQuality(noRoundFixture);
  check('8. Weak/no round detail lowers score (weak_round_detail flag)', qNoRound.evidenceBreakdown.structuredDetail < qStrong.evidenceBreakdown.structuredDetail && qNoRound.evidenceFlags.includes('weak_round_detail'));

  // Test 9: score always remains in [0, 1]
  const allV2Scores = all.map(r => computeEvidenceQuality(r).evidenceQuality);
  check('9. Score for all corpus records remains bounded within [0.0, 1.0]', allV2Scores.every(s => s >= 0.0 && s <= 1.0));

  // Test 10: evidence flags are deterministic
  const qA = computeEvidenceQuality(all[0]);
  const qB = computeEvidenceQuality(all[0]);
  check('10. Evidence flags and scores are 100% deterministic on repeated calls', qA.evidenceQuality === qB.evidenceQuality && JSON.stringify(qA.evidenceFlags) === JSON.stringify(qB.evidenceFlags));

  // Test 11: Production ranking formula remains strictly 0.60 sim + 0.40 rec
  const res = retrieve(qv, all, { mode: 'fixed' });
  const topRes = res[0];
  const expectedProductionScore = Number((0.60 * topRes._scores.similarity + 0.40 * topRes._scores.recency).toFixed(4));
  check('11. Production score is strictly 0.60 * sim + 0.40 * rec', Math.abs(topRes._scores.final - expectedProductionScore) < 1e-4);

  // Test 12: Evidence Quality does NOT alter final retrieval score
  check('12. Evidence Quality does NOT alter final retrieval score', topRes.evidenceQuality !== undefined && Math.abs(topRes._scores.final - expectedProductionScore) < 1e-4);

  // Test 13: Synthetic weak fixture is classified Limited (< 0.55)
  check('13. Synthetic weak fixture is classified as Limited (< 0.55)', qWeak.evidenceLabel === 'Limited');

  // Test 14: Synthetic partial fixture is classified Medium (0.55 <= score < 0.80)
  const qPartial = computeEvidenceQuality(partialFixture);
  check('14. Synthetic partial fixture is classified as Medium (0.55 <= score < 0.80)', qPartial.evidenceLabel === 'Medium');

  // Test 15: Strong fixture is classified High (>= 0.80)
  check('15. Synthetic strong fixture is classified as High (>= 0.80)', qStrong.evidenceLabel === 'High');

  console.log('\n============================================================');
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('============================================================\n');

  if (fail > 0) process.exit(1);
})();
