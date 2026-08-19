/**
 * data/compare_freshness_e2e.js — E2E Freshness Preference Comparison
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const store = require('../server/src/store');
const corpus = require('../server/src/services/corpus.service');
const { retrieve } = require('../server/src/services/retrieval.service');
const { embed } = require('../server/src/services/embedding.service');

(async () => {
  console.log('========================================================================================');
  console.log('  E2E FRESHNESS PREFERENCE COMPARISON (Company: Amazon, Query: "system design interview")');
  console.log('========================================================================================\n');

  await corpus.warmup();
  const all = store.experiences.all();
  const qv = await embed('system design interview');

  const PRESETS = ['broad', 'balanced', 'recent'];

  for (const pref of PRESETS) {
    const results = retrieve(qv, all, {
      mode: 'fixed',
      company: 'Amazon',
      freshnessPreference: pref,
      k: 3,
    });

    console.log(`--- PREFERENCE: ${pref.toUpperCase()} (lambdaUsed: ${results[0].lambdaUsed}) ---`);
    results.forEach((r, idx) => {
      console.log(
        `  Top ${idx + 1}: ${r.company} | ${r.role || 'SDE'} | Year: ${r.year} | ` +
        `Sim: ${r._scores.similarity} | Rec: ${r._scores.recency} | Final Score: ${r._scores.final}`
      );
    });
    console.log('');
  }

  console.log('========================================================================================\n');
})();
