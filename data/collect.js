#!/usr/bin/env node
/**
 * data/collect.js — Developer CLI Manual Trigger for Ingestion
 *
 * Usage:
 *   node data/collect.js --weekly                          # Runs standard weekly ingestion job
 *   node data/collect.js --test                            # Runs ingestion job in Mock Test Mode
 *   node data/collect.js --source geeksforgeeks --live-test # Tiny live smoke test against GeeksforGeeks
 */

const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const { runWeeklyIngestion } = require('../server/src/pipeline/ingest');

const args = process.argv.slice(2);
const isTestMode = args.includes('--test');
const isWeekly = args.includes('--weekly');
const isLiveTest = args.includes('--live-test');

let sourceIds = null;
const sourceIdx = args.indexOf('--source');
if (sourceIdx !== -1 && args[sourceIdx + 1]) {
  sourceIds = [args[sourceIdx + 1]];
}

if (!isTestMode && !isWeekly && !isLiveTest) {
  console.log(`
Usage:
  node data/collect.js --weekly                          Run weekly ingestion workflow
  node data/collect.js --test                            Run weekly ingestion in mock test mode
  node data/collect.js --source geeksforgeeks --live-test Run tiny live smoke test against GeeksforGeeks
`);
  process.exit(0);
}

(async () => {
  const modeLabel = isLiveTest ? 'LIVE SMOKE TEST MODE' : (isTestMode ? 'MOCK TEST MODE' : 'WEEKLY RUN');
  console.log(`\n============================================================`);
  console.log(`  PREPGROUNDED INGESTION CLI (${modeLabel})`);
  console.log(`============================================================\n`);

  try {
    const summary = await runWeeklyIngestion({
      testMode: isTestMode,
      isLiveTest: isLiveTest,
      manualTrigger: true,
      sourceIds: sourceIds,
      maxCandidates: isLiveTest ? 3 : null,
    });

    console.log(`✅ Ingestion Run Completed [${summary.id}]`);
    console.log(`  Mode:                 ${summary.mode}`);
    console.log(`  Status:               ${summary.status}`);
    console.log(`  Started At:           ${summary.startedAt}`);
    console.log(`  Completed At:         ${summary.completedAt}`);
    console.log(`  Sources Scanned:      ${summary.sourcesScanned.join(', ')}`);
    console.log(`  Candidates Found:     ${summary.candidateUrlsFound}`);
    console.log(`  Duplicates Skipped:   ${summary.duplicatesSkipped}`);
    console.log(`  Successfully Staged:  ${summary.successfullyStaged}`);
    console.log(`  Extraction Failures:  ${summary.extractionFailures}`);
    console.log(`  Validation Failures:  ${summary.validationFailures}`);

    if (summary.errors && summary.errors.length > 0) {
      console.log(`\n⚠️ Errors / Failures (${summary.errors.length}):`);
      summary.errors.forEach((e, idx) => {
        console.log(`  ${idx + 1}. ${e.url || e.source}: ${e.error}`);
      });
    }

    console.log(`\n📌 Staged records land safely in data/staging.json (NOT in approved corpus).\n`);
  } catch (err) {
    console.error('❌ Ingestion run failed:', err);
    process.exit(1);
  }
})();
