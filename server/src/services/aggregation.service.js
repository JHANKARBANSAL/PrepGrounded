/**
 * aggregation.service.js — counting layer
 *
 * Yahan wo cheez banti hai jo RAG kar hi nahi sakta:
 *   "DP appeared in 31 of 40 recent interviews (77%)"
 *
 * RAG 10 documents la sakta hai. Wo poore corpus pe count nahi kar sakta.
 * Ye number sirf tab possible hai jab (a) records structured hon aur
 * (b) aap sab pe loop chalao.
 *
 * IRON RULE: is file mein ek bhi LLM call nahi. LLM se "DP kitni baar aaya"
 * poochoge toh wo guess karega aur har baar alag number dega. Code se
 * poochoge toh exact number aayega, har baar same.
 */

function countBy(rows, key) {
  const out = {};
  for (const r of rows) {
    const v = r[key] || 'unknown';
    out[v] = (out[v] || 0) + 1;
  }
  return out;
}


/**
 * @param records   EK company ke records
 * @param monthsBack  recency window
 * @param maxYear     temporal holdout ceiling (evaluation ke liye)
 */
function computeStats(records, { monthsBack = 24, maxYear = null } = {}) {
  let rows = records;
  if (maxYear !== null) rows = rows.filter(r => r.year <= maxYear);

  // Reference point: normally aaj, par holdout mode mein cutoff year ka end
  const now = new Date();
  const refYear = maxYear !== null ? maxYear : now.getFullYear();
  const refMonth = maxYear !== null ? 12 : now.getMonth() + 1;

  // Months ko ek absolute number mein badla — saal/mahine ka comparison
  // isse simple ho jaata hai (2024*12+6 vs 2023*12+11)
  const cutoffAbsolute = (refYear * 12 + refMonth) - monthsBack;

  const recent = rows.filter(r => (r.year * 12 + (r.month || 6)) >= cutoffAbsolute);

  // HONESTY GUARD: 5 se kam records pe percentage bakwaas hai — 1/2 ko
  // "50%" bolna misleading hai. Aise case mein poore history pe fall back
  // karo AUR output mein bata do. Ye chhoti si cheez examiner ko dikhati
  // hai ki aap apne data ki limitations samajhte ho.
  const usedFallback = recent.length < 5;
  const sample = usedFallback ? rows : recent;

  const topicCount = {};
  for (const r of sample) {
    // new Set — ek record mein topic do baar ho toh ek hi baar gino.
    // Warna 5-round wale records ka weight zyada ho jaata.
    for (const t of new Set(r.topics || [])) topicCount[t] = (topicCount[t] || 0) + 1;
  }

  const topicFrequency = Object.entries(topicCount)
    .map(([topic, count]) => ({
      topic,
      count,
      total: sample.length,
      pct: sample.length ? Math.round((count / sample.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const roundNums = sample.map(r => r.total_rounds || (r.rounds || []).length).filter(Boolean);
  const typicalRounds = roundNums.length
    ? Math.round(roundNums.reduce((a, b) => a + b, 0) / roundNums.length)
    : null;

  const roundTypeCount = {};
  for (const r of sample) {
    for (const rd of r.rounds || []) {
      roundTypeCount[rd.round_type] = (roundTypeCount[rd.round_type] || 0) + 1;
    }
  }

  return {
    sampleSize: sample.length,
    corpusSize: rows.length,
    windowMonths: usedFallback ? null : monthsBack,
    windowNote: usedFallback
      ? `Last ${monthsBack} months mein 5 se kam records the — statistics poore available history pe (n=${rows.length}). Percentages indicative maano.`
      : `${sample.length} interviews from the last ${monthsBack} months.`,
    confidence: sample.length >= 20 ? 'high' : sample.length >= 8 ? 'medium' : 'low',
    topicFrequency,
    typicalRounds,
    roundTypeDistribution: roundTypeCount,
    difficultyMix: countBy(sample, 'difficulty'),
    outcomeMix: countBy(sample, 'outcome'),
    yearRange: rows.length ? [Math.min(...rows.map(r => r.year)), Math.max(...rows.map(r => r.year))] : null,
    sourceMix: countBy(sample, 'source_site'),
  };
}


/**
 * Gap = jo company poochti hai par resume mein nahi hai.
 *
 * Ye ek Set difference hai — LLM se MAT karwana. LLM aise topics nikaal
 * dega jo stats mein hain hi nahi, aur phir aapka poora "grounded" claim
 * jhoota ho jaayega.
 *
 * minPct: 15% se kam wale topics ignore — wo noise hain, gap nahi.
 */
function computeGaps(resumeSkills, stats, { minPct = 15 } = {}) {
  const have = new Set((resumeSkills || []).map(s => String(s).toLowerCase().trim()));

  const covered = [];
  const gaps = [];

  for (const t of stats.topicFrequency) {
    if (t.pct < minPct) continue;

    const entry = {
      topic: t.topic,
      askedPct: t.pct,
      evidence: `${t.count}/${t.total} interviews in this window`,
      priority: t.pct >= 50 ? 'critical' : t.pct >= 30 ? 'high' : 'medium',
    };

    if (have.has(t.topic.toLowerCase())) covered.push(entry);
    else gaps.push(entry);
  }

  // Readiness ko topic COUNT se nahi, askedPct se weight karo.
  // 5 chhote topics cover karna ek 80%-wale topic se kam value hai.
  const totalWeight = [...covered, ...gaps].reduce((s, x) => s + x.askedPct, 0) || 1;
  const coveredWeight = covered.reduce((s, x) => s + x.askedPct, 0);

  return {
    gaps,
    covered,
    readinessScore: Math.round((coveredWeight / totalWeight) * 100),
    criticalCount: gaps.filter(g => g.priority === 'critical').length,
  };
}


module.exports = { computeStats, computeGaps, countBy };
