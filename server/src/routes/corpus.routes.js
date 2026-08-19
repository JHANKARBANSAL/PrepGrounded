/**
 * corpus.routes.js — corpus health aur company listing
 *
 * /health endpoint dikhata hai ki har company drift-analysis ke threshold
 * se kitni door hai. Ye jaan-boojh kar hai: aapki sabse badi limitation
 * (kam sample density) chhupi hui nahi, dashboard pe dikhti hai.
 *
 * Demo mein ye line kaam aati hai: "jab ye bars bhar jaayenge, adaptive λ
 * apne aap valid ho jaayega — koi code change nahi."
 */

const express = require('express');
const store = require('../store');
const corpus = require('../services/corpus.service');
const { halfLife } = require('../services/retrieval.service');

const router = express.Router();

// Estimate: itne records per company-year chahiye jab tak drift estimate
// sampling noise se nikal kar meaningful bane. Ye measured nahi, reasoned
// hai — report mein aise hi likhna.
const DENSITY_TARGET = 10;


// GET /api/corpus/companies
router.get('/companies', (req, res) => {
  const profiles = corpus.getDriftProfiles();

  res.json(store.experiences.companies().map(c => ({
    ...c,
    drift: profiles[c.name]?.drift ?? null,
    lambda: profiles[c.name]?.lambda ?? null,
    halfLifeYears: profiles[c.name] ? halfLife(profiles[c.name].lambda) : null,
    driftMethod: profiles[c.name]?.method ?? null,
  })));
});


// GET /api/corpus/health
router.get('/health', (req, res) => {
  const all = store.experiences.all();
  const profiles = corpus.getDriftProfiles();

  const byCompany = {};
  for (const e of all) (byCompany[e.company] = byCompany[e.company] || []).push(e);

  const companies = Object.entries(byCompany).map(([name, records]) => {
    const years = new Set(records.map(r => r.year));
    const perYear = records.length / years.size;

    return {
      company: name,
      records: records.length,
      distinctYears: years.size,
      recordsPerYear: Number(perYear.toFixed(1)),
      // 0-1: threshold tak kitna pahunche. Frontend ise progress bar banata hai.
      densityProgress: Number(Math.min(1, perYear / DENSITY_TARGET).toFixed(2)),
      driftReady: perYear >= DENSITY_TARGET,
      driftMethod: profiles[name]?.method ?? null,
    };
  }).sort((a, b) => b.records - a.records);

  const years = {};
  all.forEach(e => { years[e.year] = (years[e.year] || 0) + 1; });

  const sources = {};
  all.forEach(e => { sources[e.source_site || 'unknown'] = (sources[e.source_site || 'unknown'] || 0) + 1; });

  res.json({
    totalRecords: all.length,
    distinctCompanies: companies.length,
    distinctYears: Object.keys(years).length,
    densityTarget: DENSITY_TARGET,
    companiesDriftReady: companies.filter(c => c.driftReady).length,
    yearDistribution: years,
    sourceDistribution: sources,
    companies,
  });
});


module.exports = router;
