/**
 * data/inspect_flags_sample.js — Read-Only Sampling Audit for Evidence Quality Flags
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const store = require('../server/src/store');
const corpus = require('../server/src/services/corpus.service');
const { computeEvidenceQuality } = require('../server/src/services/evidence_quality.service');

(async () => {
  await corpus.warmup();
  const all = store.experiences.all();

  const flaggedTopics = [];
  const flaggedOutcome = [];

  for (const r of all) {
    const q = computeEvidenceQuality(r);
    if (q.evidenceFlags.includes('unsupported_topics')) flaggedTopics.push({ record: r, quality: q });
    if (q.evidenceFlags.includes('unsupported_outcome')) flaggedOutcome.push({ record: r, quality: q });
  }

  console.log('========================================================================================');
  console.log('  SAMPLE AUDIT: UNSUPPORTED TOPICS (10 Records sampled out of ' + flaggedTopics.length + ')');
  console.log('========================================================================================\n');

  flaggedTopics.slice(0, 10).forEach(({ record: r, quality: q }, idx) => {
    console.log(`[Topic Sample ${idx + 1}] ID: ${r.id} | Company: ${r.company} | Role: ${r.role}`);
    console.log(`  Extracted Topics: [ ${(r.topics || []).join(', ')} ]`);
    console.log(`  Raw Text Snippet: "${(r.raw_text || '').slice(0, 140)}..."`);
    console.log('-'.repeat(80));
  });

  console.log('\n========================================================================================');
  console.log('  SAMPLE AUDIT: UNSUPPORTED OUTCOME (10 Records sampled out of ' + flaggedOutcome.length + ')');
  console.log('========================================================================================\n');

  flaggedOutcome.slice(0, 10).forEach(({ record: r, quality: q }, idx) => {
    console.log(`[Outcome Sample ${idx + 1}] ID: ${r.id} | Company: ${r.company} | Outcome: ${r.outcome}`);
    console.log(`  Raw Text Snippet: "${(r.raw_text || '').slice(0, 160)}..."`);
    console.log('-'.repeat(80));
  });

  console.log('\n========================================================================================\n');
})();
