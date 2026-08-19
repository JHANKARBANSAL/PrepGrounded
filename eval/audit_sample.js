/**
 * eval/audit_sample.js — EXTRACTION AUDIT ka step 1
 * Run: node eval/audit_sample.js
 *
 * KYUN: aapke 139 records ek LLM ne banaye hain. Kitne SAHI hain, ye abhi
 * measure nahi hua. Agar extraction 60% accurate hui toh aapke saare
 * downstream numbers (freshness, topic %, gaps) meaningless hain.
 *
 * Ye script 20 records ka sample nikaal kar do files banati hai:
 *   eval/audit_worksheet.md  — aap ise padhoge (har record + uska source URL)
 *   eval/audit_answers.json  — aap ise BHAROGE (har field sahi hai ya nahi)
 *
 * Phir: node eval/audit_score.js  → precision/recall nikal aayega
 *
 * TIME: ~40 minute. Har record pe ~2 minute.
 */

const fs = require('fs');
const path = require('path');
const store = require('../server/src/store');

const SAMPLE_SIZE = 20;

// Deterministic shuffle — seed fix hai taaki dobara chalane pe WAHI 20
// records aayein. Agar har baar alag sample aata, toh aap adha audit
// karke ruk jaate aur dobara chalane pe naye records aa jaate.
function seededShuffle(arr, seed = 7) {
  const a = [...arr];
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const all = store.experiences.all();
const sample = seededShuffle(all).slice(0, SAMPLE_SIZE);

/* ---------------- worksheet (aap padhoge) ---------------- */

let md = `# Extraction Audit Worksheet
### ${SAMPLE_SIZE} random records — har ek ka source kholo aur verify karo

**Kaise karna hai:**
1. Neeche har record ka \`source_url\` browser mein kholo
2. Post padho (2 minute, poora nahi — bas fields verify karne jitna)
3. \`eval/audit_answers.json\` mein us record ke liye Y/N bharo
4. Sab hone ke baad: \`node eval/audit_score.js\`

**Har field ke liye poochna hai:**
- \`year_ok\` — kya saal sahi hai? (post ki date ya content se)
- \`outcome_ok\` — selected/rejected/unknown sahi hai?
- \`rounds_ok\` — rounds ki ginti sahi hai?
- \`topics_correct\` — extracted topics mein se KITNE sach mein us post mein the? (number)
- \`topics_missed\` — post mein aur kitne topics the jo MISS ho gaye? (number)

> \`topics_correct\` aur \`topics_missed\` se precision aur recall dono nikalti hain.
> Baaki fields sirf sahi/galat hain.

---

`;

sample.forEach((r, i) => {
  md += `## ${i + 1}. \`${r.id}\`

**Source:** ${r.source_url || '(no url)'}

| Field | Extracted value |
|---|---|
| company | ${r.company} |
| role | ${r.role || '—'} |
| year | **${r.year}** |
| month | ${r.month ?? '—'} |
| total_rounds | **${r.total_rounds ?? (r.rounds || []).length}** |
| outcome | **${r.outcome}** |
| topics | **${(r.topics || []).join(', ')}** |

**Questions extracted:**
${(r.questions || []).slice(0, 8).map(q => `- ${q}`).join('\n') || '- (none)'}

**raw_text (pehle 200 chars):**
> ${String(r.raw_text || '').slice(0, 200).replace(/\n/g, ' ')}

---

`;
});

fs.writeFileSync(path.join(__dirname, 'audit_worksheet.md'), md);

/* ---------------- answers template (aap bharoge) ---------------- */

const answers = sample.map(r => ({
  id: r.id,
  source_url: r.source_url,
  _extracted_topics_count: (r.topics || []).length,   // reference ke liye, mat badalna

  // ---- YE BHARNA HAI ----
  year_ok: null,          // true / false
  outcome_ok: null,       // true / false
  rounds_ok: null,        // true / false
  topics_correct: null,   // number: extracted topics mein se kitne sach mein the
  topics_missed: null,    // number: post mein the par extract nahi hue
  note: '',               // koi observation ho toh
}));

fs.writeFileSync(
  path.join(__dirname, 'audit_answers.json'),
  JSON.stringify(answers, null, 2)
);

console.log(`\n✅ Do files ban gayi:\n`);
console.log(`   eval/audit_worksheet.md   ← ye padho (${SAMPLE_SIZE} records)`);
console.log(`   eval/audit_answers.json   ← ye bharo\n`);
console.log(`   Sample: ${sample.length} records`);
console.log(`   Sources: ${[...new Set(sample.map(r => r.source_site))].join(', ')}`);
console.log(`   Years:   ${[...new Set(sample.map(r => r.year))].sort().join(', ')}\n`);
console.log(`   Bharne ke baad: node eval/audit_score.js\n`);
