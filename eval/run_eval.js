/**
 * eval/run_eval.js — full evaluation suite
 * Run: node eval/run_eval.js
 *
 * Do alag tarah ke metrics chalata hai, jaan-boojh kar:
 *
 *   A. RETRIEVAL METRICS (Freshness@10, Staleness@10)
 *      Ye batate hain ki scoring ne kya kiya. PAR ye thode circular hain —
 *      humne recency term daali, recency metric improve hoga. Isliye ye
 *      SUPPORTING evidence hai, main claim nahi.
 *
 *   B. HOLDOUT PREDICTION METRIC (Topic Hit Rate@5)
 *      Corpus 2023 tak kaat kar, 2024-26 chhupa kar test. Ye circular NAHI
 *      hai — system ne jawab dekha hi nahi. YE AAPKA MAIN CLAIM HAI.
 *
 * Output: console + eval/RESULTS.md (report mein seedha paste ho jaayega)
 */

process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';

const fs = require('fs');
const path = require('path');
const corpus = require('../server/src/services/corpus.service');
const store = require('../server/src/store');
const { embed } = require('../server/src/services/embedding.service');
const { retrieve, WEIGHTS } = require('../server/src/services/retrieval.service');

const QUERIES = JSON.parse(fs.readFileSync(path.join(__dirname, 'queries.json'), 'utf8'));
const MODES = ['baseline', 'fixed', 'adaptive'];
const K = 10;
const HOLDOUT_CUTOFF = 2023;
const TOPIC_K = 5;
const NOW = new Date().getFullYear();

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = n => (n * 100).toFixed(1) + '%';

function topTopics(records, n) {
  const count = {};
  for (const r of records) for (const t of new Set(r.topics || [])) count[t] = (count[t] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

function hitRate(predicted, actual) {
  if (!predicted.length || !actual.length) return 0;
  const set = new Set(actual);
  return predicted.filter(t => set.has(t)).length / predicted.length;
}

(async () => {
  await corpus.warmup();
  const all = store.experiences.all();
  const profiles = corpus.getDriftProfiles();

  /* ============ PART A — retrieval metrics ============ */

  const retrievalScores = {};
  for (const mode of MODES) {
    const ages = [];
    for (const q of QUERIES) {
      const qv = await embed(q.query);
      const rows = retrieve(qv, all, { mode, company: q.company, k: K, driftProfiles: profiles });
      rows.forEach(r => ages.push(NOW - r.year));
    }
    retrievalScores[mode] = {
      n: ages.length,
      avgAge: avg(ages),
      freshness: ages.filter(a => a <= 2).length / ages.length,
      staleness: ages.filter(a => a > 4).length / ages.length,
    };
  }

  /* ============ PART B — holdout prediction ============ */

  const eligible = [...new Set(all.map(r => r.company))].filter(c => {
    const train = all.filter(r => r.company === c && r.year <= HOLDOUT_CUTOFF).length;
    const test = all.filter(r => r.company === c && r.year > HOLDOUT_CUTOFF).length;
    return train >= 5 && test >= 3;
  });

  const holdout = {};
  const holdoutDetail = [];

  for (const mode of MODES) holdout[mode] = [];

  for (const company of eligible) {
    const heldOut = all.filter(r => r.company === company && r.year > HOLDOUT_CUTOFF);
    const actual = topTopics(heldOut, TOPIC_K);
    const row = { company, actual, scores: {} };

    for (const mode of MODES) {
      const qv = await embed(`${company} interview process rounds questions`);
      const rows = retrieve(qv, all, {
        mode, company, k: K, maxYear: HOLDOUT_CUTOFF, driftProfiles: profiles,
      });
      const score = hitRate(topTopics(rows, TOPIC_K), actual);
      holdout[mode].push(score);
      row.scores[mode] = score;
    }
    holdoutDetail.push(row);
  }

  /* ============ PART C — per-source breakdown ============ */
  // GFG corpus ka 58% hai. Agar result sirf GFG records pe hai toh wo
  // source-specific artifact ho sakta hai. Isliye alag se check.
  const bySource = {};
  for (const mode of MODES) {
    const sourceAges = {};
    for (const q of QUERIES) {
      const qv = await embed(q.query);
      const rows = retrieve(qv, all, { mode, company: q.company, k: K, driftProfiles: profiles });
      rows.forEach(r => {
        const s = r.source_site || 'unknown';
        (sourceAges[s] = sourceAges[s] || []).push(NOW - r.year);
      });
    }
    bySource[mode] = Object.fromEntries(
      Object.entries(sourceAges).map(([s, ages]) => [s, {
        n: ages.length,
        freshness: ages.filter(a => a <= 2).length / ages.length,
      }])
    );
  }

  /* ============ OUTPUT ============ */

  const B = retrievalScores.baseline, F = retrievalScores.fixed, A = retrievalScores.adaptive;
  const hB = avg(holdout.baseline), hF = avg(holdout.fixed), hA = avg(holdout.adaptive);
  const delta = (from, to) => (from === 0 ? 'n/a' : `${to > from ? '+' : ''}${Math.round((to - from) / from * 100)}%`);

  console.log('\n' + '='.repeat(70));
  console.log('  EVALUATION RESULTS');
  console.log('='.repeat(70));
  console.log(`  corpus: ${all.length} records · queries: ${QUERIES.length} · k=${K}`);
  console.log(`  weights: sim=${WEIGHTS.similarity} rec=${WEIGHTS.recency} out=${WEIGHTS.outcome}\n`);

  console.log('  A. RETRIEVAL METRICS (supporting — partly circular)');
  console.log('  ' + '─'.repeat(58));
  console.log('  Mode        avgAge   Freshness@10   Staleness@10');
  for (const m of MODES) {
    const r = retrievalScores[m];
    console.log(`  ${m.padEnd(11)} ${r.avgAge.toFixed(2).padStart(5)}y ${pct(r.freshness).padStart(11)} ${pct(r.staleness).padStart(14)}`);
  }
  console.log(`\n    baseline → fixed:  freshness ${delta(B.freshness, F.freshness)}, staleness ${delta(B.staleness, F.staleness)}`);

  console.log('\n  B. HOLDOUT PREDICTION (main claim — not circular)');
  console.log('  ' + '─'.repeat(58));
  console.log(`  train ≤${HOLDOUT_CUTOFF}, test >${HOLDOUT_CUTOFF} · ${eligible.length} companies · Topic Hit Rate@${TOPIC_K}`);
  for (const m of MODES) {
    console.log(`  ${m.padEnd(11)} ${avg(holdout[m]).toFixed(3)}  ${'█'.repeat(Math.round(avg(holdout[m]) * 30))}`);
  }
  console.log(`\n    baseline → fixed:    ${hB.toFixed(3)} → ${hF.toFixed(3)}  (${delta(hB, hF)})`);
  console.log(`    fixed → adaptive:    ${hF.toFixed(3)} → ${hA.toFixed(3)}  (${delta(hF, hA)})`);

  const improved = holdoutDetail.filter(r => r.scores.fixed > r.scores.baseline).length;
  console.log(`\n    companies improved:  ${improved}/${eligible.length}`);
  if (improved <= eligible.length / 2) {
    console.log('    ⚠️  Gain aadhe se kam companies se aa raha hai — effect weak hai.');
    console.log('       Report mein sample size aur ye distribution zaroor likhna.');
  }

  /* ---- markdown file ---- */

  let md = `# Evaluation Results

Generated by \`eval/run_eval.js\`.

**Setup:** ${all.length} real records · ${QUERIES.length} queries · k=${K} · weights sim=${WEIGHTS.similarity} rec=${WEIGHTS.recency} out=${WEIGHTS.outcome}

---

## A. Retrieval metrics

> These measure what the scoring function did. They are **partly circular** —
> adding a recency term will improve a recency metric almost by construction.
> Reported as supporting evidence, not as the main claim.

| Mode | Avg age | Freshness@10 | Staleness@10 |
|---|---|---|---|
${MODES.map(m => {
  const r = retrievalScores[m];
  return `| ${m} | ${r.avgAge.toFixed(2)}y | ${pct(r.freshness)} | ${pct(r.staleness)} |`;
}).join('\n')}

Baseline → fixed: freshness ${delta(B.freshness, F.freshness)}, staleness ${delta(B.staleness, F.staleness)}.

---

## B. Temporal holdout prediction — **main claim**

> The corpus is truncated at ${HOLDOUT_CUTOFF}; records from ${HOLDOUT_CUTOFF + 1} onward are hidden
> from the system. The system predicts the top-${TOPIC_K} topics for each company, and
> those predictions are scored against the hidden period's actual top-${TOPIC_K} topics.
> The system never sees the answer, so this metric **cannot be circular**.

**Companies with enough data on both sides of the cutoff:** ${eligible.length} (${eligible.join(', ')})

| Mode | Topic Hit Rate@${TOPIC_K} |
|---|---|
${MODES.map(m => `| ${m} | ${avg(holdout[m]).toFixed(3)} |`).join('\n')}

- baseline → fixed: **${hB.toFixed(3)} → ${hF.toFixed(3)} (${delta(hB, hF)})**
- fixed → adaptive: ${hF.toFixed(3)} → ${hA.toFixed(3)} (${delta(hF, hA)})

### Per-company breakdown

| Company | Held-out actual top-${TOPIC_K} | baseline | fixed | adaptive |
|---|---|---|---|---|
${holdoutDetail.map(r =>
  `| ${r.company} | ${r.actual.join(', ')} | ${r.scores.baseline.toFixed(2)} | ${r.scores.fixed.toFixed(2)} | ${r.scores.adaptive.toFixed(2)} |`
).join('\n')}

**Honest reading:** ${improved} of ${eligible.length} companies improved. ${
  improved <= eligible.length / 2
    ? 'The aggregate gain is driven by a minority of companies, and with n=' + eligible.length +
      ' this is indicative rather than statistically meaningful. The direction supports the hypothesis; the magnitude does not establish it.'
    : 'The gain is distributed across most companies, though n=' + eligible.length + ' remains small.'
}

---

## C. Freshness by source

> The corpus is 58% GeeksforGeeks. If the effect only appeared on one source it
> would be a source artifact rather than a property of the scoring function.

| Source | n (baseline) | baseline | fixed | adaptive |
|---|---|---|---|---|
${Object.keys(bySource.baseline).sort((a, b) => bySource.baseline[b].n - bySource.baseline[a].n).map(s =>
  `| ${s} | ${bySource.baseline[s].n} | ${pct(bySource.baseline[s].freshness)} | ${bySource.fixed[s] ? pct(bySource.fixed[s].freshness) : '—'} | ${bySource.adaptive[s] ? pct(bySource.adaptive[s].freshness) : '—'} |`
).join('\n')}

---

## Limitations

1. **Small corpus.** ${all.length} records across ${new Set(all.map(r => r.company)).size} companies. Holdout evaluation is limited to the ${eligible.length} companies with enough records on both sides of the cutoff.
2. **Selection bias.** Self-reported accounts skew toward candidates who were selected (${all.filter(r => r.outcome === 'selected').length}/${all.length} report a selection). All percentages describe *reported* interviews, not all interviews.
3. **Adaptive λ is not validated at this density.** See \`data/DATA_README.md\` — measured drift correlates inversely with sample size at ~2–3 records per company-year, so the per-company λ values are noise-dominated. The mechanism is implemented; the corpus is not yet dense enough to exercise it.
4. **Extraction accuracy is measured separately** via \`eval/audit_sample.js\` → \`eval/audit_score.js\`.
`;

  fs.writeFileSync(path.join(__dirname, 'RESULTS.md'), md);
  console.log('\n  → eval/RESULTS.md likha gaya (report mein paste karne layak)\n');
})();
