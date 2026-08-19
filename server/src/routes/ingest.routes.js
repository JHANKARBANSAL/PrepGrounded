/**
 * server/src/routes/ingest.routes.js
 * ------------------------------------------------------------------
 * Ingestion Management, Review & Approval API Routes.
 * ------------------------------------------------------------------
 */

const express = require('express');
const store = require('../store');
const corpus = require('../services/corpus.service');
const { runWeeklyIngestion, normalizeUrl, computeContentHash, validateRecord } = require('../pipeline/ingest');
const { getRegisteredSources } = require('../pipeline/sources/registry');

const router = express.Router();

// GET /api/ingest/sources — List registered sources and status
router.get('/sources', (_req, res) => {
  const sources = getRegisteredSources().map(s => ({
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl,
    enabled: s.enabled,
    lastScannedAt: s.lastScannedAt,
  }));
  res.json(sources);
});

// GET /api/ingest/runs — Get run history
router.get('/runs', (_req, res) => {
  const runs = store.ingestionRuns.list().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  res.json(runs);
});

// GET /api/ingest/staging — Get all staged records (pending review)
router.get('/staging', (_req, res) => {
  const staged = store.staging.list();
  res.json({
    total: staged.length,
    items: staged.map(item => ({
      ...item,
      raw_text_preview: (item.raw_text || '').slice(0, 300) + ((item.raw_text || '').length > 300 ? '...' : ''),
    })),
  });
});

// GET /api/ingest/audit — Get review audit log
router.get('/audit', (_req, res) => {
  const auditLogs = store.reviewAudit.list().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(auditLogs);
});

// POST /api/ingest/staging/:id/approve — Idempotent approval of staged record
router.post('/staging/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const stagedItem = store.staging.get(id);

    if (!stagedItem) {
      // Check if already in approved corpus for idempotency
      const existingApproved = store.experiences.get(id);
      if (existingApproved) {
        return res.json({
          approved: true,
          alreadyApproved: true,
          message: 'Record already approved and present in corpus',
          item: existingApproved,
        });
      }
      return res.status(404).json({ error: 'Staged record not found' });
    }

    // 1. Schema Validation
    const valResult = validateRecord(stagedItem);
    if (!valResult.ok) {
      return res.status(400).json({ error: `Validation failed: ${valResult.errors.join('; ')}` });
    }

    // 2. URL Deduplication Check against approved corpus
    const approvedCorpus = store.experiences.all();
    const normUrl = stagedItem.source_url ? normalizeUrl(stagedItem.source_url) : null;
    if (normUrl) {
      const isUrlDuplicate = approvedCorpus.some(e => e.source_url && normalizeUrl(e.source_url) === normUrl);
      if (isUrlDuplicate) {
        // Idempotently remove from staging
        store.staging.remove(id);
        return res.json({
          approved: true,
          duplicate: true,
          message: 'Record URL already exists in approved corpus. Removed from staging.',
        });
      }
    }

    // 3. Content Hash Deduplication Check against approved corpus
    const hash = computeContentHash(stagedItem.raw_text);
    const isHashDuplicate = approvedCorpus.some(e => e.raw_text && computeContentHash(e.raw_text) === hash);
    if (isHashDuplicate) {
      store.staging.remove(id);
      return res.json({
        approved: true,
        duplicate: true,
        message: 'Record content hash already exists in approved corpus. Removed from staging.',
      });
    }

    // 4. Generate Embedding for vector indexing
    const recordToPromote = {
      id: stagedItem.id,
      company: stagedItem.company,
      role: stagedItem.role || 'SDE',
      year: Number(stagedItem.year),
      month: stagedItem.month ? Number(stagedItem.month) : null,
      rounds: stagedItem.rounds || [],
      total_rounds: stagedItem.total_rounds || (stagedItem.rounds || []).length || 1,
      topics: stagedItem.topics || [],
      questions: stagedItem.questions || [],
      outcome: stagedItem.outcome || 'unknown',
      raw_text: stagedItem.raw_text || '',
      source: stagedItem.source || 'real',
      source_site: stagedItem.source_site || 'geeksforgeeks',
      source_url: stagedItem.source_url || null,
      scraped_at: stagedItem.scraped_at || new Date().toISOString(),
      published_at: stagedItem.published_at || null,
      extraction_method: stagedItem.extraction_method || 'deterministic_grounded_fallback',
      approved_at: new Date().toISOString(),
    };

    await corpus.embedRecord(recordToPromote);

    // 5. Append to approved corpus
    const approvedRecord = store.experiences.create(recordToPromote);

    // 6. Remove from staging
    store.staging.remove(id);

    // 7. Refresh drift profiles & index
    corpus.refreshDrift();

    // 8. Log Review Audit Entry
    store.reviewAudit.create({
      recordId: id,
      action: 'approve',
      timestamp: new Date().toISOString(),
      company: approvedRecord.company,
      year: approvedRecord.year,
    });

    res.json({
      approved: true,
      item: approvedRecord,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/staging/:id/reject — Reject staged record
router.post('/staging/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = 'Manual rejection by reviewer' } = req.body || {};

    const stagedItem = store.staging.get(id);
    if (!stagedItem) {
      return res.status(404).json({ error: 'Staged record not found' });
    }

    // 1. Store in permanent rejected log
    const rejectedEntry = store.rejected.create({
      ...stagedItem,
      rejected_at: new Date().toISOString(),
      reject_reason: reason,
      content_hash: computeContentHash(stagedItem.raw_text),
    });

    // 2. Remove from staging
    store.staging.remove(id);

    // 3. Log Audit Entry
    store.reviewAudit.create({
      recordId: id,
      action: 'reject',
      timestamp: new Date().toISOString(),
      company: stagedItem.company,
      year: stagedItem.year,
      reason,
    });

    res.json({
      rejected: true,
      id,
      item: rejectedEntry,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/ingest/staging/:id — Edit staged record prior to approval
router.put('/staging/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const stagedItem = store.staging.get(id);

    if (!stagedItem) {
      return res.status(404).json({ error: 'Staged record not found' });
    }

    const {
      company,
      role,
      year,
      month,
      topics,
      outcome,
      questions,
      rounds,
    } = req.body || {};

    // Preserve original provenance fields strictly
    const updatedCandidate = {
      ...stagedItem,
      company: company !== undefined ? String(company).trim() : stagedItem.company,
      role: role !== undefined ? String(role).trim() : stagedItem.role,
      year: year !== undefined ? Number(year) : stagedItem.year,
      month: month !== undefined ? (month ? Number(month) : null) : stagedItem.month,
      topics: Array.isArray(topics) ? topics : stagedItem.topics,
      outcome: outcome !== undefined ? String(outcome) : stagedItem.outcome,
      questions: Array.isArray(questions) ? questions : stagedItem.questions,
      rounds: Array.isArray(rounds) ? rounds : stagedItem.rounds,
      // Provenance fields MUST remain preserved
      source_url: stagedItem.source_url,
      source_site: stagedItem.source_site,
      scraped_at: stagedItem.scraped_at,
      published_at: stagedItem.published_at,
      extraction_method: stagedItem.extraction_method,
    };

    // Validate edit
    const valResult = validateRecord(updatedCandidate);
    if (!valResult.ok) {
      return res.status(400).json({ error: `Invalid edit: ${valResult.errors.join('; ')}` });
    }

    const saved = store.staging.update(id, updatedCandidate);

    // Audit log edit
    store.reviewAudit.create({
      recordId: id,
      action: 'edit',
      timestamp: new Date().toISOString(),
      oldValues: {
        company: stagedItem.company,
        role: stagedItem.role,
        year: stagedItem.year,
        topics: stagedItem.topics,
        outcome: stagedItem.outcome,
      },
      newValues: {
        company: saved.company,
        role: saved.role,
        year: saved.year,
        topics: saved.topics,
        outcome: saved.outcome,
      },
    });

    res.json(saved);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/run — Trigger ingestion job
router.post('/run', async (req, res, next) => {
  try {
    const { testMode = false, sourceIds = null } = req.body || {};
    const summary = await runWeeklyIngestion({
      testMode: Boolean(testMode),
      manualTrigger: true,
      sourceIds: Array.isArray(sourceIds) ? sourceIds : null,
    });
    res.json({
      message: 'Ingestion run completed',
      run: summary,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
