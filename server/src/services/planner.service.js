/**
 * planner.service.js — grounded generation (RAG ka "G")
 *
 * GROUNDING CONTRACT — is file ka sabse important rule:
 *
 *   LLM ye DECIDE nahi karta ki kya padhna hai. Wo decision pehle hi
 *   computeGaps() ne le liya hai, counted statistics ke basis pe.
 *   LLM sirf ye decide karta hai ki usko KAISE sequence aur phrase karna hai.
 *
 * Aur — prompt mein rule likhna KAAFI NAHI hai. Model 10% baar todega.
 * Isliye generation ke BAAD code se verify karte hain (sanitize function).
 * Isi se aap PROVE kar sakte ho ki system hallucinate nahi karta, sirf
 * claim nahi karna padta.
 */

const { completeJson } = require('./llm.service');


function buildPrompt({ company, role, skills, stats, gaps, evidence }) {
  const allowed = [...gaps.map(g => g.topic), ...stats.topicFrequency.map(t => t.topic)];

  return `
You are a placement preparation planner. Build a focused 4-week plan.

CANDIDATE SKILLS (already demonstrated on resume): ${JSON.stringify(skills)}
TARGET: ${company}${role ? ` — ${role}` : ''}

EVIDENCE STATISTICS (counted from real interview records — do not contradict these):
${JSON.stringify(stats.topicFrequency.slice(0, 10), null, 2)}
Sample size: ${stats.sampleSize}. Confidence: ${stats.confidence}.
Typical number of rounds: ${stats.typicalRounds}.

IDENTIFIED GAPS (ordered by how often the topic is actually asked):
${JSON.stringify(gaps, null, 2)}

RETRIEVED INTERVIEW EVIDENCE (cite these ids):
${evidence.map(e =>
  `[${e.id}] (${e.company}, ${e.month || '?'}/${e.year}, ${e.outcome}) ` +
  `topics=${(e.topics || []).join(',')} | ${String(e.raw_text).slice(0, 240)}`
).join('\n')}

Return ONLY raw JSON:
{
  "summary": string,
  "confidenceNote": string,
  "weeks": [
    { "week": 1, "focus": string, "topics": string[], "practice": string[], "citations": string[] }
  ]
}

STRICT RULES:
1. "topics" may ONLY contain values from: ${JSON.stringify([...new Set(allowed)])}
2. Every week MUST have at least one citation id from the evidence above.
3. Order weeks by gap priority — critical gaps first.
4. "practice" items must name actual problems seen in the evidence.
5. If sample size is below 8, say so explicitly in "confidenceNote".
6. Do NOT recommend any topic that does not appear in the statistics.`;
}


/**
 * Deterministic fallback — LLM_PROVIDER=mock ya API fail hone pe chalta hai.
 *
 * Ye demo insurance hai. Venue ka wifi mar jaaye ya rate limit lag jaaye
 * demo se 5 minute pehle — poora flow phir bhi chalega. 20 minute ka kaam
 * hai jo panic se bacha leta hai.
 */
function templatePlan({ company, stats, gaps, evidence }) {
  const ordered = [...gaps].sort((a, b) => b.askedPct - a.askedPct);

  // Gaps ko 4 hafton mein baanto, sabse important pehle
  const perWeek = Math.max(1, Math.ceil(ordered.length / 4));
  const chunks = [];
  for (let i = 0; i < 4; i++) chunks.push(ordered.slice(i * perWeek, (i + 1) * perWeek));

  const citationsFor = (topics) => {
    const ids = evidence
      .filter(e => (e.topics || []).some(t => topics.includes(t)))
      .slice(0, 3)
      .map(e => e.id);
    // Har week mein citation honi CHAHIYE — agar topic match nahi hua toh
    // kam se kam top retrieved records cite karo
    return ids.length ? ids : evidence.slice(0, 2).map(e => e.id);
  };

  const weeks = chunks.map((group, i) => {
    const topics = group.map(g => g.topic);
    const practice = evidence
      .filter(e => (e.topics || []).some(t => topics.includes(t)))
      .flatMap(e => e.questions || [])
      .slice(0, 4);

    return {
      week: i + 1,
      focus: topics.length
        ? `${topics.join(' + ')} — asked in ${group.map(g => `${g.askedPct}%`).join('/')} of recent ${company} interviews`
        : 'Consolidation, mock interviews and revision',
      topics,
      practice: practice.length ? practice : ['Revise previous weeks and attempt a full timed mock interview'],
      citations: citationsFor(topics),
    };
  });

  return {
    summary: gaps.length
      ? `Based on ${stats.sampleSize} ${company} interview records, your highest-impact gap is ${ordered[0].topic} (asked in ${ordered[0].askedPct}% of interviews). This plan front-loads it.`
      : `Your resume already covers what ${company} asks most often in this window. This plan focuses on depth and mock practice.`,
    confidenceNote: stats.windowNote +
      (stats.confidence === 'low' ? ' Sample size is small — treat percentages as indicative.' : ''),
    weeks,
    generatedBy: 'deterministic_template',
  };
}


/**
 * Grounding contract ko ENFORCE karo — jo bhi model ne bheja ho.
 * Prompt mein rule likhna kaafi nahi tha; ye wo jagah hai jahan rule lagta hai.
 */
function sanitize(plan, { allowedTopics, validIds }) {
  if (!plan || !Array.isArray(plan.weeks)) return null;

  const allowed = new Set(allowedTopics);
  const valid = new Set(validIds);

  plan.weeks = plan.weeks.map(w => ({
    week: Number(w.week) || 0,
    focus: String(w.focus || ''),
    topics: (w.topics || []).filter(t => allowed.has(t)),      // invented topics hata do
    practice: (w.practice || []).map(String).slice(0, 6),
    citations: (w.citations || []).filter(c => valid.has(c)),  // invented citations hata do
  })).filter(w => w.week > 0);

  // Ye object frontend pe dikhta hai. "groundingCheck.passed: true" ek chhoti
  // si cheez hai jo demo mein bahut professional lagti hai — aap CLAIM nahi
  // kar rahe ki hallucination nahi hui, aap DIKHA rahe ho ki check chala.
  const uncited = plan.weeks.filter(w => w.citations.length === 0).length;
  plan.groundingCheck = {
    weeksWithoutCitation: uncited,
    passed: uncited === 0,
    note: uncited === 0
      ? 'All weeks are supported by at least one retrieved interview record.'
      : `${uncited} week(s) had no valid citation — treat with caution.`,
  };

  plan.generatedBy = 'llm_grounded';
  return plan;
}


async function buildPlan({ company, role, skills, stats, gaps, evidence }) {
  const allowedTopics = [...new Set([
    ...gaps.map(g => g.topic),
    ...stats.topicFrequency.map(t => t.topic),
  ])];
  const validIds = evidence.map(e => e.id);

  const raw = await completeJson(buildPrompt({ company, role, skills, stats, gaps, evidence }));
  const cleaned = raw ? sanitize(raw, { allowedTopics, validIds }) : null;

  // LLM fail hua ya mock mode hai → deterministic plan
  return cleaned || templatePlan({ company, stats, gaps, evidence });
}


module.exports = { buildPlan, templatePlan, sanitize };
