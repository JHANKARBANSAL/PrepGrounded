/**
 * eval/holdout_test.js — NON-CIRCULAR EVALUATION
 * Run: node eval/holdout_test.js
 *
 * PROBLEM YE SOLVE KARTA HAI:
 *   checkpoint_layer1.js ka result thoda self-fulfilling hai — humne scoring
 *   mein recency term daali, aur recency metric (Freshness@10) improve ho gayi.
 *   Obviously hogi. Wo claim trivial hai.
 *
 *   Asli sawaal: kya recency weighting se PREDICTION behtar hoti hai?
 *
 * METHOD — temporal holdout:
 *   1. System ko sirf <= CUTOFF saal ke records dikhao
 *   2. CUTOFF ke baad ke records CHHUPA do — system ne kabhi nahi dekhe
 *   3. System se poocho: "is company mein kya poocha jaayega?"
 *   4. Uske predicted topics ko CHHUPE HUE actual topics se match karo
 *
 *   Ab ye retrieval task nahi, PREDICTION task hai. System jaanta hi nahi
 *   ki jawab kya hai. Circular ho hi nahi sakta.
 *
 * METRIC — Topic Hit Rate@K:
 *   Retrieved records se top-K sabse frequent topics nikaalo (= prediction).
 *   Held-out period ke actual top-K topics se compare karo.
 *   hit rate = kitne predicted topics actual top-K mein the / K
 */

process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';

const corpus = require('../server/src/services/corpus.service');
const store = require('../server/src/store');
const { embed } = require('../server/src/services/embedding.service');
const { retrieve } = require('../server/src/services/retrieval.service');

const CUTOFF = Number(process.env.HOLDOUT_CUTOFF || 2023);  // <= is saal tak dikhega
const K = 5;            // top-K topics compare karenge
const RETRIEVE_K = 10;  // kitne records retrieve karne hain

// Ek company tabhi test hogi jab dono taraf kaafi data ho
const MIN_TRAIN = 5;
const MIN_TEST = 3;


/** Records ki list se top-N sabse frequent topics */
function topTopics(records, n) {
  const count = {};
  for (const r of records) {
    // new Set — ek record mein topic do baar ho toh ek hi baar gino
    for (const t of new Set(r.topics || [])) count[t] = (count[t] || 0) + 1;
  }
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([topic]) => topic);
}

/** Do lists ka overlap, 0 se 1 */
function hitRate(predicted, actual) {
  if (!predicted.length || !actual.length) return 0;
  const actualSet = new Set(actual);
  const hits = predicted.filter(t => actualSet.has(t)).length;
  return hits / predicted.length;
}


(async () => {
  await corpus.warmup();
  const all = store.experiences.all();

  // Kaunsi companies test kar sakte hain?
  const companies = [...new Set(all.map(r => r.company))].filter(c => {
    const train = all.filter(r => r.company === c && r.year <= CUTOFF).length;
    const test = all.filter(r => r.company === c && r.year > CUTOFF).length;
    return train >= MIN_TRAIN && test >= MIN_TEST;
  });

  console.log('\n' + '='.repeat(70));
  console.log(`  TEMPORAL HOLDOUT TEST  —  train: <=${CUTOFF},  test: >${CUTOFF}`);
  console.log('='.repeat(70));
  console.log(`  Metric: Topic Hit Rate@${K} (predicted top-${K} vs held-out actual top-${K})`);
  console.log(`  Companies with enough data on both sides: ${companies.length}`);
  console.log(`    ${companies.join(', ')}\n`);

  if (companies.length === 0) {
    console.log('  ⚠️  Koi company qualify nahi ki. CUTOFF badal ke dekho.');
    return;
  }

  const scores = { baseline: [], fixed: [], adaptive: [] };
  const perCompany = [];

  for (const company of companies) {
    // GROUND TRUTH — held-out period ke actual top topics.
    // System ne ye kabhi nahi dekha.
    const heldOut = all.filter(r => r.company === company && r.year > CUTOFF);
    const actualTopics = topTopics(heldOut, K);

    const row = { company, actual: actualTopics, modes: {} };

    for (const mode of ['baseline', 'fixed', 'adaptive']) {
      // Deliberately generic query — hum topics hint nahi kar rahe,
      // warna prediction leak ho jaayegi
      const qv = await embed(`${company} interview process rounds questions`);

      const retrieved = retrieve(qv, all, {
        mode,
        company,
        k: RETRIEVE_K,
        maxYear: CUTOFF,        // ⭐ yahan holdout lagta hai
        driftProfiles: corpus.getDriftProfiles(),
      });

      const predicted = topTopics(retrieved, K);
      const score = hitRate(predicted, actualTopics);

      scores[mode].push(score);
      row.modes[mode] = { predicted, score };
    }
    perCompany.push(row);
  }

  // ---------- per-company detail ----------
  console.log('  PER COMPANY');
  console.log('  ' + '─'.repeat(66));
  for (const row of perCompany) {
    console.log(`  ${row.company}`);
    console.log(`    actual (held-out) : ${row.actual.join(', ')}`);
    for (const mode of ['baseline', 'fixed', 'adaptive']) {
      const m = row.modes[mode];
      console.log(`    ${mode.padEnd(9)} ${m.score.toFixed(2)}  → ${m.predicted.join(', ')}`);
    }
    console.log('');
  }

  // ---------- summary ----------
  const avg = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

  console.log('  ' + '='.repeat(66));
  console.log('  SUMMARY — average Topic Hit Rate@' + K);
  console.log('  ' + '='.repeat(66));
  for (const mode of ['baseline', 'fixed', 'adaptive']) {
    const a = avg(scores[mode]);
    const bar = '█'.repeat(Math.round(a * 30));
    console.log(`  ${mode.padEnd(10)} ${a.toFixed(3)}  ${bar}`);
  }

  const b = avg(scores.baseline), f = avg(scores.fixed), ad = avg(scores.adaptive);
  console.log('');
  if (f > b) {
    console.log(`  ✅ fixed beats baseline: ${b.toFixed(3)} → ${f.toFixed(3)} (+${Math.round((f - b) / b * 100)}%)`);
    console.log('     Recency weighting genuinely improves PREDICTION, not just');
    console.log('     the recency metric. Ye claim circular nahi hai.');
  } else if (f === b) {
    console.log(`  ⚠️  fixed == baseline (${f.toFixed(3)}). Recency weighting se prediction`);
    console.log('     mein koi farak nahi pada is corpus pe. Honestly report karo.');
  } else {
    console.log(`  ❌ fixed baseline se KHARAB: ${b.toFixed(3)} → ${f.toFixed(3)}`);
    console.log('     Ye ek important negative result hai. Iska matlab is domain mein');
    console.log('     purane records prediction ke liye ab bhi useful hain.');
  }
  console.log(`  adaptive: ${ad.toFixed(3)} (fixed se ${ad > f ? 'behtar' : ad === f ? 'barabar' : 'kam'})`);

  console.log('\n  NOTE: sample chhota hai (' + companies.length + ' companies). Ise indicative maano,');
  console.log('  definitive nahi. Report mein sample size zaroor likhna.\n');
})();
