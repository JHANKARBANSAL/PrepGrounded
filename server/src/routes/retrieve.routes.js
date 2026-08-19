/**
 * retrieve.routes.js — Retrieval API with Freshness Preference, Outcome Filtering & Evidence Quality.
 */

const express = require('express');
const store = require('../store');
const corpus = require('../services/corpus.service');
const { embed } = require('../services/embedding.service');
const { retrieve, halfLife, FRESHNESS_PRESETS } = require('../services/retrieval.service');

const router = express.Router();

function slim(r) {
  return {
    id: r.id, company: r.company, role: r.role,
    year: r.year, month: r.month,
    topics: r.topics, questions: r.questions,
    outcome: r.outcome, source_site: r.source_site, source_url: r.source_url,
    snippet: String(r.raw_text || '').slice(0, 260),
    freshnessPreference: r.freshnessPreference,
    lambdaUsed: r.lambdaUsed,
    evidenceQuality: r.evidenceQuality,
    evidenceLabel: r.evidenceLabel,
    evidenceBreakdown: r.evidenceBreakdown,
    evidenceFlags: r.evidenceFlags || [],
    scores: r._scores,
  };
}

// POST /api/retrieve { query, company?, mode?, freshnessPreference?, outcomeFilter?, k?, maxYear? }
router.post('/', async (req, res, next) => {
  try {
    const {
      query,
      company = null,
      mode = 'fixed',
      freshnessPreference = 'balanced',
      outcomeFilter = null,
      k = 10,
      maxYear = null,
    } = req.body || {};

    if (!query) return res.status(400).json({ error: 'query is required' });

    const pref = freshnessPreference || 'balanced';
    if (!FRESHNESS_PRESETS[pref]) {
      return res.status(400).json({ error: "Invalid freshnessPreference. Allowed: 'broad', 'balanced', 'recent'" });
    }

    if (outcomeFilter && !['any', 'selected', 'rejected', 'unknown'].includes(outcomeFilter)) {
      return res.status(400).json({ error: "Invalid outcomeFilter. Allowed: 'selected', 'rejected', 'unknown'" });
    }

    const qv = await embed(query);

    const results = retrieve(qv, store.experiences.all(), {
      mode,
      company,
      k: Number(k),
      freshnessPreference: pref,
      outcomeFilter: outcomeFilter === 'any' ? null : outcomeFilter,
      driftProfiles: corpus.getDriftProfiles(),
      maxYear: maxYear === null ? null : Number(maxYear),
    });

    res.json({
      query,
      mode,
      company,
      freshnessPreference: pref,
      outcomeFilter: outcomeFilter || 'any',
      lambdaUsed: FRESHNESS_PRESETS[pref],
      weights: { similarity: 0.60, recency: 0.40 },
      results: results.map(slim),
    });
  } catch (err) { next(err); }
});

// POST /api/retrieve/compare — Multi-arm comparison with freshness preference & outcome filter
router.post('/compare', async (req, res, next) => {
  try {
    const {
      query,
      company = null,
      freshnessPreference = 'balanced',
      outcomeFilter = null,
      k = 10,
    } = req.body || {};

    if (!query) return res.status(400).json({ error: 'query is required' });

    const pref = freshnessPreference || 'balanced';
    if (!FRESHNESS_PRESETS[pref]) {
      return res.status(400).json({ error: "Invalid freshnessPreference. Allowed: 'broad', 'balanced', 'recent'" });
    }

    if (outcomeFilter && !['any', 'selected', 'rejected', 'unknown'].includes(outcomeFilter)) {
      return res.status(400).json({ error: "Invalid outcomeFilter. Allowed: 'selected', 'rejected', 'unknown'" });
    }

    const qv = await embed(query);
    const all = store.experiences.all();
    const profiles = corpus.getDriftProfiles();
    const nowYear = new Date().getFullYear();

    const run = (mode) => {
      const rows = retrieve(qv, all, {
        mode,
        company,
        k: Number(k),
        freshnessPreference: pref,
        outcomeFilter: outcomeFilter === 'any' ? null : outcomeFilter,
        driftProfiles: profiles,
      });
      const ages = rows.map(r => nowYear - r.year);
      const n = ages.length || 1;

      return {
        mode,
        avgAgeYears: Number((ages.reduce((a, b) => a + b, 0) / n).toFixed(2)),
        freshRate: Number((ages.filter(a => a <= 2).length / n).toFixed(2)),
        staleRate: Number((ages.filter(a => a > 4).length / n).toFixed(2)),
        results: rows.map(slim),
      };
    };

    res.json({
      query,
      company,
      freshnessPreference: pref,
      outcomeFilter: outcomeFilter || 'any',
      lambdaUsed: FRESHNESS_PRESETS[pref],
      driftProfile: company ? profiles[company] : null,
      arms: [run('baseline'), run('fixed'), run('adaptive')],
    });
  } catch (err) { next(err); }
});

// GET /api/retrieve/drift — learned λ table
router.get('/drift', (_req, res) => {
  const profiles = corpus.getDriftProfiles();
  const rows = Object.values(profiles)
    .map(p => ({ ...p, halfLifeYears: halfLife(p.lambda || p.finalLambda || 0.35) }))
    .sort((a, b) => b.drift - a.drift);

  res.json({
    note: 'lambda year-over-year topic drift (Jensen-Shannon) se DERIVED hai, hardcoded nahi.',
    caveat: 'Current corpus density (~2-3 records/company-year) pe ye estimates sampling noise se dominated hain.',
    profiles: rows,
  });
});

module.exports = router;
