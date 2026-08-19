/**
 * data/verify_evidence_fixtures.js — Test-Only Fixtures Evidence Quality Verification
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const { computeEvidenceQuality } = require('../server/src/services/evidence_quality.service');

const strongFixture = {
  company: 'Amazon', role: 'SDE', year: 2025, month: 5,
  total_rounds: 2, rounds: [{ round_number: 1, description: 'Technical DSA Dynamic Programming round in detail.' }, { round_number: 2, description: 'System Design rate limiter architecture.' }],
  topics: ['Dynamic Programming', 'System Design'], questions: ['Design a rate limiter'],
  outcome: 'selected', source_site: 'geeksforgeeks', source_url: 'https://geeksforgeeks.org/amazon-sde-2025',
  published_at: '2025-05-15',
  raw_text: 'Amazon interview experience for SDE role. I was selected and accepted the offer after two rigorous rounds. Round 1 covered Dynamic Programming algorithms. Round 2 covered System Design rate limiter architecture with Redis sliding window.',
};

const partialFixture = {
  company: 'Microsoft', role: 'SDE', year: 2023,
  total_rounds: 1, rounds: [{ round_number: 1, description: 'Short technical round covering basic array operations and data structure questions.' }],
  topics: ['Arrays', 'Graph'], outcome: 'selected', source_site: 'leetcode', source_url: 'https://leetcode.com/discuss/1234',
  raw_text: 'Microsoft interview experience for SDE role. Candidate applied online and was selected after passing initial screening. Covered array topics in detail. The interview was straightforward and focused on basic algorithmic problem solving skills including two pointer approach and hash maps.',
};

const weakFixture = {
  company: 'TCS', role: 'System Engineer', year: 2021, outcome: 'unknown',
  source_url: null, source_site: null, raw_text: 'Applied through portal.',
};

const unknownStrongFixture = {
  ...strongFixture, outcome: 'unknown',
  raw_text: strongFixture.raw_text.replace('I was selected and accepted the offer', 'I completed the process'),
};

const selectedNoEvFixture = {
  ...strongFixture, rounds: [{ round_number: 1, description: 'Technical round algorithms.' }],
  raw_text: 'Amazon interview experience for SDE role. Round 1 covered algorithms. Round 2 covered system architecture.'
};

const qStrong = computeEvidenceQuality(strongFixture);
const qPartial = computeEvidenceQuality(partialFixture);
const qWeak = computeEvidenceQuality(weakFixture);
const qUnkStrong = computeEvidenceQuality(unknownStrongFixture);
const qSelNoEv = computeEvidenceQuality(selectedNoEvFixture);

console.log('========================================================================================');
console.log('  EVIDENCE QUALITY FIXTURE VERIFICATION');
console.log('========================================================================================\n');
console.log(`A. Strong Fixture    : Label = ${qStrong.evidenceLabel} (${qStrong.evidenceQuality}) | Expected: High   -> ${qStrong.evidenceLabel === 'High' ? '✅' : '❌'}`);
console.log(`B. Partial Fixture   : Label = ${qPartial.evidenceLabel} (${qPartial.evidenceQuality}) | Expected: Medium -> ${qPartial.evidenceLabel === 'Medium' ? '✅' : '❌'}`);
console.log(`C. Weak Fixture      : Label = ${qWeak.evidenceLabel} (${qWeak.evidenceQuality}) | Expected: Limited -> ${qWeak.evidenceLabel === 'Limited' ? '✅' : '❌'}`);
console.log(`D. Unknown-Strong    : Label = ${qUnkStrong.evidenceLabel} (${qUnkStrong.evidenceQuality}), OutcomeIntegrity = ${qUnkStrong.evidenceBreakdown.outcomeIntegrity} -> ${qUnkStrong.evidenceBreakdown.outcomeIntegrity === 0.15 ? '✅ Full Credit (Not Penalized)' : '❌'}`);
console.log(`E. Selected-No-Ev    : Label = ${qSelNoEv.evidenceLabel} (${qSelNoEv.evidenceQuality}), Flags = [ ${qSelNoEv.evidenceFlags.join(', ')} ] -> ${qSelNoEv.evidenceFlags.includes('unsupported_outcome') ? '✅ Flagged unsupported_outcome' : '❌'}`);
console.log('========================================================================================\n');
