/**
 * eval/rag_trace.js — RAG kahan hai, live trace
 * Run: node eval/rag_trace.js
 *
 * Ek analyze request ko step-by-step chalata hai aur har stage pe batata hai
 * ki wo RAG ka hissa hai ya nahi. Viva ke liye ye script khud ek jawab hai.
 */

process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'mock';

const corpus = require('../server/src/services/corpus.service');
const store = require('../server/src/store');
const { embed } = require('../server/src/services/embedding.service');
const { retrieve } = require('../server/src/services/retrieval.service');
const { computeStats, computeGaps } = require('../server/src/services/aggregation.service');
const { buildPlan } = require('../server/src/services/planner.service');

const COMPANY = 'Amazon';
const SKILLS = ['Arrays', 'OOPs'];

const hr = (s) => console.log('\n' + '─'.repeat(72) + '\n  ' + s + '\n' + '─'.repeat(72));

(async () => {
  await corpus.warmup();
  const all = store.experiences.all();
  const companyRecords = all.filter(e => e.company === COMPANY);

  console.log('\n' + '='.repeat(72));
  console.log(`  RAG TRACE — company: ${COMPANY}, resume skills: [${SKILLS.join(', ')}]`);
  console.log('='.repeat(72));

  /* ---------------------------------------------------------------- */
  hr('STEP 1 — computeStats()          ❌ RAG NAHI  (aggregation.service.js)');

  const stats = computeStats(companyRecords, { monthsBack: 24 });
  console.log(`  Kya hua: ${companyRecords.length} records pe LOOP chala, har topic gina.`);
  console.log('  Kyun RAG nahi: ye poore corpus pe counting hai. RAG sirf top-k');
  console.log('  documents laata hai — wo 31 mein se 20 gin nahi sakta.\n');
  stats.topicFrequency.slice(0, 4).forEach(t =>
    console.log(`      ${t.topic.padEnd(12)} ${t.count}/${t.total}  (${t.pct}%)`));
  console.log('\n  ⚠️  Yahan ek bhi LLM call nahi hui. Ye plain JavaScript hai.');

  /* ---------------------------------------------------------------- */
  hr('STEP 2 — computeGaps()           ❌ RAG NAHI  (aggregation.service.js)');

  const { gaps, readinessScore } = computeGaps(SKILLS, stats);
  console.log('  Kya hua: Set difference — company ke topics MINUS resume ke topics.');
  console.log(`  resume  : [${SKILLS.join(', ')}]`);
  console.log(`  gaps    : [${gaps.slice(0, 5).map(g => g.topic).join(', ')}]`);
  console.log(`  readiness: ${readinessScore}%`);
  console.log('\n  ⚠️  Ye bhi plain code hai. LLM se karwate toh wo aise topics');
  console.log('  nikaal deta jo stats mein hain hi nahi.');

  /* ---------------------------------------------------------------- */
  hr('STEP 3 — embed(query)            🔴 RAG ka "R" shuru  (embedding.service.js)');

  const query = `${COMPANY} SDE-1 interview process rounds questions ` +
                gaps.slice(0, 4).map(g => g.topic).join(' ');
  console.log(`  query   : "${query}"`);
  console.log('\n  Note: gaps ko query mein DAALA hai. Isse retrieval un records ko');
  console.log('  dhoondega jo student ke ACTUAL weak points se related hain,');
  console.log('  generic company info nahi.');

  const qv = await embed(query);
  console.log(`\n  query vector: [${qv.slice(0, 6).map(v => v.toFixed(3)).join(', ')}, ...] (${qv.length} dims)`);

  /* ---------------------------------------------------------------- */
  hr('STEP 4 — retrieve()              🔴 RAG ka "R"  ⭐ NOVELTY YAHIN  (retrieval.service.js)');

  const evidence = retrieve(qv, all, {
    mode: 'adaptive', company: COMPANY, k: 8,
    driftProfiles: corpus.getDriftProfiles(),
  });

  console.log(`  ${all.length} records mein se top-8 chune gaye.`);
  console.log('  Scoring: 0.60×similarity + 0.30×recency + 0.10×outcome\n');
  console.log('    rank  year   sim    rec    out    final   topics');
  evidence.forEach((e, i) => {
    const s = e._scores;
    console.log(`     ${String(i + 1).padStart(2)}   ${e.year}  ${s.similarity.toFixed(2)}   ${s.recency.toFixed(2)}   ${s.outcome.toFixed(2)}   ${s.final.toFixed(3)}   ${(e.topics || []).slice(0, 3).join(', ')}`);
  });
  console.log('\n  ⭐ Standard RAG yahan SIRF "sim" column dekhta. Humne recency aur');
  console.log('  outcome add kiye — aur λ har company ke liye data se derive hota hai.');

  /* ---------------------------------------------------------------- */
  hr('STEP 5 — buildPrompt()           🔴 RAG ka "A" (Augmented)  (planner.service.js)');

  const preview = evidence.slice(0, 2).map(e =>
    `[${e.id}] (${e.company}, ${e.month || '?'}/${e.year}, ${e.outcome}) topics=${(e.topics || []).join(',')} | ${String(e.raw_text).slice(0, 90)}...`
  ).join('\n      ');

  console.log('  Wo 8 retrieved records ka TEXT prompt ke andar daala jaata hai:\n');
  console.log('      ' + preview);
  console.log(`      ... (aur ${evidence.length - 2} records)`);
  console.log('\n  Yehi "Augmentation" hai — LLM ko apne training data ke bajaye');
  console.log('  HAMARE documents ke basis pe jawab dena padega.');

  /* ---------------------------------------------------------------- */
  hr('STEP 6 — buildPlan()             🔴 RAG ka "G" (Generation)  (planner.service.js)');

  const plan = await buildPlan({ company: COMPANY, role: 'SDE-1', skills: SKILLS, stats, gaps, evidence });

  console.log(`  generatedBy: ${plan.generatedBy}`);
  console.log('  (mock mode → deterministic template. Gemini key daalo toh LLM chalega.)\n');
  plan.weeks.forEach(w =>
    console.log(`    Week ${w.week}: ${w.focus.slice(0, 60)}\n             cited: ${(w.citations || []).join(', ')}`));

  console.log('\n  Har week ke saath CITATION hai — matlab har recommendation un 8');
  console.log('  retrieved records se traceable hai. Yahi "grounded" ka matlab hai.');

  /* ---------------------------------------------------------------- */
  console.log('\n' + '='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log(`
    Step 1  computeStats()    ❌  counting (plain JS)
    Step 2  computeGaps()     ❌  set difference (plain JS)
    Step 3  embed(query)      🔴  R  — query ko vector banao
    Step 4  retrieve()        🔴  R  — top-8 dhoondo   ⭐ novelty
    Step 5  buildPrompt()     🔴  A  — records prompt mein daalo
    Step 6  buildPlan()       🔴  G  — LLM likhe, citations ke saath

    RAG = Steps 3-6.  Steps 1-2 RAG nahi hain, par unke bina plan
    generic hota — wahi "31/40" wala number dete hain jo RAG nahi de sakta.
`);
})();
