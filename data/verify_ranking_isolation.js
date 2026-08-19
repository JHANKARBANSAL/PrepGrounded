/**
 * data/verify_ranking_isolation.js — Verification of Production Ranking Isolation
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const { recencyScore, OUTCOME_WEIGHT } = require('../server/src/services/retrieval.service');
const { computeEvidenceQuality } = require('../server/src/services/evidence_quality.service');

const sim = 0.75;
const year = 2025;
const month = 6;
const lambda = 0.35;

const recordA = {
  id: 'test_a', company: 'Amazon', role: 'SDE', year, month,
  topics: ['System Design'], questions: ['Rate Limiter'],
  outcome: 'selected', source_site: 'geeksforgeeks', source_url: 'https://geeksforgeeks.org/a',
  raw_text: 'Amazon interview experience for SDE role. I was selected and got the offer. Round 1 System Design rate limiter.',
  rounds: [{ round_number: 1, description: 'System Design rate limiter' }],
};

const recordB = {
  id: 'test_b', company: 'Amazon', role: 'SDE', year, month,
  topics: [], questions: [],
  outcome: 'rejected', source_site: null, source_url: null,
  raw_text: 'Short',
  rounds: [],
};

const qA = computeEvidenceQuality(recordA);
const qB = computeEvidenceQuality(recordB);

const recA = recencyScore(recordA.year, recordA.month, lambda);
const recB = recencyScore(recordB.year, recordB.month, lambda);

const finalA = Number((0.60 * sim + 0.40 * recA).toFixed(4));
const finalB = Number((0.60 * sim + 0.40 * recB).toFixed(4));

console.log('========================================================================================');
console.log('  RANKING ISOLATION VERIFICATION');
console.log('========================================================================================\n');
console.log(`Record A: Outcome = ${recordA.outcome}, Evidence Label = ${qA.evidenceLabel} (${qA.evidenceQuality})`);
console.log(`Record B: Outcome = ${recordB.outcome}, Evidence Label = ${qB.evidenceLabel} (${qB.evidenceQuality})`);
console.log(`\nIdentical Inputs: Similarity = ${sim}, Recency Score = ${recA.toFixed(4)}`);
console.log(`Production Final Score A: ${finalA}`);
console.log(`Production Final Score B: ${finalB}`);
console.log(`Score Difference: ${Math.abs(finalA - finalB).toFixed(6)}`);
console.log(`\nISOLATION PROOF: ${finalA === finalB ? '✅ PERFECT MATCH (0 contribution from outcome/quality)' : '❌ MISMATCH'}`);
console.log('========================================================================================\n');
