/**
 * data/freeze_adaptive_v2.js — Frozen Adaptive V2 Profile Generator
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const store = require('../server/src/store');
const corpus = require('../server/src/services/corpus.service');
const { buildDriftProfilesV2, buildDriftProfilesJSD } = require('../server/src/services/drift.service');

(async () => {
  await corpus.warmup();
  const all = store.experiences.all();

  const v2Profiles = buildDriftProfilesV2(all);
  const jsdProfiles = buildDriftProfilesJSD(all);

  console.log('========================================================================================');
  console.log('  FROZEN ADAPTIVE LAMBDA V2 COMPANY TABLE (204 Records)');
  console.log('========================================================================================\n');
  console.log('Company'.padEnd(14) + ' | Method'.padEnd(20) + ' | Hist Rec (<=23) | Hist Yrs | Folds | Raw λ | Alpha | Final λ');
  console.log('-'.repeat(95));

  for (const [company, p] of Object.entries(v2Profiles)) {
    const rawStr = p.rawLambda !== undefined ? p.rawLambda.toFixed(2) : '—';
    const alphaStr = p.shrinkageAlpha !== undefined ? p.shrinkageAlpha.toFixed(4) : '—';
    const finalStr = p.finalLambda !== undefined ? p.finalLambda.toFixed(4) : p.lambda.toFixed(4);
    const foldsStr = p.validationFolds !== undefined ? String(p.validationFolds) : '0';
    const histRecStr = p.historicalSampleSize !== undefined ? String(p.historicalSampleSize) : String(p.sampleSize);
    const histYrsStr = p.historicalYears ? String(p.historicalYears.length) : '—';

    console.log(
      company.padEnd(14) + ' | ' +
      p.method.padEnd(20) + ' | ' +
      histRecStr.padStart(15) + ' | ' +
      histYrsStr.padStart(8) + ' | ' +
      foldsStr.padStart(5) + ' | ' +
      rawStr.padStart(5) + ' | ' +
      alphaStr.padStart(5) + ' | ' +
      finalStr.padStart(7)
    );
  }

  console.log('\n========================================================================================\n');
})();
