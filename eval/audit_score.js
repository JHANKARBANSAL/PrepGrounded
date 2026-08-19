/**
 * eval/audit_score.js — EXTRACTION AUDIT ka step 2
 * Run: node eval/audit_score.js
 *
 * audit_answers.json padhta hai aur report ke liye numbers nikaalta hai.
 */

const fs = require('fs');
const path = require('path');

const answers = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'audit_answers.json'), 'utf8')
);

const filled = answers.filter(a => a.year_ok !== null);

if (filled.length === 0) {
  console.log('\n⚠️  audit_answers.json abhi khaali hai. Pehle worksheet padh ke bharo.\n');
  process.exit(0);
}

if (filled.length < answers.length) {
  console.log(`\n⚠️  ${filled.length}/${answers.length} bhare hain. Numbers partial hain.\n`);
}

const pct = n => (n * 100).toFixed(1) + '%';
const rate = (num, den) => (den === 0 ? 0 : num / den);

// ---- field-level accuracy: simple sahi/galat ----
const yearAcc = rate(filled.filter(a => a.year_ok).length, filled.length);
const outcomeAcc = rate(filled.filter(a => a.outcome_ok).length, filled.length);
const roundsAcc = rate(filled.filter(a => a.rounds_ok).length, filled.length);

// ---- topic precision & recall ----
//
// precision = "jo topics system ne nikale, unme se kitne sahi the"
//             → galat topics kitne add kiye (false positives)
//
// recall    = "post mein jo topics the, unme se kitne system ne pakde"
//             → kitne miss kar diye (false negatives)
//
// Dono chahiye. Sirf precision dekhoge toh ek system jo har record pe
// sirf ek topic nikaalta hai wo 100% precision dikhayega — par useless hoga.
const totalExtracted = filled.reduce((s, a) => s + (a._extracted_topics_count || 0), 0);
const totalCorrect = filled.reduce((s, a) => s + (a.topics_correct || 0), 0);
const totalMissed = filled.reduce((s, a) => s + (a.topics_missed || 0), 0);

const precision = rate(totalCorrect, totalExtracted);
const recall = rate(totalCorrect, totalCorrect + totalMissed);
const f1 = precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);

console.log('\n' + '='.repeat(58));
console.log(`  EXTRACTION AUDIT  —  n = ${filled.length} records`);
console.log('='.repeat(58));

console.log('\n  FIELD ACCURACY');
console.log('  ' + '─'.repeat(40));
console.log(`  year        ${pct(yearAcc).padStart(7)}`);
console.log(`  outcome     ${pct(outcomeAcc).padStart(7)}`);
console.log(`  rounds      ${pct(roundsAcc).padStart(7)}`);

console.log('\n  TOPIC EXTRACTION');
console.log('  ' + '─'.repeat(40));
console.log(`  extracted   ${String(totalExtracted).padStart(7)}  (system ne nikale)`);
console.log(`  correct     ${String(totalCorrect).padStart(7)}  (unme se sahi)`);
console.log(`  missed      ${String(totalMissed).padStart(7)}  (the par pakde nahi)`);
console.log('');
console.log(`  precision   ${pct(precision).padStart(7)}  ← galat topics kitne add kiye`);
console.log(`  recall      ${pct(recall).padStart(7)}  ← sahi topics kitne miss kiye`);
console.log(`  F1          ${pct(f1).padStart(7)}  ← dono ka harmonic mean`);

console.log('\n  ' + '─'.repeat(40));
if (f1 >= 0.85) {
  console.log('  ✅ Strong. Corpus par bharosa kiya ja sakta hai.');
} else if (f1 >= 0.70) {
  console.log('  ⚠️  Theek hai par perfect nahi. Report mein ye number likhna,');
  console.log('     aur downstream percentages ko "approximate" bolna.');
} else {
  console.log('  🔴 Kamzor. Extraction prompt sudharna padega aur re-extract');
  console.log('     karna padega. Is corpus pe aage build karna risky hai.');
}

console.log('\n  REPORT KE LIYE EK LINE:');
console.log(`  "Extraction was validated on a ${filled.length}-record manual audit:`);
console.log(`   year accuracy ${pct(yearAcc)}, topic precision ${pct(precision)},`);
console.log(`   topic recall ${pct(recall)} (F1 ${pct(f1)})."`);

const notes = filled.filter(a => a.note && a.note.trim());
if (notes.length) {
  console.log('\n  NOTES:');
  notes.forEach(a => console.log(`   ${a.id}: ${a.note}`));
}
console.log('');
