/**
 * drift.service.js — Adaptive Lambda Layer
 *
 * Implements two adaptive strategies:
 *   1. adaptive_jsd_experimental: Original Jensen-Shannon Divergence topic drift model.
 *   2. adaptive_v2: Temporal Validation + Density Gating + Empirical Shrinkage model.
 */

const { cosine } = require('./embedding.service');
const { recencyScore, OUTCOME_WEIGHT } = require('./retrieval.service');

// Constants
const GLOBAL_LAMBDA = 0.35;
const LAMBDA_GRID = [0.10, 0.20, 0.35, 0.50, 0.75];
const MIN_HISTORICAL_YEARS = 3;
const MIN_HISTORICAL_RECORDS = 12;
const MIN_VALIDATION_FOLDS = 2;
const SHRINKAGE_K = 25;
const CUTOFF_YEAR = 2023;

const LAMBDA_BASE = Number(process.env.LAMBDA_BASE || 0.35);
const DRIFT_GAIN  = Number(process.env.DRIFT_GAIN  || 1.6);
const MIN_YEARS_FOR_DRIFT = 3;

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function topTopics(records, n = 5) {
  const count = {};
  for (const r of records) {
    for (const t of new Set(r.topics || [])) {
      count[t] = (count[t] || 0) + 1;
    }
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

function hitRate(predicted, actual) {
  if (!predicted.length || !actual.length) return 0;
  const set = new Set(actual);
  return predicted.filter(t => set.has(t)).length / predicted.length;
}

/* ================================================================== */
/* 1. ORIGINAL JSD ADAPTIVE METHOD (RETAINED FOR REPRODUCIBILITY)     */
/* ================================================================== */

function topicDistribution(records) {
  const counts = {};
  let total = 0;
  for (const r of records) {
    for (const t of r.topics || []) {
      counts[t] = (counts[t] || 0) + 1;
      total++;
    }
  }
  if (total === 0) return {};
  const dist = {};
  for (const [k, v] of Object.entries(counts)) dist[k] = v / total;
  return dist;
}

function klDivergence(p, q, support) {
  let kl = 0;
  for (const k of support) {
    const pk = p[k] || 0;
    const qk = q[k] || 0;
    if (pk > 0 && qk > 0) kl += pk * Math.log2(pk / qk);
  }
  return kl;
}

function jensenShannon(p, q) {
  const support = new Set([...Object.keys(p), ...Object.keys(q)]);
  const m = {};
  for (const k of support) m[k] = 0.5 * ((p[k] || 0) + (q[k] || 0));
  return 0.5 * klDivergence(p, m, support) + 0.5 * klDivergence(q, m, support);
}

function computeCompanyDriftJSD(records) {
  const byYear = {};
  for (const r of records) {
    if (!r.year) continue;
    (byYear[r.year] = byYear[r.year] || []).push(r);
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);

  if (years.length < MIN_YEARS_FOR_DRIFT) {
    return { drift: 0, lambda: LAMBDA_BASE, years, pairwise: [], method: 'fallback_insufficient_years' };
  }

  const pairwise = [];
  for (let i = 1; i < years.length; i++) {
    const prevYear = years[i - 1];
    const currYear = years[i];
    const gap = currYear - prevYear;
    const d = jensenShannon(
      topicDistribution(byYear[prevYear]),
      topicDistribution(byYear[currYear])
    );
    pairwise.push({ from: prevYear, to: currYear, jsd: d, perYear: d / gap });
  }

  const drift = pairwise.reduce((s, p) => s + p.perYear, 0) / pairwise.length;
  const lambda = LAMBDA_BASE * (1 + DRIFT_GAIN * drift);

  return {
    drift: Number(drift.toFixed(4)),
    lambda: Number(lambda.toFixed(4)),
    years,
    pairwise: pairwise.map(p => ({
      ...p,
      jsd: Number(p.jsd.toFixed(4)),
      perYear: Number(p.perYear.toFixed(4)),
    })),
    method: 'adaptive_jsd_experimental',
  };
}

function buildDriftProfilesJSD(allExperiences) {
  const byCompany = {};
  for (const e of allExperiences) {
    (byCompany[e.company] = byCompany[e.company] || []).push(e);
  }
  const profiles = {};
  for (const [company, records] of Object.entries(byCompany)) {
    profiles[company] = {
      company,
      sampleSize: records.length,
      ...computeCompanyDriftJSD(records),
    };
  }
  return profiles;
}

/* ================================================================== */
/* 2. ADAPTIVE LAMBDA V2 (TEMPORAL VALIDATION + GATING + SHRINKAGE)  */
/* ================================================================== */

function computeCompanyAdaptiveV2(records, queryEmbedding = null) {
  const companyName = records[0]?.company || 'Unknown';

  // 1. Strict Temporal Isolation: Use records <= 2023 only
  const historical = records.filter(r => r.year && r.year <= CUTOFF_YEAR);
  const byYear = {};
  for (const r of historical) {
    (byYear[r.year] = byYear[r.year] || []).push(r);
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const n = historical.length;

  // 2. Density Gating Checks
  const failsYears = years.length < MIN_HISTORICAL_YEARS;
  const failsRecords = n < MIN_HISTORICAL_RECORDS;

  // Construct expanding-window validation folds
  const folds = [];
  for (let i = 0; i < years.length; i++) {
    const vYear = years[i];
    const trainPool = historical.filter(r => r.year < vYear);
    const testPool = byYear[vYear];
    if (trainPool.length > 0 && testPool.length > 0) {
      folds.push({ vYear, trainPool, testPool });
    }
  }

  const failsFolds = folds.length < MIN_VALIDATION_FOLDS;

  if (failsYears || failsRecords || failsFolds) {
    let reason = 'insufficient_temporal_evidence';
    if (failsRecords) reason = `historical_records_${n}_below_${MIN_HISTORICAL_RECORDS}`;
    else if (failsYears) reason = `historical_years_${years.length}_below_${MIN_HISTORICAL_YEARS}`;
    else if (failsFolds) reason = `validation_folds_${folds.length}_below_${MIN_VALIDATION_FOLDS}`;

    return {
      company: companyName,
      method: 'global_fallback',
      finalLambda: GLOBAL_LAMBDA,
      lambda: GLOBAL_LAMBDA,
      historicalSampleSize: n,
      historicalYears: years,
      validationFolds: folds.length,
      reason,
    };
  }

  // 3. Grid Evaluation over Usable Folds
  const scoresByLambda = {};

  for (const candidateLambda of LAMBDA_GRID) {
    const foldScores = [];
    for (const fold of folds) {
      const actualTopics = topTopics(fold.testPool, 5);

      const scored = fold.trainPool.map(e => {
        const sim = (queryEmbedding && e.embedding)
          ? cosine(queryEmbedding, e.embedding)
          : 0.5;
        const rec = recencyScore(e.year, e.month, candidateLambda);
        const out = OUTCOME_WEIGHT[e.outcome] ?? OUTCOME_WEIGHT.unknown;
        const final = 0.60 * sim + 0.30 * rec + 0.10 * out;
        return { ...e, _final: final };
      });

      scored.sort((a, b) => b._final - a._final);
      const predictedTopics = topTopics(scored.slice(0, 10), 5);
      const score = hitRate(predictedTopics, actualTopics);
      foldScores.push(score);
    }
    scoresByLambda[candidateLambda.toFixed(2)] = Number(avg(foldScores).toFixed(4));
  }

  // 4. Select Raw Best Lambda with Deterministic Tie-Breaking
  let bestRawLambda = GLOBAL_LAMBDA;
  let bestScore = -1;

  for (const candidateLambda of LAMBDA_GRID) {
    const key = candidateLambda.toFixed(2);
    const score = scoresByLambda[key];
    if (score > bestScore) {
      bestScore = score;
      bestRawLambda = candidateLambda;
    } else if (score === bestScore) {
      // Tie-breaking: 1. closest to 0.35, 2. smaller lambda
      const distBest = Math.abs(bestRawLambda - GLOBAL_LAMBDA);
      const distCand = Math.abs(candidateLambda - GLOBAL_LAMBDA);
      if (distCand < distBest) {
        bestRawLambda = candidateLambda;
      } else if (Math.abs(distCand - distBest) < 1e-6 && candidateLambda < bestRawLambda) {
        bestRawLambda = candidateLambda;
      }
    }
  }

  // 5. Empirical Shrinkage: alpha = n / (n + K)
  const alpha = Number((n / (n + SHRINKAGE_K)).toFixed(4));
  const rawFinal = (1 - alpha) * GLOBAL_LAMBDA + alpha * bestRawLambda;
  const finalLambda = Number(Math.min(0.75, Math.max(0.10, rawFinal)).toFixed(4));

  return {
    company: companyName,
    method: 'adaptive_v2_shrunk',
    historicalSampleSize: n,
    historicalYears: years,
    validationFolds: folds.length,
    globalLambda: GLOBAL_LAMBDA,
    bestRawLambda,
    rawLambda: bestRawLambda,
    shrinkageAlpha: alpha,
    finalLambda,
    lambda: finalLambda,
    validationMetric: 'Topic Hit Rate@5',
    validationScore: Number(bestScore.toFixed(4)),
    scoresByLambda,
  };
}

function buildDriftProfilesV2(allExperiences, queryEmbeddings = {}) {
  const byCompany = {};
  for (const e of allExperiences) {
    (byCompany[e.company] = byCompany[e.company] || []).push(e);
  }
  const profiles = {};
  for (const [company, records] of Object.entries(byCompany)) {
    profiles[company] = {
      sampleSize: records.length,
      ...computeCompanyAdaptiveV2(records, queryEmbeddings[company] || null),
    };
  }
  return profiles;
}

function buildDriftProfiles(allExperiences) {
  const byCompany = {};
  for (const e of allExperiences) {
    (byCompany[e.company] = byCompany[e.company] || []).push(e);
  }
  const profiles = {};
  for (const [company, records] of Object.entries(byCompany)) {
    const jsdProfile = computeCompanyDriftJSD(records);
    const v2Profile = computeCompanyAdaptiveV2(records);
    profiles[company] = {
      company,
      sampleSize: records.length,
      ...v2Profile,
      jsdDrift: jsdProfile.drift,
      jsdLambda: jsdProfile.lambda,
      drift: jsdProfile.drift,
      lambda: jsdProfile.lambda,
    };
  }
  return profiles;
}

module.exports = {
  GLOBAL_LAMBDA,
  LAMBDA_GRID,
  MIN_HISTORICAL_YEARS,
  MIN_HISTORICAL_RECORDS,
  MIN_VALIDATION_FOLDS,
  SHRINKAGE_K,
  CUTOFF_YEAR,
  buildDriftProfiles,
  buildDriftProfilesV2,
  buildDriftProfilesJSD,
  computeCompanyAdaptiveV2,
  computeCompanyDriftJSD,
  computeCompanyDrift: computeCompanyDriftJSD,
  jensenShannon,
  topicDistribution,
  LAMBDA_BASE,
  DRIFT_GAIN,
};
