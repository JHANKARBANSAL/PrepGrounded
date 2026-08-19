/**
 * data/apply_corrections.js — audit se mile errors ko fix karta hai
 * Run: node data/apply_corrections.js
 *
 * KYUN: audit ka point sirf ek number nikalna nahi hai — jo galtiyan mili
 * unhe THEEK karna hai. Ye script har correction ko uske reason ke saath
 * apply karti hai, taaki record rahe ki kya badla aur kyun.
 *
 * Har correction ke saath `evidence` hai — wo audit note se aaya hai, jo
 * source page ko actually padh kar likha gaya tha.
 *
 * Chalane ke baad: node data/check.js && node eval/run_eval.js
 * (topics badle hain toh embeddings apne aap re-generate hongi — cache
 *  text-hash pe keyed hai, toh sirf badle hue records re-embed honge)
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'experiences.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const byId = Object.fromEntries(data.map(r => [r.id, r]));

/* ==========================================================================
   HARD FIELD ERRORS — ye sabse serious hain
   ========================================================================== */

const FIELD_FIXES = [
  {
    id: 'gfg_amazon_2025_01',
    field: 'year', from: 2025, to: 2024,
    evidence: 'Article title/URL says "October 2025" but the page Last-Updated date is 28 Oct 2024. ' +
              'A post cannot describe an interview a year after publication — the extractor copied an erroneous title year.',
  },
  {
    id: 'prepinsta_pwc_2022_30',
    field: 'outcome', from: 'selected', to: 'unknown',
    evidence: 'The page never states whether the candidate was selected or rejected. ' +
              'The extraction asserted "selected" — a fabricated positive outcome. Most serious error in the audit.',
  },
  {
    id: 'gfg_tcs_2026_01',
    field: 'total_rounds', from: 4, to: 3,
    evidence: 'The post labels three rounds (Technical, Managerial, HR). The extraction counted the ' +
              'opening introduce-yourself exchange as a separate round.',
  },
  {
    id: 'gfg_qualityengineeringanalyst_2025_mszyzbxt_0h1e',
    field: 'company', from: 'Quality Engineering Analyst', to: 'Infosys',
    evidence: 'Article title and text explicitly state: Quality Engineering Analyst interview experience at Infosys. Extractor merged job title into company field.',
  },
  {
    id: 'gfg_qualityengineeringanalyst_2025_mszyzbxt_0h1e',
    field: 'role', from: 'SDE', to: 'Quality Engineering Analyst',
    evidence: 'Corrected job role to Quality Engineering Analyst based on original article text.',
  },
];

/* ==========================================================================
   TOPIC FALSE POSITIVES — extraction ne topic infer kiya, question se nahi
   ========================================================================== */

const TOPIC_REMOVALS = [
  { id: 'medium_salesforce_2025_29', topic: 'Projects',
    evidence: 'Round 4 is system design (Facebook search, parking lot), not a project walkthrough.' },
  { id: 'medium_wipro_2022_06', topic: 'Strings',
    evidence: 'Both coding problems are array/logic based — no string manipulation question.' },
  { id: 'medium_wipro_2022_06', topic: 'OOPs',
    evidence: 'The Java questions are syntax/keyword trivia, not OOP-principles questions.' },
  { id: 'leetcode_amazon_2019_24', topic: 'Greedy',
    evidence: 'No greedy problem appears. Trapping Rain Water is two-pointer/DP; Building Bridges is LIS/DP.' },
  { id: 'gfg_amazon_2025_02', topic: 'Projects',
    evidence: '"Current working role and responsibility" is a behavioural/LP question, not a project walkthrough.' },
  { id: 'leetcode_adobe_2021_06', topic: 'OOPs',
    evidence: 'HashMap internals is a data-structure question, not an OOP-principles question.' },
  { id: 'leetcode_salesforce_2021_13', topic: 'Projects',
    evidence: 'The design question drew on the candidate\'s experience but no project walkthrough is described.' },
  { id: 'prepinsta_cisco_2023_34', topic: 'Aptitude',
    evidence: 'OA MCQs cover networking/OS/cybersecurity/programming — no quantitative/logical/verbal section.' },
];

/* ==========================================================================
   TOPIC FALSE NEGATIVES — post mein tha par extraction ne miss kiya
   ========================================================================== */

const TOPIC_ADDITIONS = [
  { id: 'medium_oracle_2023_24', topic: 'Projects',
    evidence: 'The managerial round includes a discussion of two of the candidate\'s projects.' },
  { id: 'medium_deloitte_2020_16', topic: 'DBMS',
    evidence: 'The L3 round asks how the database was connected to the e-commerce site and to name the tables created.' },
  { id: 'prepinsta_cisco_2023_34', topic: 'Greedy',
    evidence: 'The OA coding section explicitly includes a greedy-algorithm problem.' },
  { id: 'gfg_microsoft_2021_02', topic: 'Behavioral',
    evidence: 'The AA round includes general behavioural/background and university-performance questions.' },
];

/* ==========================================================================
   APPLY
   ========================================================================== */

const log = [];
let applied = 0, skipped = 0;

console.log('\n' + '='.repeat(66));
console.log('  APPLYING AUDIT CORRECTIONS');
console.log('='.repeat(66));

console.log('\n  FIELD FIXES');
for (const fix of FIELD_FIXES) {
  const r = byId[fix.id];
  if (!r) { console.log(`  ⚠️  ${fix.id} not found — skipped`); skipped++; continue; }

  // Idempotent: agar pehle se fix ho chuka hai toh dobara mat karo
  if (r[fix.field] === fix.to) {
    console.log(`  ↺  ${fix.id}.${fix.field} already ${fix.to}`);
    continue;
  }
  if (r[fix.field] !== fix.from) {
    console.log(`  ⚠️  ${fix.id}.${fix.field} is "${r[fix.field]}", expected "${fix.from}" — skipped`);
    skipped++; continue;
  }

  r[fix.field] = fix.to;
  console.log(`  ✅ ${fix.id}.${fix.field}: ${fix.from} → ${fix.to}`);
  log.push({ ...fix, type: 'field_fix' });
  applied++;
}

console.log('\n  TOPIC REMOVALS (false positives)');
for (const fix of TOPIC_REMOVALS) {
  const r = byId[fix.id];
  if (!r) { console.log(`  ⚠️  ${fix.id} not found`); skipped++; continue; }

  if (!(r.topics || []).includes(fix.topic)) {
    console.log(`  ↺  ${fix.id}: "${fix.topic}" already absent`);
    continue;
  }

  r.topics = r.topics.filter(t => t !== fix.topic);
  // Round-level topics bhi saaf karo, warna aggregate aur round-level
  // distributions mein mismatch ho jaayega
  (r.rounds || []).forEach(rd => {
    if (rd.topics) rd.topics = rd.topics.filter(t => t !== fix.topic);
  });
  console.log(`  ✅ ${fix.id}: removed "${fix.topic}"`);
  log.push({ ...fix, type: 'topic_removal' });
  applied++;
}

console.log('\n  TOPIC ADDITIONS (false negatives)');
for (const fix of TOPIC_ADDITIONS) {
  const r = byId[fix.id];
  if (!r) { console.log(`  ⚠️  ${fix.id} not found`); skipped++; continue; }

  if ((r.topics || []).includes(fix.topic)) {
    console.log(`  ↺  ${fix.id}: "${fix.topic}" already present`);
    continue;
  }

  r.topics = [...(r.topics || []), fix.topic];
  console.log(`  ✅ ${fix.id}: added "${fix.topic}"`);
  log.push({ ...fix, type: 'topic_addition' });
  applied++;
}

/* ---------------- write ---------------- */

if (applied > 0) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

  // Embedding cache invalidate karo — topics badle hain toh embed text badla hai.
  // Cache text-hash pe keyed hai, toh technically apne aap handle ho jaata,
  // par explicit delete se koi doubt nahi rehta.
  const cacheFile = path.join(__dirname, '.embeddings.json');
  if (fs.existsSync(cacheFile)) {
    fs.unlinkSync(cacheFile);
    console.log('\n  🗑  embedding cache cleared — agle run pe re-embed hoga');
  }
}

// Audit trail — kya badla aur kyun, permanent record
fs.writeFileSync(
  path.join(__dirname, 'CORRECTIONS.json'),
  JSON.stringify({
    appliedAt: 'post-audit',
    source: '20-record extraction audit against original source pages',
    totalCorrections: log.length,
    corrections: log,
  }, null, 2)
);

console.log('\n' + '='.repeat(66));
console.log(`  ${applied} corrections applied, ${skipped} skipped`);
console.log('  → data/CORRECTIONS.json (audit trail)');
console.log('\n  Ab chalao:  node data/check.js  &&  node eval/run_eval.js');
console.log('='.repeat(66) + '\n');
