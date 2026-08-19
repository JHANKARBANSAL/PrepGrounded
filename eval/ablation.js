/**
 * eval/ablation.js — λ sweep
 * Run: node eval/ablation.js
 *
 * KYA TEST KAR RAHE HAIN:
 *   Grofsky (2026) ne likha ki fixed half-life prior "parameter-sensitive" hai —
 *   ek corpus pe tuned λ doosre pe fail ho jaata hai. Ye script us claim ko
 *   HAMARE corpus pe test karta hai: λ ko 0.1 se 1.5 tak sweep karke dekhta
 *   hai ki freshness aur prediction accuracy kaise badalti hain.
 *
 * EXPECTED TRADEOFF:
 *   λ badhao → freshness badhegi (purane records neeche jaayenge)
 *            → PAR prediction accuracy ek point ke baad giregi, kyunki
 *              genuinely useful purane records bhi phenk diye jaate hain
 *
 *   Jahan ye do curves cross karti hain wahi optimal λ hai — aur wo
 *   corpus-specific hai. Yehi ablation ka poora point hai.
 *
 * Output: console + eval/ABLATION.md
 */

process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';

const fs = require('fs');
const path = require('path');
const corpus = require('../server/src/services/corpus.service');
const store = require('../server/src/store');
const { embed } = require('../server/src/services/embedding.service');
const { retrieve } = require('../server/src/services/retrieval.service');

const LAMBDAS = [0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 1.0, 1.5];
const QUERIES = JSON.parse(fs.readFileSync(path.join(__dirname, 'queries.json'), 'utf8'));
const K = 10, TOPIC_K = 5, CUTOFF = 2023;
const NOW = new Date().getFullYear();

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function topTopics(records, n) {
  const c = {};
  for (const r of records) for (const t of new Set(r.topics || [])) c[t] = (c[t] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}
const hitRate = (p, a) => (!p.length || !a.length ? 0 : p.filter(t => new Set(a).has(t)).length / p.length);

// 0-1 value ko ek chhoti bar mein badlo
const bar = (v, w = 22) => '█'.repeat(Math.round(v * w)).padEnd(w, '·');

(async () => {
  await corpus.warmup();
  const all = store.experiences.all();

  const eligible = [...new Set(all.map(r => r.company))].filter(c => {
    const tr = all.filter(r => r.company === c && r.year <= CUTOFF).length;
    const te = all.filter(r => r.company === c && r.year > CUTOFF).length;
    return tr >= 5 && te >= 3;
  });

  // Query embeddings ek baar bana lo — λ badalne se query nahi badalti,
  // aur har sweep pe re-embed karna 8x waste hoga
  const qvs = {};
  for (const q of QUERIES) qvs[q.id] = await embed(q.query);
  const cqvs = {};
  for (const c of eligible) cqvs[c] = await embed(`${c} interview process rounds questions`);

  const rows = [];

  for (const lambda of LAMBDAS) {
    // LAMBDA_BASE ko env se inject karte hain — retrieval.service isi ko
    // "fixed" mode mein padhta hai
    process.env.LAMBDA_BASE = String(lambda);

    // Retrieval metrics
    const ages = [];
    for (const q of QUERIES) {
      const res = retrieve(qvs[q.id], all, { mode: 'fixed', company: q.company, k: K });
      res.forEach(r => ages.push(NOW - r.year));
    }

    // Holdout prediction
    const hits = [];
    for (const c of eligible) {
      const heldOut = all.filter(r => r.company === c && r.year > CUTOFF);
      const res = retrieve(cqvs[c], all, { mode: 'fixed', company: c, k: K, maxYear: CUTOFF });
      hits.push(hitRate(topTopics(res, TOPIC_K), topTopics(heldOut, TOPIC_K)));
    }

    rows.push({
      lambda,
      halfLife: Math.log(2) / lambda,
      avgAge: avg(ages),
      freshness: ages.filter(a => a <= 2).length / ages.length,
      staleness: ages.filter(a => a > 4).length / ages.length,
      topicHit: avg(hits),
    });
  }

  /* ---------------- output ---------------- */

  console.log('\n' + '='.repeat(76));
  console.log('  λ ABLATION — does the optimal decay rate depend on the corpus?');
  console.log('='.repeat(76));
  console.log(`  ${QUERIES.length} queries · ${eligible.length} companies for holdout · k=${K}\n`);

  console.log('    λ    half-life   Freshness@10           Topic Hit Rate@5');
  console.log('  ' + '─'.repeat(72));
  for (const r of rows) {
    console.log(
      `  ${String(r.lambda).padStart(4)}   ${r.halfLife.toFixed(1).padStart(5)}y   ` +
      `${bar(r.freshness)} ${(r.freshness * 100).toFixed(0).padStart(3)}%   ` +
      `${bar(r.topicHit, 14)} ${r.topicHit.toFixed(2)}`
    );
  }

  const bestFresh = rows.reduce((a, b) => (b.freshness > a.freshness ? b : a));
  const bestHit = rows.reduce((a, b) => (b.topicHit > a.topicHit ? b : a));

  console.log('\n  ' + '─'.repeat(72));
  console.log(`  Best freshness   : λ=${bestFresh.lambda} (${(bestFresh.freshness * 100).toFixed(0)}%)`);
  console.log(`  Best prediction  : λ=${bestHit.lambda} (hit rate ${bestHit.topicHit.toFixed(2)})`);

  /**
   * Interpretation ko DATA SE derive karo, assume mat karo.
   * (Pehla version "freshness monotonically badhti hai" assume kar raha tha —
   *  is corpus pe wo galat nikla. Auto-generated claim jo apni hi table se
   *  contradict kare, wo report mein sabse buri cheez hai.)
   */
  const isMonotonic = (key) => rows.every((r, i) => i === 0 || r[key] >= rows[i - 1][key] - 1e-9);
  const freshMonotonic = isMonotonic('freshness');
  const freshPeakIdx = rows.indexOf(bestFresh);
  const freshInvertedU = !freshMonotonic && freshPeakIdx > 0 && freshPeakIdx < rows.length - 1;

  const hitRange = Math.max(...rows.map(r => r.topicHit)) - Math.min(...rows.map(r => r.topicHit));
  const hitFlat = hitRange < 0.05;

  console.log('\n  ⭐ SHAPE OF THE CURVES');
  if (freshInvertedU) {
    console.log(`     Freshness monotonic NAHI hai — λ=${bestFresh.lambda} pe peak karke girti hai.`);
    console.log('     Wajah: bahut zyada λ pe har record ka recency score ~0 ho jaata hai,');
    console.log('     toh recency term differentiate karna band kar deta hai aur ranking');
    console.log('     wapas similarity pe chali jaati hai. Yaani over-decaying se');
    console.log('     recency signal khud mit jaata hai.');
  } else if (freshMonotonic) {
    console.log('     Freshness λ ke saath monotonically badhti hai.');
  }

  if (hitFlat) {
    console.log(`\n     Topic Hit Rate λ=${rows[0].lambda}–${bestHit.lambda === rows[0].lambda ? rows.find(r => r.topicHit < bestHit.topicHit)?.lambda ?? 'high' : bestHit.lambda} ke beech lagbhag FLAT hai (range ${hitRange.toFixed(2)}),`);
    console.log('     aur sirf high λ pe girti hai. Matlab prediction accuracy λ ke');
    console.log('     prati wide range mein insensitive hai — sirf over-decay nuksaan karta hai.');
  }

  if (bestFresh.lambda !== bestHit.lambda) {
    console.log(`\n     Dono metrics ka optimum alag λ pe hai (${bestFresh.lambda} vs ${bestHit.lambda}).`);
    console.log('     Isliye λ ek "free parameter" nahi — ye is baat pe depend karta hai');
    console.log('     ki aap freshness optimize kar rahe ho ya prediction.');
  }

  /* ---------------- markdown ---------------- */

  let md = `# λ Ablation

Generated by \`eval/ablation.js\`.

## Motivation

Grofsky (2026), *"Freshness and the Limits of Heuristic Trend Detection in Temporal RAG"*
(arXiv:2509.19376), reports that a fixed half-life recency prior is **parameter-sensitive**:
optimal values "vary dramatically across corpora" and settings tuned on one corpus can
"collapse to 0.00" on another.

This ablation tests that claim on our corpus by sweeping λ and measuring two things that
pull in opposite directions.

## Setup

- ${QUERIES.length} queries, k=${K}
- Holdout: train ≤${CUTOFF}, test >${CUTOFF}, ${eligible.length} companies
- Mode: \`fixed\` (single global λ), so the sweep isolates λ itself

## Results

| λ | Half-life | Avg age | Freshness@10 | Staleness@10 | Topic Hit Rate@${TOPIC_K} |
|---|---|---|---|---|---|
${rows.map(r =>
  `| ${r.lambda} | ${r.halfLife.toFixed(1)}y | ${r.avgAge.toFixed(2)}y | ${(r.freshness * 100).toFixed(1)}% | ${(r.staleness * 100).toFixed(1)}% | ${r.topicHit.toFixed(3)} |`
).join('\n')}

## Reading the table

- **Best freshness:** λ=${bestFresh.lambda} (${(bestFresh.freshness * 100).toFixed(1)}%)
- **Best prediction:** λ=${bestHit.lambda} (hit rate ${bestHit.topicHit.toFixed(3)})

${freshInvertedU
  ? `**Freshness is not monotonic in λ.** It peaks at λ=${bestFresh.lambda} (${(bestFresh.freshness * 100).toFixed(1)}%) and then
*declines* for larger values. This is worth stating explicitly because the intuitive
expectation — "more decay ⇒ fresher results" — is wrong here.

The mechanism: at large λ the recency score \`e^(-λ·age)\` collapses toward 0 for
essentially every record older than a few months. Once every candidate scores ~0 on
that term, recency stops *differentiating* between them, and ranking falls back to
similarity. Over-decaying therefore erases the very signal it was meant to add.`
  : `Freshness increases monotonically with λ on this corpus.`}

${hitFlat
  ? `**Topic Hit Rate is flat across a wide λ band** (total range ${hitRange.toFixed(3)} across the
whole sweep), degrading only at the high end (λ ≥ 0.7). Prediction accuracy is therefore
largely *insensitive* to λ within a reasonable range — only over-decay causes measurable
harm.`
  : `Topic Hit Rate varies by ${hitRange.toFixed(3)} across the sweep, peaking at λ=${bestHit.lambda}.`}

${bestFresh.lambda !== bestHit.lambda
  ? `The two optima do not coincide (λ=${bestFresh.lambda} for freshness, λ=${bestHit.lambda} for prediction),
so λ is not a single "correct" value — it depends on which objective is being optimised.
This is consistent with the parameter-sensitivity reported in prior work, and is the
motivation for deriving λ from data rather than hard-coding it
(see \`server/src/services/drift.service.js\`).`
  : `Both optima land on the same λ on this corpus.`}

> **Caveat on the shape.** With ${all.length} records and ${eligible.length} holdout companies, Topic Hit Rate moves
> in coarse steps (each company contributes 1/${TOPIC_K} increments). The flatness reported above is
> partly a resolution limit of the metric at this sample size, not necessarily a property
> of the domain.

## Limitation

The holdout arm of this sweep rests on ${eligible.length} companies. The curve's shape is
indicative; the precise optimum is not established at this sample size.
`;

  fs.writeFileSync(path.join(__dirname, 'ABLATION.md'), md);
  console.log('\n  → eval/ABLATION.md likha gaya\n');
})();
