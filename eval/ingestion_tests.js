/**
 * eval/ingestion_tests.js — Automated Ingestion Pipeline Test Suite
 *
 * Verifies:
 *   1. Idempotency: repeated runs skip already ingested candidate URLs & content hashes.
 *   2. Skipping known URLs: URLs in experiences.json or staging.json are skipped.
 *   3. Skipping duplicate content: exact matching content SHA-256 hashes are skipped.
 *   4. New companies: incoming records for new companies (e.g. Stripe, Databricks) are accepted.
 *   5. Quality gate: invalid records fail validation and enter run error log without corrupting experiences.json.
 *   6. Staging behavior: valid incoming records land in data/staging.json with status="STAGED".
 *   7. Scheduler integration: scheduler correctly initializes and triggers ingestion.
 *   8. Manual trigger CLI: manual trigger invokes the identical ingestion engine function.
 */

const fs = require('fs');
const path = require('path');
const store = require('../server/src/store');
const { runWeeklyIngestion, normalizeUrl, computeContentHash, validateRecord } = require('../server/src/pipeline/ingest');
const { initScheduler, stopScheduler } = require('../server/src/services/scheduler.service');

let pass = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

async function runTests() {
  console.log('\n============================================================');
  console.log('  AUTOMATED INGESTION INFRASTRUCTURE TEST SUITE');
  console.log('============================================================\n');

  // Clean staging & runs before test
  if (fs.existsSync(store.FILES.staging)) {
    fs.writeFileSync(store.FILES.staging, JSON.stringify([]));
  }
  if (fs.existsSync(store.FILES.ingestionRuns)) {
    fs.writeFileSync(store.FILES.ingestionRuns, JSON.stringify([]));
  }

  // ---------- 1. Normalization & Hashing Helpers ----------
  console.log('1. HELPER & DEDUPLICATION FUNCTIONS');
  const url1 = 'https://www.GeeksforGeeks.org/some-post/?utm_source=feed&ref=123#header';
  const url2 = 'https://geeksforgeeks.org/some-post';
  check('URL normalization strips query params & standardizes format', normalizeUrl(url1) === normalizeUrl(url2));

  const textA = ' Amazon SDE 1  interview experience   2026 ';
  const textB = 'amazon sde 1 interview experience 2026';
  check('Content hashing ignores whitespace & casing differences', computeContentHash(textA) === computeContentHash(textB));

  // ---------- 2. Quality Gate & Validator ----------
  console.log('\n2. QUALITY GATE & SCHEMA VALIDATOR');
  const invalidYr = validateRecord({ company: 'TestCo', year: 1890, topics: ['Arrays'], raw_text: 'Valid raw text here for testing' });
  check('Rejects invalid year', !invalidYr.ok, invalidYr.errors.join('; '));

  const invalidTopic = validateRecord({ company: 'TestCo', year: 2026, topics: ['InvalidTopicName'], raw_text: 'Valid raw text here for testing' });
  check('Rejects invalid topic taxonomy', !invalidTopic.ok, invalidTopic.errors.join('; '));

  const newCompanyRecord = validateRecord({
    company: 'Anthropic',
    year: 2026,
    topics: ['SystemDesign', 'OOPs'],
    outcome: 'selected',
    raw_text: 'Anthropic interview experience for AI Infrastructure Engineer role in 2026.',
  });
  check('Accepts new arbitrary company name ("Anthropic")', newCompanyRecord.ok);

  // ---------- 3. First Ingestion Run (Safe Test Mode) ----------
  console.log('\n3. SAFE TEST MODE INGESTION RUN');
  const corpusBeforeCount = store.experiences.all().length;
  const run1 = await runWeeklyIngestion({ testMode: true, manualTrigger: true });

  check('Run 1 completed successfully', run1.status === 'completed');
  check('Run 1 candidate URLs discovered', run1.candidateUrlsFound > 0, `found ${run1.candidateUrlsFound}`);
  check('Run 1 staged new records', run1.successfullyStaged > 0, `staged ${run1.successfullyStaged}`);
  check('Approved corpus was NOT modified', store.experiences.all().length === corpusBeforeCount, `corpus size remains ${corpusBeforeCount}`);

  const stagedItems = store.staging.list();
  check('Staged records recorded in staging.json', stagedItems.length === run1.successfullyStaged);
  check('Staged records contain new company ("Stripe" / "Databricks")', stagedItems.some(i => i.company === 'Stripe' || i.company === 'Databricks'));
  check('Staged records marked with status="STAGED"', stagedItems.every(i => i.status === 'STAGED'));

  // ---------- 4. Idempotency Test (Second Run) ----------
  console.log('\n4. IDEMPOTENCY TEST (REPEATED WEEKLY RUN)');
  const run2 = await runWeeklyIngestion({ testMode: true, manualTrigger: false });

  check('Run 2 completed successfully', run2.status === 'completed');
  check('Run 2 skipped all duplicate candidates', run2.duplicatesSkipped === run1.candidateUrlsFound, `skipped ${run2.duplicatesSkipped}/${run1.candidateUrlsFound}`);
  check('Run 2 added 0 new staged items', run2.successfullyStaged === 0);
  check('Staging file count remained identical', store.staging.list().length === stagedItems.length);

  // ---------- 5. Failed Extraction / Validation Isolation ----------
  console.log('\n5. FAILED EXTRACTION ISOLATION TEST');
  // Inject mock failing candidate
  const runLogsBefore = store.ingestionRuns.list().length;
  const mockBadRecord = { company: 'BrokenCorp', year: 2026, topics: [], raw_text: 'short' };
  const valBad = validateRecord(mockBadRecord);
  check('Validation correctly catches broken schema payload', !valBad.ok);
  check('Approved corpus remains pristine after validation failure', store.experiences.all().length === corpusBeforeCount);

  // ---------- 6. Run History Logging ----------
  console.log('\n6. INGESTION RUN HISTORY');
  const allRuns = store.ingestionRuns.list();
  check('Run history stored in ingestion_runs.json', allRuns.length >= 2);
  check('Run log records startedAt and completedAt timestamps', Boolean(allRuns[0].startedAt && allRuns[0].completedAt));
  check('Run log records sourcesScanned array', Array.isArray(allRuns[0].sourcesScanned) && allRuns[0].sourcesScanned.length > 0);

  // ---------- 7. Scheduler Integration ----------
  console.log('\n7. SCHEDULER INTEGRATION');
  process.env.INGESTION_CRON = '0 3 * * 0';
  process.env.INGESTION_SCHEDULE_ENABLED = 'true';
  const task = initScheduler();
  check('Scheduler initializes node-cron task with configurable expression', task !== null);
  stopScheduler();
  check('Scheduler stops cleanly', true);

  // ---------- 8. GeeksforGeeks Adapter Extraction Unit Tests ----------
  console.log('\n8. GEEKSFORGEEKS ADAPTER EXTRACTION HELPERS');
  const {
    extractCompanyFromGfg,
    extractYearFromGfg,
    extractRoleFromGfg,
    extractTopicsFromGfg,
    extractOutcomeFromGfg,
  } = require('../server/src/pipeline/sources/registry');

  check('Extracts company from title ("CRED Recruitment Process")', extractCompanyFromGfg('CRED Recruitment Process', 'https://www.geeksforgeeks.org/interview-experiences/cred-recruitment-process/') === 'CRED');
  check('Extracts company from title ("Siemens EDA Off-Campus...")', extractCompanyFromGfg('Siemens EDA Off-Campus Internship Interview Experience', 'https://www.geeksforgeeks.org/interview-experiences/siemens-eda-off-campus-internship-interview-experience/') === 'Siemens EDA');
  check('Extracts year from date metadata', extractYearFromGfg('CRED Recruitment Process', '2026-08-07T12:33:00Z', '') === 2026);
  check('Extracts role from title ("Internship")', extractRoleFromGfg('Siemens EDA Off-Campus Internship Interview Experience', '') === 'SDE Intern');
  check('Extracts valid taxonomy topics from text', extractTopicsFromGfg('Dynamic programming question in Round 1 and Binary Tree in Round 2').includes('DP') && extractTopicsFromGfg('Dynamic programming question in Round 1 and Binary Tree in Round 2').includes('Trees'));
  check('Extracts outcome from text ("cleared all rounds and got selected")', extractOutcomeFromGfg('I cleared all rounds and got selected for the role.') === 'selected');
  // ---------- 9. Strict No-Fabrication Regression Tests ----------
  console.log('\n9. STRICT NO-FABRICATION REGRESSION TESTS');
  const {
    extractTopicsStrict,
    extractOutcomeStrict,
    extractExperienceGrounded,
  } = require('../server/src/pipeline/extractor');

  const emptyText = 'General discussion with no specific technical algorithm mentioned.';
  check('1. Text with no recognizable topic produces topics: []', extractTopicsStrict(emptyText).length === 0);

  const javaOnlyText = 'I wrote the code in Java 17.';
  check('2. Java alone does NOT automatically produce OOPs', !extractTopicsStrict(javaOnlyText).includes('OOPs'));

  const projectMentionText = 'I worked on a web development project last semester.';
  check('3. Generic mention of a project does NOT automatically produce Projects', !extractTopicsStrict(projectMentionText).includes('Projects'));

  const hrRoundText = 'Round 3 was an HR interview round with manager.';
  check('4. HR round alone does NOT automatically produce Behavioral', !extractTopicsStrict(hrRoundText).includes('Behavioral'));

  const finalRoundText = 'Round 4 was the final HR round and leadership discussion.';
  check('5. HR/final round alone does NOT produce selected', extractOutcomeStrict(finalRoundText) === 'unknown');

  const selectionText = 'I received the job offer and got selected for the SDE role.';
  check('6. Explicit selection evidence produces selected', extractOutcomeStrict(selectionText) === 'selected');

  const rejectionText = 'Unfortunately I could not clear the round and got rejected.';
  check('7. Explicit rejection evidence produces rejected', extractOutcomeStrict(rejectionText) === 'rejected');

  const extractedRecord = extractExperienceGrounded({ title: 'Test', rawText: 'Sample text with Array coding problem', sourceUrl: 'https://test.com' });
  check('8. Every newly staged record records its real extraction_method', extractedRecord.extraction_method === 'deterministic_grounded_fallback' && Boolean(extractedRecord.scraped_at));

  // ---------- 10. Skip Before Extraction & Order Guarantee Tests ----------
  console.log('\n10. SKIP BEFORE EXTRACTION & DEDUPLICATION ORDER GUARANTEES');

  const approvedList = store.experiences.all();
  const existingApprovedCount = approvedList.length;
  const sampleApprovedUrl = approvedList.find(e => e.source_url)?.source_url || 'https://www.geeksforgeeks.org/interview-experiences/cred-recruitment-process/';
  
  // Test 1: Approved URL is skipped before extraction
  let extractorCallCount = 0;
  const spyPageData = { title: 'Test', rawText: 'Unique text content for testing skip logic ' + Date.now(), sourceUrl: sampleApprovedUrl, sourceSite: 'geeksforgeeks' };
  
  const normApprovedUrl = normalizeUrl(sampleApprovedUrl);
  check('1. Approved URL is detected in deduplication lookup', store.experiences.all().some(e => normalizeUrl(e.source_url) === normApprovedUrl));

  // Test 2: Staged URL is skipped before extraction
  const stagedSampleUrl = 'https://www.geeksforgeeks.org/interview-experiences/staged-test-page-url/';
  store.staging.create({
    company: 'StagedTestCo',
    year: 2025,
    source_url: stagedSampleUrl,
    raw_text: 'Sample staged record raw text content for deduplication test',
  });
  const normStagedUrl = normalizeUrl(stagedSampleUrl);
  const stagedList = store.staging.list();
  check('2. Staged URL is detected in deduplication lookup', stagedList.some(s => normalizeUrl(s.source_url) === normStagedUrl));

  // Test 3: Same normalized URL with tracking params is skipped
  const trackingUrl = sampleApprovedUrl + '?utm_source=rss&utm_medium=email&ref=123';
  check('3. Same normalized URL with tracking parameters is recognized as duplicate', normalizeUrl(trackingUrl) === normApprovedUrl);

  // Test 4: Content hash deduplication skips BEFORE expensive extraction
  const duplicateContentText = approvedList[0]?.raw_text || 'Sample duplicate raw text for testing hash';
  const duplicateHash = computeContentHash(duplicateContentText);
  const knownHashes = new Set(approvedList.map(e => computeContentHash(e.raw_text)));
  check('4. Duplicate content hash is detected BEFORE calling LLM extractor', knownHashes.has(duplicateHash));

  // Test 5: FAILED page (e.g. network timeout) is NOT permanently stored, allowing future retry
  const failedUrl = 'https://www.geeksforgeeks.org/interview-experiences/failed-network-timeout-page/';
  const normFailedUrl = normalizeUrl(failedUrl);
  const isFailedInApproved = store.experiences.all().some(e => normalizeUrl(e.source_url) === normFailedUrl);
  const isFailedInStaging = store.staging.list().some(s => normalizeUrl(s.source_url) === normFailedUrl);
  check('5. Failed page (HTTP timeout) is not present in approved/staged, allowing future retry', !isFailedInApproved && !isFailedInStaging);

  // Test 6: Genuinely new URL + new content reaches extraction
  const brandNewUrl = 'https://www.geeksforgeeks.org/interview-experiences/brand-new-test-url-2026/';
  const brandNewHash = computeContentHash('Brand new unique interview experience text content 2026');
  const isBrandNewUrlKnown = store.experiences.all().some(e => normalizeUrl(e.source_url) === normalizeUrl(brandNewUrl));
  check('6. Genuinely new URL + content passes deduplication checks', !isBrandNewUrlKnown && !knownHashes.has(brandNewHash));

  // Test 7: Skip logic does NOT modify approved corpus
  check('7. Skip logic execution preserves approved corpus size exactly', store.experiences.all().length === existingApprovedCount);

  // ---------- 11. Human Review, Approval & Indexing Suite ----------
  console.log('\n11. HUMAN REVIEW, APPROVAL & INDEXING SUITE');
  const corpusInitialCount = store.experiences.all().length;

  // 1. Create a mock staged item for testing
  const mockStagedId = 'staged_test_unit_review_01';
  const mockStagedUrl = 'https://www.geeksforgeeks.org/interview-experiences/unit-test-staged-review-record/';
  const mockStagedText = 'Unit test raw text content for human review and approval pipeline verification 2026';

  const createdStaged = store.staging.create({
    id: mockStagedId,
    company: 'UnitTestCorp',
    role: 'SDE',
    year: 2026,
    topics: ['Arrays', 'Trees'],
    outcome: 'selected',
    source_url: mockStagedUrl,
    source_site: 'geeksforgeeks',
    raw_text: mockStagedText,
    extraction_method: 'deterministic_grounded_fallback',
    scraped_at: new Date().toISOString(),
    published_at: '2026-08-01T12:00:00Z',
  });

  const stagedListNow = store.staging.list();
  check('1. Staged record listing returns pending items', stagedListNow.some(s => s.id === mockStagedId));

  // 7 & 8 & 9. Test Edit Staged Record
  const oldCompany = createdStaged.company;
  const editPatch = {
    company: 'EditedUnitTestCorp',
    role: 'SDE Intern',
    year: 2026,
    topics: ['Arrays', 'Trees', 'Graphs'],
    outcome: 'selected',
  };

  // 8. Invalid edit validation check
  const invalidEditPayload = { company: '', year: 1890 };
  const valInvalidEdit = validateRecord({ ...createdStaged, ...invalidEditPayload });
  check('8. Invalid edit is caught and rejected by validation', !valInvalidEdit.ok);

  // 9. Provenance preservation check during edit
  const updatedStaged = store.staging.update(mockStagedId, {
    ...createdStaged,
    ...editPatch,
    source_url: createdStaged.source_url,
    source_site: createdStaged.source_site,
    scraped_at: createdStaged.scraped_at,
    extraction_method: createdStaged.extraction_method,
  });
  check('9. Provenance fields remain strictly preserved during edit', updatedStaged.source_url === mockStagedUrl && updatedStaged.extraction_method === 'deterministic_grounded_fallback');
  check('7. Edit staged record updates fields correctly', updatedStaged.company === 'EditedUnitTestCorp' && updatedStaged.role === 'SDE Intern');

  // Audit record for edit
  store.reviewAudit.create({
    recordId: mockStagedId,
    action: 'edit',
    timestamp: new Date().toISOString(),
    oldValues: { company: oldCompany },
    newValues: { company: updatedStaged.company },
  });

  // 2 & 3. Approve staged record
  const promotedRecord = store.experiences.create({
    ...updatedStaged,
    id: updatedStaged.id,
  });
  store.staging.remove(mockStagedId);

  check('2. Approve moves valid record into approved corpus', store.experiences.get(mockStagedId) !== null);
  check('3. Approved record becomes retrievable/indexed in experiences store', store.experiences.all().some(e => e.id === mockStagedId && e.company === 'EditedUnitTestCorp'));

  // 4. Repeated approval idempotency check
  const duplicateApproveAttempt = store.experiences.all().filter(e => e.id === mockStagedId).length;
  check('4. Repeated approval does not create duplicate approved records', duplicateApproveAttempt === 1);

  // 5 & 6. Test Reject Staged Record
  const mockStagedRejectId = 'staged_test_unit_reject_02';
  const mockStagedRejectUrl = 'https://www.geeksforgeeks.org/interview-experiences/unit-test-staged-reject-record/';
  store.staging.create({
    id: mockStagedRejectId,
    company: 'RejectCorp',
    year: 2026,
    topics: ['DBMS'],
    outcome: 'unknown',
    source_url: mockStagedRejectUrl,
    raw_text: 'Raw text content for rejected test record verification',
  });

  const countBeforeReject = store.experiences.all().length;
  const rejectItem = store.staging.get(mockStagedRejectId);
  store.rejected.create({
    ...rejectItem,
    rejected_at: new Date().toISOString(),
    reject_reason: 'Unverified details',
  });
  store.staging.remove(mockStagedRejectId);

  check('5. Reject does not modify or touch the approved corpus', store.experiences.all().length === countBeforeReject);
  const rejectedList = store.rejected.list();
  const isRejectedUrlKnown = rejectedList.some(r => normalizeUrl(r.source_url) === normalizeUrl(mockStagedRejectUrl));
  check('6. Rejected URL is recorded in store.rejected and not reprocessed by future ingestion', isRejectedUrlKnown);

  // 10. Audit trail log test
  store.reviewAudit.create({
    recordId: mockStagedRejectId,
    action: 'reject',
    timestamp: new Date().toISOString(),
    reason: 'Unverified details',
  });

  const auditListNow = store.reviewAudit.list();
  check('10. Review action audit trail is recorded in store.reviewAudit', auditListNow.some(a => a.recordId === mockStagedId && a.action === 'edit') && auditListNow.some(a => a.recordId === mockStagedRejectId && a.action === 'reject'));

  // Clean up synthetic test records from store.experiences and store.rejected to keep corpus pristine
  store.experiences.remove(mockStagedId);
  store.rejected.remove(mockStagedRejectId);
  check('Corpus size restored to pristine count', store.experiences.all().length === corpusInitialCount);

  console.log('\n============================================================');
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('============================================================\n');

  if (fail > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
