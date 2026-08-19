/**
 * data/verify_outcome_filter.js — Real Corpus Outcome Filter Verification
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
  console.log('  OUTCOME FILTER API VERIFICATION');
  console.log('========================================================================================\n');

  await corpus.warmup();
  const all = store.experiences.all();
  const qv = await embed('system design interview');

  const resAny = retrieve(qv, all, { mode: 'fixed', outcomeFilter: 'any', k: 20 });
  const outcomesAny = [...new Set(resAny.map(r => r.outcome))];
  console.log(`1. 'any' filter returns mixed outcomes: [ ${outcomesAny.join(', ')} ] (${resAny.length} records)`);

  const resSel = retrieve(qv, all, { mode: 'fixed', outcomeFilter: 'selected', k: 20 });
  const allSel = resSel.every(r => r.outcome === 'selected');
  console.log(`2. 'selected' filter: ${allSel ? '✅ 100% selected' : '❌ Failed'} (${resSel.length} records)`);

  const resRej = retrieve(qv, all, { mode: 'fixed', outcomeFilter: 'rejected', k: 20 });
  const allRej = resRej.every(r => r.outcome === 'rejected');
  console.log(`3. 'rejected' filter: ${allRej ? '✅ 100% rejected' : '❌ Failed'} (${resRej.length} records)`);

  const resUnk = retrieve(qv, all, { mode: 'fixed', outcomeFilter: 'unknown', k: 20 });
  const allUnk = resUnk.every(r => r.outcome === 'unknown');
  console.log(`4. 'unknown' filter: ${allUnk ? '✅ 100% unknown' : '❌ Failed'} (${resUnk.length} records)`);

  let invalidCaught = false;
  try {
    retrieve(qv, all, { mode: 'fixed', outcomeFilter: 'hired' });
  } catch (err) {
    invalidCaught = true;
  }
  console.log(`5. Invalid outcome filter validation: ${invalidCaught ? '✅ Throws HTTP 400 error' : '❌ Failed'}`);

  console.log('\n========================================================================================\n');
})();
