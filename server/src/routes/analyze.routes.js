/**
 * analyze.routes.js — end-to-end intelligence endpoint
 *
 * Poora pipeline ek jagah. Dhyan do ki RAG kahan shuru hota hai:
 *
 *   1. computeStats()   ← counting, RAG nahi
 *   2. computeGaps()    ← Set difference, RAG nahi
 *   3. retrieve()       ← 🔴 RAG ka "R"
 *   4. buildPlan()      ← 🔴 RAG ka "A" + "G"
 *
 * Order important hai: gaps PEHLE nikaalte hain, phir unhe query mein daalte
 * hain. Isse retrieval un records ko dhoondta hai jo student ke ACTUAL gaps
 * se related hain, generic company info nahi.
 */

const express = require('express');
const store = require('../store');
const corpus = require('../services/corpus.service');
const { embed } = require('../services/embedding.service');
const { retrieve } = require('../services/retrieval.service');
const { computeStats, computeGaps } = require('../services/aggregation.service');
const { buildPlan } = require('../services/planner.service');

const router = express.Router();


router.post('/', async (req, res, next) => {
  try {
    const {
      resumeId, skills: inlineSkills, company, role = null,
      mode = 'adaptive', monthsBack = 24, maxYear = null,
    } = req.body;

    if (!company) return res.status(400).json({ error: 'company is required' });

    // Skills do tarah se aa sakti hain: saved resume se, ya seedha body mein
    // (testing aur "skills manually type karo" wale flow ke liye)
    let skills = inlineSkills;
    if (resumeId) {
      const resume = store.resumes.get(resumeId);
      if (!resume) return res.status(404).json({ error: 'Resume not found' });
      skills = resume.extracted_skills || [];
    }
    if (!Array.isArray(skills)) {
      return res.status(400).json({ error: 'Provide either resumeId or a skills array' });
    }

    const companyRecords = store.experiences.all()
      .filter(e => e.company.toLowerCase() === String(company).toLowerCase());

    if (companyRecords.length === 0) {
      // Khaali result dene se behtar hai batana ki kaunsi companies available hain
      return res.status(404).json({
        error: `No interview records for "${company}"`,
        availableCompanies: store.experiences.companies().map(c => c.name),
      });
    }

    // ---- 1. counting ----
    const stats = computeStats(companyRecords, { monthsBack, maxYear });

    // ---- 2. gap analysis ----
    const { gaps, covered, readinessScore, criticalCount } = computeGaps(skills, stats);

    // ---- 3. RAG: retrieve ----
    // Query mein top gaps daal rahe hain — isse evidence student ke actual
    // weak points se related aayega, na ki generic company info
    const query = `${company} ${role || ''} interview process rounds questions ` +
                  gaps.slice(0, 4).map(g => g.topic).join(' ');
    const qv = await embed(query);

    const evidence = retrieve(qv, store.experiences.all(), {
      mode, company, k: 8,
      driftProfiles: corpus.getDriftProfiles(),
      maxYear,
    });

    // ---- 4. RAG: augment + generate ----
    const plan = await buildPlan({ company, role, skills, stats, gaps, evidence });

    // ---- 5. persist (CRUD requirement) ----
    const saved = store.plans.create({
      resumeId: resumeId || null,
      company, role, mode,
      skills, readinessScore, gaps, plan,
      citations: evidence.map(e => e.id),
    });

    res.json({
      planId: saved.id,
      company, role,
      retrievalMode: mode,
      driftProfile: corpus.getDriftProfiles()[company] || null,
      readinessScore,
      criticalGapCount: criticalCount,
      stats,
      gaps,
      covered,
      plan,
      // Citations poore detail ke saath — frontend inhe clickable cards banata hai
      citations: evidence.map(e => ({
        id: e.id, company: e.company, year: e.year, month: e.month,
        outcome: e.outcome, topics: e.topics,
        source_site: e.source_site, source_url: e.source_url,
        snippet: String(e.raw_text || '').slice(0, 300),
        scores: e._scores,
      })),
    });
  } catch (err) { next(err); }
});


// GET /api/analyze/companies/:name/stats — bina resume ke sirf company stats
router.get('/companies/:name/stats', (req, res) => {
  const rows = store.experiences.all()
    .filter(e => e.company.toLowerCase() === req.params.name.toLowerCase());

  if (!rows.length) return res.status(404).json({ error: 'Unknown company' });

  res.json({
    company: rows[0].company,
    driftProfile: corpus.getDriftProfiles()[rows[0].company] || null,
    ...computeStats(rows, { monthsBack: Number(req.query.monthsBack) || 24 }),
  });
});


module.exports = router;
