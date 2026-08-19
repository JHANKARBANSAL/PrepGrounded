/**
 * data/evidence_quality_audit.js — Evidence Quality V2 Full Corpus Audit & V1 vs V2 Comparison
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

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = a => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

(async () => {
  await corpus.warmup();
  const all = store.experiences.all();

  const v2Results = all.map(r => ({ record: r, quality: computeEvidenceQuality(r) }));
  const scoresV2 = v2Results.map(x => x.quality.evidenceQuality);

  const countsV2 = { High: 0, Medium: 0, Limited: 0 };
  const flagCounts = {};
  const outcomes = { selected: 0, rejected: 0, unknown: 0 };
  let selMissingEvidence = 0;
  let rejMissingEvidence = 0;

  const bySource = {};
  const byCompany = {};
  const suspiciousRecords = [];

  for (const { record: r, quality: q } of v2Results) {
    countsV2[q.evidenceLabel]++;
    outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;

    if (r.outcome === 'selected' && q.explicitOutcomeEvidenceMissing) selMissingEvidence++;
    if (r.outcome === 'rejected' && q.explicitOutcomeEvidenceMissing) rejMissingEvidence++;

    for (const flag of q.evidenceFlags) {
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    }

    if (q.evidenceFlags.includes('suspicious_company_role_mapping') || q.evidenceFlags.includes('missing_source_metadata')) {
      suspiciousRecords.push({ id: r.id, company: r.company, role: r.role, flags: q.evidenceFlags });
    }

    const site = r.source_site || 'Unknown';
    (bySource[site] = bySource[site] || []).push(q.evidenceQuality);

    const comp = r.company || 'Unknown';
    (byCompany[comp] = byCompany[comp] || []).push(q.evidenceQuality);
  }

  console.log('========================================================================================');
  console.log('  EVIDENCE QUALITY V2 FULL CORPUS AUDIT REPORT (204 Records)');
  console.log('========================================================================================\n');

  console.log('--- 1. V1 VS V2 COMPARISON SUMMARY ---');
  console.log('Metric                     | Evidence Quality V1  | Evidence Quality V2');
  console.log('-'.repeat(75));
  console.log(`High Tier (Score Threshold)| >= 0.75              | >= 0.80`);
  console.log(`High Count (% of Corpus)   | 204 (100.0%)         | ${countsV2.High} (${((countsV2.High / 204) * 100).toFixed(1)}%)`);
  console.log(`Medium Count (% of Corpus) | 0 (0.0%)             | ${countsV2.Medium} (${((countsV2.Medium / 204) * 100).toFixed(1)}%)`);
  console.log(`Limited Count (% of Corpus)| 0 (0.0%)             | ${countsV2.Limited} (${((countsV2.Limited / 204) * 100).toFixed(1)}%)`);
  console.log(`Mean Score                 | 0.900                | ${avg(scoresV2).toFixed(3)}`);
  console.log(`Median Score               | 0.900                | ${median(scoresV2).toFixed(3)}`);
  console.log(`Min Score / Max Score      | 0.760 / 0.980        | ${Math.min(...scoresV2).toFixed(2)} / ${Math.max(...scoresV2).toFixed(2)}`);

  console.log('\n--- 2. MOST COMMON EVIDENCE QUALITY FLAGS ---');
  const sortedFlags = Object.entries(flagCounts).sort((a, b) => b[1] - a[1]);
  for (const [flag, count] of sortedFlags) {
    console.log(`  ${flag.padEnd(35)} : ${count} records (${((count / 204) * 100).toFixed(1)}%)`);
  }

  console.log('\n--- 3. OUTCOME INTEGRITY AUDIT ---');
  console.log(`  Total Selected Records:                    ${outcomes.selected}`);
  console.log(`  Selected Missing Explicit Text Evidence:  ${selMissingEvidence} (${((selMissingEvidence / outcomes.selected) * 100).toFixed(1)}%)`);
  console.log(`  Total Rejected Records:                    ${outcomes.rejected}`);
  console.log(`  Rejected Missing Explicit Text Evidence:  ${rejMissingEvidence} (${((rejMissingEvidence / outcomes.rejected) * 100).toFixed(1)}%)`);
  console.log(`  Total Unknown Records (No Fabrication):    ${outcomes.unknown}`);

  console.log('\n--- 4. AVERAGE QUALITY BY SOURCE SITE (V2) ---');
  for (const [site, scores] of Object.entries(bySource)) {
    console.log(`  ${site.padEnd(20)} : ${scores.length} records | avg quality = ${avg(scores).toFixed(3)}`);
  }

  console.log('\n--- 5. AVERAGE QUALITY BY TOP COMPANIES (>= 5 records) ---');
  for (const [comp, scores] of Object.entries(byCompany)) {
    if (scores.length >= 5) {
      console.log(`  ${comp.padEnd(20)} : ${scores.length} records | avg quality = ${avg(scores).toFixed(3)}`);
    }
  }

  if (suspiciousRecords.length > 0) {
    console.log('\n--- 6. SUSPICIOUS RECORDS REPORT ---');
    suspiciousRecords.forEach(sr => {
      console.log(`  [${sr.id}] ${sr.company} — ${sr.role} | Flags: ${sr.flags.join(', ')}`);
    });
  }

  console.log('\n========================================================================================\n');
})();
