/**
 * data/batch_expand.js — Controlled Small Batch Corpus Expansion Script
 *
 * Target: Add 50-75 new valid, non-duplicate, evidence-grounded records to experiences.json.
 *
 * Workflow:
 *   1. Discover candidate URLs across company tag pages on GeeksforGeeks.
 *   2. Deduplicate URLs & content hashes against existing corpus (139 records) and staging.
 *   3. Fetch & extract using verified extractor (server/src/pipeline/extractor.js).
 *   4. Validate using schema validator.
 *   5. Stage valid records in data/staging.json.
 *   6. Promote valid staged records into approved corpus data/experiences.json.
 *   7. Output detailed stats breakdown.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('../server/node_modules/cheerio');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
} catch {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

const store = require('../server/src/store');
const { extractExperience } = require('../server/src/pipeline/extractor');
const { normalizeUrl, computeContentHash, validateRecord } = require('../server/src/pipeline/ingest');

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const COMPANY_TAGS = [
  'amazon', 'microsoft', 'google', 'tcs', 'infosys', 'wipro', 'accenture',
  'flipkart', 'adobe', 'oracle', 'cognizant', 'swiggy', 'zomato', 'atlassian',
  'uber', 'salesforce', 'goldman-sachs', 'cisco', 'deloitte', 'phonepe',
  'paytm', 'capgemini', 'zoho', 'morgan-stanley', 'jpmorgan', 'walmart', 'intuit'
];

const TARGET_BATCH_SIZE = 65; // Target 50-75 range

async function discoverCandidateUrls() {
  const candidateUrls = [];
  const seen = new Set();

  for (const tag of COMPANY_TAGS) {
    const tagUrl = `https://www.geeksforgeeks.org/tag/${tag}/`;
    try {
      const res = await fetch(tagUrl, { headers: DEFAULT_HEADERS });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const clean = href.split('#')[0].split('?')[0].trim();
        if (
          clean.includes('geeksforgeeks.org/') &&
          (clean.includes('/interview-experiences/') || clean.includes('-interview-experience') || clean.includes('recruitment-process')) &&
          !clean.includes('/category/') &&
          !clean.includes('/tag/') &&
          !clean.includes('/page/') &&
          !clean.includes('/author/') &&
          clean.length > 35 &&
          !seen.has(clean)
        ) {
          seen.add(clean);
          candidateUrls.push(clean);
        }
      });
    } catch (err) {
      console.warn(`[discovery] Failed tag ${tag}:`, err.message);
    }
  }

  return candidateUrls;
}

async function fetchAndParseGfg(url) {
  await sleep(1500); // Polite rate limiting delay

  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || $('title').text().trim() || 'GeeksforGeeks Interview Experience';
  $('script, style, nav, footer, header, iframe, .comments-area, .sidebar').remove();

  const container = $('.article-title, .text, .entry-content, main, article').first();
  const rawText = container.text().replace(/\s+/g, ' ').trim() || $('body').text().replace(/\s+/g, ' ').trim();

  const pubDate = $('meta[property="article:published_time"]').attr('content') ||
                  $('meta[property="og:updated_time"]').attr('content') ||
                  $('time').attr('datetime') || '';

  return {
    title,
    rawText,
    sourceUrl: url,
    sourceSite: 'geeksforgeeks',
    publishedAt: pubDate || null,
  };
}

(async () => {
  console.log('============================================================');
  console.log('  CONTROLLED BATCH CORPUS EXPANSION (Target: 50-75 records)');
  console.log('============================================================\n');

  const oldCorpus = store.experiences.all();
  const oldCorpusSize = oldCorpus.length;
  const oldCompanies = new Set(oldCorpus.map(e => e.company));

  console.log(`Initial Approved Corpus Size: ${oldCorpusSize} records across ${oldCompanies.size} companies.`);

  // Build existing URL and content hash sets for strict deduplication
  const knownUrls = new Set();
  const knownHashes = new Set();

  for (const exp of oldCorpus) {
    if (exp.source_url) knownUrls.add(normalizeUrl(exp.source_url));
    if (exp.raw_text) knownHashes.add(computeContentHash(exp.raw_text));
  }

  console.log('\n[1/4] Discovering candidate URLs across GFG company tag archives...');
  const discovered = await discoverCandidateUrls();
  console.log(`Discovered ${discovered.length} total candidate URLs.`);

  let dupeCount = 0;
  let extractFailCount = 0;
  let validFailCount = 0;
  const newlyStaged = [];

  console.log('\n[2/4] Fetching, extracting & staging candidate records...');

  for (const url of discovered) {
    if (newlyStaged.length >= TARGET_BATCH_SIZE) {
      console.log(`\nReached target batch limit (${TARGET_BATCH_SIZE} records). Stopping fetch loop.`);
      break;
    }

    const normUrl = normalizeUrl(url);
    if (knownUrls.has(normUrl)) {
      dupeCount++;
      continue;
    }

    let pageData = null;
    try {
      pageData = await fetchAndParseGfg(url);
    } catch (err) {
      extractFailCount++;
      console.warn(`  ❌ Fetch failed [${url}]: ${err.message}`);
      continue;
    }

    if (!pageData || !pageData.rawText || pageData.rawText.length < 20) {
      extractFailCount++;
      continue;
    }

    const hash = computeContentHash(pageData.rawText);
    if (knownHashes.has(hash)) {
      dupeCount++;
      continue;
    }

    let extractedRecord = null;
    try {
      extractedRecord = await extractExperience(pageData);
    } catch (err) {
      extractFailCount++;
      console.warn(`  ❌ Extraction failed [${url}]: ${err.message}`);
      continue;
    }

    const valRes = validateRecord(extractedRecord);
    if (!valRes.ok) {
      validFailCount++;
      console.warn(`  ❌ Validation failed [${url}]: ${valRes.errors.join('; ')}`);
      continue;
    }

    // Format final record object
    const finalRecord = {
      id: `gfg_${extractedRecord.company.toLowerCase().replace(/[^a-z0-9]/g, '')}_${extractedRecord.year}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      company: extractedRecord.company,
      role: extractedRecord.role || 'SDE',
      year: Number(extractedRecord.year),
      month: extractedRecord.month ? Number(extractedRecord.month) : null,
      total_rounds: extractedRecord.total_rounds || 1,
      rounds: extractedRecord.rounds || [],
      topics: extractedRecord.topics || [],
      questions: extractedRecord.questions || [],
      outcome: extractedRecord.outcome || 'unknown',
      raw_text: extractedRecord.raw_text,
      source: 'real',
      source_site: 'geeksforgeeks',
      source_url: url,
      scraped_at: new Date().toISOString(),
      published_at: extractedRecord.published_at || null,
      extraction_method: extractedRecord.extraction_method || 'deterministic_grounded_fallback',
    };

    knownUrls.add(normUrl);
    knownHashes.add(hash);
    newlyStaged.push(finalRecord);

    console.log(`  ✅ Staged [${newlyStaged.length}/${TARGET_BATCH_SIZE}]: ${finalRecord.company} (${finalRecord.year}) - ${finalRecord.topics.length} topics`);
  }

  // Save to data/staging.json first
  fs.writeFileSync(store.FILES.staging, JSON.stringify(newlyStaged, null, 2));
  console.log(`\n[3/4] Staged ${newlyStaged.length} records into data/staging.json.`);

  // Promote to approved corpus data/experiences.json
  console.log('\n[4/4] Promoting staged records to approved corpus data/experiences.json...');
  const updatedCorpus = [...oldCorpus, ...newlyStaged];
  
  // Persist to experiences.json
  fs.writeFileSync(store.FILES.experiences, JSON.stringify(updatedCorpus, null, 2));
  store.invalidate(); // Invalidate in-memory cache

  const newCorpus = store.experiences.all();
  const newCorpusSize = newCorpus.length;
  const newCompanies = new Set(newCorpus.map(e => e.company));

  // Compute breakdown stats
  const addedCompanyCounts = {};
  const addedYearCounts = {};
  const addedSources = {};

  newlyStaged.forEach(r => {
    addedCompanyCounts[r.company] = (addedCompanyCounts[r.company] || 0) + 1;
    addedYearCounts[r.year] = (addedYearCounts[r.year] || 0) + 1;
    addedSources[r.source_site || 'geeksforgeeks'] = (addedSources[r.source_site || 'geeksforgeeks'] || 0) + 1;
  });

  const brandNewCompanies = Array.from(newCompanies).filter(c => !oldCompanies.has(c));

  console.log('\n============================================================');
  console.log('  BATCH EXPANSION COMPLETE REPORT');
  console.log('============================================================');
  console.log(`1. Old Corpus Size:          ${oldCorpusSize}`);
  console.log(`2. New Corpus Size:          ${newCorpusSize}`);
  console.log(`3. Exact Number Added:       ${newlyStaged.length}`);
  console.log(`4. Companies (Before/After): ${oldCompanies.size} → ${newCompanies.size}`);
  console.log(`5. Brand New Companies (${brandNewCompanies.length}):`, brandNewCompanies.join(', ') || 'None');
  console.log(`6. Company Breakdown (Added):`, addedCompanyCounts);
  console.log(`7. Year Breakdown (Added):   `, addedYearCounts);
  console.log(`8. Source Breakdown (Added): `, addedSources);
  console.log(`9. Duplicates Skipped:       ${dupeCount}`);
  console.log(`10. Validation Failures:     ${validFailCount}`);
  console.log(`11. Extraction Failures:     ${extractFailCount}`);
  console.log(`12. Manual Corrections:      0 (All passed schema validation directly)`);
  console.log('============================================================\n');
})();
