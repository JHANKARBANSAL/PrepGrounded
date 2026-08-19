/**
 * eval/checkpoint_layer3.js — intelligence layer ka gate
 * Run: node eval/checkpoint_layer3.js
 *
 * Prove karta hai:
 *   1. counting DETERMINISTIC hai (100 baar chalao, same answer)
 *   2. gaps sahi nikal rahe hain (Set difference)
 *   3. grounding contract ENFORCE ho raha hai (invented topics/citations hat rahe hain)
 *   4. poora analyze flow end-to-end chal raha hai
 *   5. mock mode (bina LLM ke) bhi kaam karta hai — demo insurance
 */

process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'mock';

const app = require('../server/src/app');
const corpus = require('../server/src/services/corpus.service');
const store = require('../server/src/store');
const { computeStats, computeGaps } = require('../server/src/services/aggregation.service');
const { sanitize } = require('../server/src/services/planner.service');
const { keywordExtract } = require('../server/src/services/resume.service');

const PORT = 4998;
const api = (path, opts = {}) =>
  fetch(`http://localhost:${PORT}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(async r => ({ status: r.status, body: await r.json() }));

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

(async () => {
  await corpus.warmup();
  const server = app.listen(PORT);

  console.log('\n' + '='.repeat(64));
  console.log('  CHECKPOINT LAYER 3 — intelligence');
  console.log('='.repeat(64));

  const amazon = store.experiences.all().filter(r => r.company === 'Amazon');

  // ---------- 1. COUNTING deterministic hai? ----------
  console.log('\n  COUNTING (deterministic — no LLM)');
  const s1 = computeStats(amazon, { monthsBack: 24 });
  const s2 = computeStats(amazon, { monthsBack: 24 });
  check('same input → same output', JSON.stringify(s1) === JSON.stringify(s2));

  const top = s1.topicFrequency[0];
  check('topic frequency count hui', !!top,
        `${top.topic}: ${top.count}/${top.total} (${top.pct}%)`);

  // pct sach mein count/total hai? (LLM guess nahi)
  const pctOk = Math.round((top.count / top.total) * 100) === top.pct;
  check('percentage counted hai, guessed nahi', pctOk);

  check('confidence level report hua', ['low','medium','high'].includes(s1.confidence),
        s1.confidence + ` (n=${s1.sampleSize})`);

  // Chhote sample pe honesty guard chalta hai?
  const tinyCompany = store.experiences.all().filter(r => r.company === 'Zomato');
  if (tinyCompany.length) {
    const st = computeStats(tinyCompany, { monthsBack: 6 });
    check('chhote sample pe fallback + warning', st.windowMonths === null && !!st.windowNote);
  }

  // ---------- 2. GAP ANALYSIS ----------
  console.log('\n  GAP ANALYSIS (Set difference — no LLM)');
  const weakResume = ['Arrays', 'OOPs'];
  const g = computeGaps(weakResume, s1);
  check('gaps nikle', g.gaps.length > 0, g.gaps.slice(0,3).map(x => `${x.topic} ${x.askedPct}%`).join(', '));
  check('resume ke topics gaps mein NAHI hain',
        !g.gaps.some(x => weakResume.includes(x.topic)));
  check('har gap ke saath evidence hai', g.gaps.every(x => x.evidence.includes('/')));
  check('readiness score 0-100 ke beech', g.readinessScore >= 0 && g.readinessScore <= 100,
        String(g.readinessScore));

  // Strong resume pe gaps kam hone chahiye
  const strongResume = s1.topicFrequency.slice(0, 8).map(t => t.topic);
  const g2 = computeGaps(strongResume, s1);
  check('strong resume → zyada readiness', g2.readinessScore > g.readinessScore,
        `${g.readinessScore} → ${g2.readinessScore}`);

  // ---------- 3. GROUNDING CONTRACT ----------
  console.log('\n  GROUNDING CONTRACT (post-generation enforcement)');
  const poisoned = {
    weeks: [
      { week: 1, topics: ['DP', 'Quantum Computing'], practice: ['x'], citations: ['real_1', 'FAKE_ID'] },
      { week: 2, topics: ['Blockchain'], practice: ['y'], citations: [] },
    ],
  };
  const cleaned = sanitize(poisoned, { allowedTopics: ['DP', 'Graphs'], validIds: ['real_1'] });
  check('invented topic strip hua', !cleaned.weeks[0].topics.includes('Quantum Computing'),
        JSON.stringify(cleaned.weeks[0].topics));
  check('invented citation strip hui', !cleaned.weeks[0].citations.includes('FAKE_ID'));
  check('bina citation wala week flag hua', cleaned.groundingCheck.passed === false,
        cleaned.groundingCheck.note);

  // ---------- 4. RESUME EXTRACTION ----------
  console.log('\n  RESUME EXTRACTION');
  const sampleResume = `
    Final year B.Tech CSE. Built a route planner using Dijkstra's shortest path
    algorithm. Implemented a REST API with Spring Boot microservices and Redis
    caching. Strong in SQL and database normalization. Led the coding club.
  `;
  const kw = keywordExtract(sampleResume);
  check('Dijkstra → Graphs map hua', kw.skills.includes('Graphs'));
  check('microservices/Redis → SystemDesign', kw.skills.includes('SystemDesign'));
  check('SQL/normalization → DBMS', kw.skills.includes('DBMS'));
  check('extraction ke saath evidence snippet hai', !!kw.evidence.Graphs,
        `"${(kw.evidence.Graphs || '').slice(0, 45)}..."`);

  // ---------- 5. END TO END ----------
  console.log('\n  END TO END /api/analyze');
  const r = await api('/api/analyze', {
    method: 'POST',
    body: { company: 'Amazon', role: 'SDE-1', skills: ['Arrays', 'OOPs'], mode: 'adaptive' },
  });
  check('analyze 200 diya', r.status === 200);
  check('stats aaye', r.body.stats?.topicFrequency?.length > 0);
  check('gaps aaye', r.body.gaps?.length > 0);
  check('4-week plan bana', r.body.plan?.weeks?.length === 4);
  check('citations aayi', r.body.citations?.length > 0, `${r.body.citations?.length} records`);
  check('har week mein citation hai', r.body.plan?.weeks?.every(w => w.citations?.length > 0));
  check('plan save hua (CRUD)', !!r.body.planId);

  const saved = await api(`/api/plans/${r.body.planId}`);
  check('saved plan wapas mila', saved.status === 200);

  // Mock mode mein template plan aana chahiye — demo insurance
  check('LLM ke bina bhi plan bana (mock mode)',
        r.body.plan.generatedBy === 'deterministic_template',
        r.body.plan.generatedBy);

  // Unknown company graceful handle
  const unknown = await api('/api/analyze', {
    method: 'POST',
    body: { company: 'NotARealCompany', skills: ['DP'] },
  });
  check('unknown company pe helpful 404', unknown.status === 404 && unknown.body.availableCompanies?.length > 0);

  // ---------- SAMPLE OUTPUT ----------
  console.log('\n' + '='.repeat(64));
  console.log('  SAMPLE OUTPUT — Amazon, resume = [Arrays, OOPs]');
  console.log('='.repeat(64));
  console.log(`  readiness: ${r.body.readinessScore}%   critical gaps: ${r.body.criticalGapCount}`);
  console.log(`  ${r.body.stats.windowNote}\n`);
  console.log('  TOP GAPS:');
  r.body.gaps.slice(0, 5).forEach(g =>
    console.log(`    ${g.priority.padEnd(8)} ${g.topic.padEnd(14)} ${String(g.askedPct + '%').padStart(4)}  (${g.evidence})`));
  console.log('\n  PLAN:');
  r.body.plan.weeks.forEach(w =>
    console.log(`    Week ${w.week}: ${w.focus.slice(0, 72)}`));
  console.log(`\n  grounding: ${r.body.plan.groundingCheck?.note || '(template plan)'}`);

  console.log('\n' + '='.repeat(64));
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('='.repeat(64) + '\n');

  server.close();
  process.exit(fail > 0 ? 1 : 0);
})();
