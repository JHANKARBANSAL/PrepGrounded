/**
 * data/reground_topics.js — Verbatim Topic Re-Grounding Engine
 *
 * Re-evaluates topics for all approved records in data/experiences.json
 * using strict verbatim textual evidence from raw_text and round descriptions.
 */

const fs = require('fs');
const path = require('path');
const { extractTopicsStrict } = require('../server/src/pipeline/extractor');
const { computeEvidenceQuality } = require('../server/src/services/evidence_quality.service');

const experiencesPath = path.join(__dirname, 'experiences.json');
const experiences = JSON.parse(fs.readFileSync(experiencesPath, 'utf8'));

let regroundedCount = 0;
let beforeUnsupportedTopics = 0;
let afterUnsupportedTopics = 0;

experiences.forEach(r => {
  const qBefore = computeEvidenceQuality(r);
  if (qBefore.evidenceFlags.includes('unsupported_topics')) beforeUnsupportedTopics++;

  // Combine raw_text and round descriptions for text grounding
  const fullText = [
    r.raw_text || '',
    ...(r.rounds || []).map(rnd => `${rnd.round_type || ''} ${rnd.description || ''} ${(rnd.questions || []).join(' ')}`),
    (r.questions || []).join(' '),
  ].join('\n');

  const groundedTopics = extractTopicsStrict(fullText);

  // If record has existing topics, keep only those that have strict verbatim evidence
  if (groundedTopics.length > 0) {
    r.topics = groundedTopics;
    regroundedCount++;
  } else if (r.topics && r.topics.length > 0) {
    // If none matched, retain at most 1 primary topic if present in text
    const lowerText = fullText.toLowerCase();
    const valid = r.topics.filter(t => lowerText.includes(t.toLowerCase()));
    r.topics = valid.length > 0 ? valid : [r.topics[0]];
  }

  const qAfter = computeEvidenceQuality(r);
  if (qAfter.evidenceFlags.includes('unsupported_topics')) afterUnsupportedTopics++;
});

fs.writeFileSync(experiencesPath, JSON.stringify(experiences, null, 2));

console.log('========================================================================================');
console.log('  VERBATIM TOPIC RE-GROUNDING COMPLETE');
console.log('========================================================================================');
console.log(`Total Records Processed       : ${experiences.length}`);
console.log(`Records Re-grounded           : ${regroundedCount}`);
console.log(`Before unsupported_topics Flag: ${beforeUnsupportedTopics} (${((beforeUnsupportedTopics / experiences.length) * 100).toFixed(1)}%)`);
console.log(`After unsupported_topics Flag : ${afterUnsupportedTopics} (${((afterUnsupportedTopics / experiences.length) * 100).toFixed(1)}%)`);
console.log('========================================================================================\n');
