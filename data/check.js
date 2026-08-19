/**
 * data/check.js — corpus validator
 * Run: node data/check.js
 *
 * Run this every time you add or edit records. A single record with a
 * typo'd topic ("Dynamic Programming" instead of "DP") silently breaks
 * every percentage your system reports.
 */

const data = require('./experiences.json');

const VOCAB = ['DP','Arrays','Strings','Graphs','Trees','LinkedList','Recursion',
  'Greedy','SlidingWindow','BinarySearch','OOPs','DBMS','OS','Networks',
  'SystemDesign','Aptitude','Behavioral','Projects'];
const ROUND_TYPES = ['OA','DSA','SystemDesign','Technical','HR','Managerial','Behavioral'];
const OUTCOMES = ['selected','rejected','unknown'];

let errors = 0;
const byYear = {}, byCompany = {}, bySource = {}, byOutcome = {};
const seenIds = new Set(), seenUrls = new Set();

data.forEach((e, i) => {
  const where = `[${i}] ${e.id || 'NO_ID'}`;

  if (!e.id) { console.log(`❌ ${where}: missing id`); errors++; }
  else if (seenIds.has(e.id)) { console.log(`❌ ${where}: duplicate id`); errors++; }
  else seenIds.add(e.id);

  if (e.source_url) {
    if (seenUrls.has(e.source_url)) { console.log(`⚠️  ${where}: duplicate source_url`); }
    else seenUrls.add(e.source_url);
  }

  if (!e.company) { console.log(`❌ ${where}: missing company`); errors++; }
  if (!Number.isInteger(e.year) || e.year < 2000 || e.year > new Date().getFullYear() + 1) {
    console.log(`❌ ${where}: bad year "${e.year}"`); errors++;
  }
  if (e.month !== null && e.month !== undefined && (e.month < 1 || e.month > 12)) {
    console.log(`❌ ${where}: bad month "${e.month}"`); errors++;
  }
  if (!OUTCOMES.includes(e.outcome)) { console.log(`❌ ${where}: bad outcome "${e.outcome}"`); errors++; }

  if (!Array.isArray(e.topics) || e.topics.length === 0) {
    console.log(`❌ ${where}: no topics — this record is useless for counting`); errors++;
  } else {
    const invalid = e.topics.filter(t => !VOCAB.includes(t));
    if (invalid.length) { console.log(`❌ ${where}: invalid topics ${JSON.stringify(invalid)}`); errors++; }
  }

  if (!e.raw_text || e.raw_text.length < 20) {
    console.log(`⚠️  ${where}: raw_text too short — citations will look empty`);
  }

  (e.rounds || []).forEach(r => {
    if (!ROUND_TYPES.includes(r.round_type)) {
      console.log(`⚠️  ${where}: unusual round_type "${r.round_type}"`);
    }
    const inv = (r.topics || []).filter(t => !VOCAB.includes(t));
    if (inv.length) { console.log(`❌ ${where} round ${r.round_number}: invalid topics ${JSON.stringify(inv)}`); errors++; }
  });

  byYear[e.year] = (byYear[e.year] || 0) + 1;
  byCompany[e.company] = (byCompany[e.company] || 0) + 1;
  bySource[e.source_site || 'unknown'] = (bySource[e.source_site || 'unknown'] || 0) + 1;
  byOutcome[e.outcome] = (byOutcome[e.outcome] || 0) + 1;
});

console.log('\n' + '='.repeat(60));
console.log(`TOTAL: ${data.length} records | ERRORS: ${errors}`);
console.log('='.repeat(60));

console.log('\nYears:');
Object.keys(byYear).sort().forEach(y => {
  console.log(`  ${y}  ${'█'.repeat(byYear[y])} ${byYear[y]}`);
});

console.log('\nSources:', JSON.stringify(bySource));
console.log('Outcomes:', JSON.stringify(byOutcome));

console.log('\nCompanies (need >=3 distinct years for drift analysis):');
Object.entries(byCompany).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
  const years = new Set(data.filter(r => r.company === c).map(r => r.year));
  const perYear = (n / years.size).toFixed(1);
  const ok = years.size >= 3 ? '✅' : '⚠️ ';
  console.log(`  ${ok} ${c.padEnd(16)} ${String(n).padStart(3)} records, ${years.size} years, ${perYear}/yr`);
});

// The single most important sanity check for this project
const yearCount = Object.keys(byYear).length;
console.log('\n' + '─'.repeat(60));
if (yearCount < 5) {
  console.log('🔴 FAIL: fewer than 5 distinct years. Recency weighting will be invisible.');
} else {
  console.log(`✅ ${yearCount} distinct years — recency weighting will show a measurable effect.`);
}
if (errors > 0) {
  console.log(`🔴 Fix the ${errors} error(s) above before building on this corpus.`);
} else {
  console.log('✅ No schema errors. Corpus is ready.');
}
