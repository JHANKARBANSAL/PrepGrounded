/**
 * retrieval.service.js — Production Retrieval Ranking Layer with Freshness Preference & Outcome Filtering.
 */

const { cosine } = require('./embedding.service');
const { computeEvidenceQuality } = require('./evidence_quality.service');

const FRESHNESS_PRESETS = {
  broad: 0.15,
  balanced: 0.35,
  recent: 0.60,
};

const WEIGHTS = {
  similarity: Number(process.env.W_SIM || 0.60),
  recency:    Number(process.env.W_REC || 0.40),
  outcome:    Number(process.env.W_OUT || 0.00),
};

const OUTCOME_WEIGHT = { selected: 1.0, rejected: 0.7, unknown: 0.5 };
const CURRENT_YEAR = new Date().getFullYear();

function recencyScore(year, month, lambda) {
  if (!year) return 0.3;
  const age = (CURRENT_YEAR + (new Date().getMonth() + 1) / 12)
            - (year + (month || 6) / 12);
  return Math.exp(-lambda * Math.max(0, age));
}

function halfLife(lambda) {
  return Number((Math.log(2) / lambda).toFixed(2));
}

/**
 * Production Retrieval Function
 * @param opts.mode "fixed" (production default) | "baseline" | "adaptive"
 * @param opts.freshnessPreference "broad" (0.15) | "balanced" (0.35, default) | "recent" (0.60)
 * @param opts.outcomeFilter "any" | "selected" | "rejected" | "unknown"
 */
function retrieve(queryEmbedding, corpus, opts = {}) {
  const {
    mode = 'fixed',
    company = null,
    driftProfiles = {},
    k = 10,
    maxYear = null,
    freshnessPreference = 'balanced',
    outcomeFilter = null,
  } = opts;

  const pref = freshnessPreference || 'balanced';
  if (!FRESHNESS_PRESETS[pref]) {
    throw new Error(`Invalid freshnessPreference. Allowed: 'broad', 'balanced', 'recent'`);
  }

  if (outcomeFilter && !['any', 'selected', 'rejected', 'unknown'].includes(outcomeFilter)) {
    throw new Error(`Invalid outcomeFilter. Allowed: 'selected', 'rejected', 'unknown'`);
  }

  const resolvedLambda = FRESHNESS_PRESETS[pref];

  let pool = corpus;
  if (company) {
    const c = company.toLowerCase();
    pool = pool.filter(e => (e.company || '').toLowerCase() === c);
  }

  if (maxYear !== null) pool = pool.filter(e => e.year <= maxYear);

  if (outcomeFilter && outcomeFilter !== 'any') {
    pool = pool.filter(e => e.outcome === outcomeFilter);
  }

  const scored = pool.map(e => {
    const similarity = cosine(queryEmbedding, e.embedding || []);
    const quality = computeEvidenceQuality(e);

    if (mode === 'baseline') {
      return {
        ...e,
        freshnessPreference: pref,
        lambdaUsed: 0.0,
        evidenceQuality: quality.evidenceQuality,
        evidenceLabel: quality.evidenceLabel,
        evidenceBreakdown: quality.evidenceBreakdown,
        evidenceFlags: quality.evidenceFlags || [],
        _scores: { similarity: Number(similarity.toFixed(4)), recency: null, outcome: null, lambda: null, final: Number(similarity.toFixed(4)) },
      };
    }

    const profile = driftProfiles[e.company];

    let lambda = resolvedLambda;
    if (mode === 'adaptive' && profile) {
      lambda = profile.finalLambda || profile.lambda || 0.35;
    }

    const recency = recencyScore(e.year, e.month, lambda);

    // Production ranking formula strictly: 0.60 * similarity + 0.40 * recency
    let final = 0.60 * similarity + 0.40 * recency;
    if (mode === 'experimental_outcome') {
      const outcome = OUTCOME_WEIGHT[e.outcome] ?? OUTCOME_WEIGHT.unknown;
      final = 0.60 * similarity + 0.30 * recency + 0.10 * outcome;
    }

    return {
      ...e,
      freshnessPreference: pref,
      lambdaUsed: Number(lambda.toFixed(4)),
      evidenceQuality: quality.evidenceQuality,
      evidenceLabel: quality.evidenceLabel,
      evidenceBreakdown: quality.evidenceBreakdown,
      evidenceFlags: quality.evidenceFlags || [],
      _scores: {
        similarity: Number(similarity.toFixed(4)),
        recency: Number(recency.toFixed(4)),
        outcome: OUTCOME_WEIGHT[e.outcome] ?? OUTCOME_WEIGHT.unknown,
        lambda: Number(lambda.toFixed(4)),
        halfLifeYears: halfLife(lambda),
        final: Number(final.toFixed(4)),
      },
    };
  });

  scored.sort((a, b) => b._scores.final - a._scores.final);
  return scored.slice(0, k);
}

module.exports = {
  retrieve,
  recencyScore,
  halfLife,
  WEIGHTS,
  OUTCOME_WEIGHT,
  FRESHNESS_PRESETS,
};
