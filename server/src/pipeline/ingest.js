/**
 * server/src/pipeline/ingest.js
 * ------------------------------------------------------------------
 * Automated Weekly Data Ingestion Pipeline Orchestrator.
 *
 * Pipeline Flow:
 *   DISCOVERED → FETCHED → EXTRACTED → VALIDATED → STAGED
 *
 * Key Design Principles:
 *   1. Idempotent: Never duplicates URLs or content hashes across runs.
 *   2. Dynamic: Accepts any company name without predefined whitelist restrictions.
 *   3. Quality Gated: Validated candidates land strictly in staging.json (never auto-approved).
 * ------------------------------------------------------------------
 */

const crypto = require('crypto');
const store = require('../store');
const { getRegisteredSources, getSourceById } = require('./sources/registry');
const { extractExperience } = require('./extractor');

const VOCAB = [
  'DP', 'Arrays', 'Strings', 'Graphs', 'Trees', 'LinkedList', 'Recursion',
  'Greedy', 'SlidingWindow', 'BinarySearch', 'OOPs', 'DBMS', 'OS', 'Networks',
  'SystemDesign', 'Aptitude', 'Behavioral', 'Projects'
];

const VALID_OUTCOMES = ['selected', 'rejected', 'unknown'];

/**
 * URL Normalization helper for deduplication
 */
function normalizeUrl(urlStr) {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '');
    // Strip common tracking query params
    const searchParams = new URLSearchParams();
    for (const [key, val] of parsed.searchParams.entries()) {
      if (!key.startsWith('utm_') && key !== 'ref') {
        searchParams.append(key, val);
      }
    }
    parsed.search = searchParams.toString();
    let res = parsed.toString().toLowerCase();
    if (res.endsWith('/')) res = res.slice(0, -1);
    return res;
  } catch {
    return String(urlStr).trim().toLowerCase();
  }
}

/**
 * SHA-256 Hash of normalized text content
 */
function computeContentHash(text) {
  const norm = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(norm).digest('hex');
}

/**
 * Quality Gate & Schema Validator
 */
function validateRecord(record) {
  const errors = [];
  if (!record.company || typeof record.company !== 'string' || !record.company.trim()) {
    errors.push('missing or invalid company');
  }
  const yr = Number(record.year);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(yr) || yr < 2015 || yr > currentYear + 1) {
    errors.push(`invalid year ${record.year} (must be 2015-${currentYear + 1})`);
  }
  if (record.topics !== undefined && record.topics !== null) {
    if (!Array.isArray(record.topics)) {
      errors.push('topics must be an array');
    } else {
      const invalidTopics = record.topics.filter(t => !VOCAB.includes(t));
      if (invalidTopics.length > 0) {
        errors.push(`invalid topics: ${invalidTopics.join(', ')}`);
      }
    }
  }
  if (record.outcome && !VALID_OUTCOMES.includes(record.outcome)) {
    errors.push(`invalid outcome "${record.outcome}"`);
  }
  if (!record.raw_text || record.raw_text.trim().length < 20) {
    errors.push('raw_text must be at least 20 characters');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Main Weekly Ingestion Function
 */
async function runWeeklyIngestion({
  testMode = false,
  isLiveTest = false,
  manualTrigger = false,
  sourceIds = null,
  maxCandidates = null,
} = {}) {
  const startedAt = new Date().toISOString();

  // Create lightweight run log entry
  const runLog = store.ingestionRuns.create({
    startedAt,
    mode: isLiveTest ? 'live-test' : (testMode ? 'test' : (manualTrigger ? 'manual' : 'scheduled')),
    sourcesScanned: [],
    candidateUrlsFound: 0,
    duplicatesSkipped: 0,
    successfullyStaged: 0,
    extractionFailures: 0,
    validationFailures: 0,
    errors: [],
    status: 'running',
  });

  // Build existing URL and content hash sets for deduplication
  const knownUrls = new Set();
  const knownHashes = new Set();

  const approved = store.experiences.all();
  for (const exp of approved) {
    if (exp.source_url) knownUrls.add(normalizeUrl(exp.source_url));
    if (exp.raw_text) knownHashes.add(computeContentHash(exp.raw_text));
  }

  const staged = store.staging.list();
  for (const st of staged) {
    if (st.source_url) knownUrls.add(normalizeUrl(st.source_url));
    if (st.raw_text) knownHashes.add(computeContentHash(st.raw_text));
    if (st.content_hash) knownHashes.add(st.content_hash);
  }

  const rejected = store.rejected.list();
  for (const rj of rejected) {
    if (rj.source_url) knownUrls.add(normalizeUrl(rj.source_url));
    if (rj.raw_text) knownHashes.add(computeContentHash(rj.raw_text));
    if (rj.content_hash) knownHashes.add(rj.content_hash);
  }

  const sourcesToScan = sourceIds
    ? sourceIds.map(id => getSourceById(id)).filter(Boolean)
    : getRegisteredSources();

  let candidateCount = 0;
  let dupeCount = 0;
  let stagedCount = 0;
  let extractFailCount = 0;
  let validFailCount = 0;
  const runErrors = [];

  for (const src of sourcesToScan) {
    runLog.sourcesScanned.push(src.id);

    let candidates = [];
    try {
      candidates = await src.discover({ testMode, isLiveTest, maxCandidates });
    } catch (err) {
      extractFailCount++;
      runErrors.push({ source: src.id, error: `Discovery failed: ${err.message}` });
      continue;
    }

    for (const cand of candidates) {
      candidateCount++;
      const normUrl = normalizeUrl(cand.url);

      // Check Step 1: URL deduplication (SKIP BEFORE FETCH/EXTRACTION)
      if (knownUrls.has(normUrl)) {
        dupeCount++;
        continue;
      }

      let pageData = null;
      try {
        pageData = await src.fetchAndParse(cand.url, { testMode, isLiveTest });
      } catch (err) {
        // Network/HTTP fetch error — allow retry on future run
        extractFailCount++;
        runErrors.push({ url: cand.url, error: `Fetch/Parse failed: ${err.message}` });
        continue;
      }

      const rawTextContent = pageData.rawText || pageData.raw_text || '';
      if (!pageData || !rawTextContent || rawTextContent.trim().length < 20) {
        extractFailCount++;
        runErrors.push({ url: cand.url, error: 'Source adapter returned empty page content' });
        continue;
      }

      // Check Step 2: Content Hash deduplication (SKIP BEFORE EXPENSIVE EXTRACTION)
      const hash = computeContentHash(rawTextContent);
      if (knownHashes.has(hash)) {
        dupeCount++;
        continue;
      }

      // Step 3: ONLY NOW run expensive extraction (LLM / verified extractor)
      let parsedRecord = null;
      try {
        parsedRecord = await extractExperience(pageData);
      } catch (err) {
        extractFailCount++;
        runErrors.push({ url: cand.url, error: `Extraction failed: ${err.message}` });
        continue;
      }

      // Quality Gate Validation
      const valResult = validateRecord(parsedRecord);
      if (!valResult.ok) {
        validFailCount++;
        runErrors.push({
          url: cand.url,
          company: parsedRecord.company,
          error: `Validation failed: ${valResult.errors.join('; ')}`,
        });
        continue;
      }

      // Stage record (DO NOT ADD TO APPROVED EXPERIENCES)
      const stagedItem = store.staging.create({
        ...parsedRecord,
        company: parsedRecord.company,
        status: 'STAGED',
        content_hash: hash,
        staged_at: new Date().toISOString(),
        source_url: cand.url,
        source_site: parsedRecord.source_site || src.id,
      });

      knownUrls.add(normUrl);
      knownHashes.add(hash);
      stagedCount++;
    }

    src.lastScannedAt = new Date().toISOString();
  }

  const completedAt = new Date().toISOString();

  // Update run log summary
  const summary = store.ingestionRuns.update(runLog.id, {
    completedAt,
    sourcesScanned: runLog.sourcesScanned,
    candidateUrlsFound: candidateCount,
    duplicatesSkipped: dupeCount,
    successfullyStaged: stagedCount,
    extractionFailures: extractFailCount,
    validationFailures: validFailCount,
    errors: runErrors,
    status: 'completed',
  });

  return summary;
}

module.exports = {
  runWeeklyIngestion,
  normalizeUrl,
  computeContentHash,
  validateRecord,
};
