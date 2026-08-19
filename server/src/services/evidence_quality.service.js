/**
 * server/src/services/evidence_quality.service.js — Evidence Quality V2 Engine
 * ------------------------------------------------------------------
 * Measures: "How well-supported and complete is this interview record as evidence?"
 *
 * Deterministic, discriminative, and bounded in [0, 1].
 *
 * 6 Evidence Dimensions (Total = 1.00):
 *   1. Source Provenance (0.15)
 *   2. Temporal Evidence (0.10)
 *   3. Structured Interview Detail (0.20)
 *   4. Topic & Question Grounding (0.25)
 *   5. Content Richness (0.15)
 *   6. Outcome Evidence Integrity (0.15)
 * ------------------------------------------------------------------
 */

const QUALITY_THRESHOLDS_V2 = {
  HIGH: 0.80,
  MEDIUM: 0.55,
};

function getQualityLabelV2(score) {
  if (score >= QUALITY_THRESHOLDS_V2.HIGH) return 'High';
  if (score >= QUALITY_THRESHOLDS_V2.MEDIUM) return 'Medium';
  return 'Limited';
}

function computeEvidenceQuality(record) {
  if (!record) {
    return {
      evidenceQuality: 0.0,
      evidenceLabel: 'Limited',
      explicitOutcomeEvidenceMissing: false,
      evidenceBreakdown: {
        provenance: 0.0,
        temporalEvidence: 0.0,
        structuredDetail: 0.0,
        topicGrounding: 0.0,
        contentRichness: 0.0,
        outcomeIntegrity: 0.0,
      },
      evidenceFlags: ['sparse_content', 'missing_source_metadata'],
    };
  }

  const flags = [];

  // A. Source Provenance (0.15)
  const hasUrl = Boolean(record.source_url && /^https?:\/\//i.test(record.source_url));
  const hasSite = Boolean(record.source_site && record.source_site.trim().length > 0);
  const hasPubDate = Boolean(record.published_at || record.crawled_at);

  let provenance = (hasUrl ? 0.09 : 0.0) + (hasSite ? 0.04 : 0.0) + (hasPubDate ? 0.02 : 0.0);
  if (!hasUrl || !hasSite) {
    flags.push('missing_source_metadata');
  }

  // B. Temporal Evidence (0.10)
  const hasYear = Boolean(record.year && record.year >= 2015 && record.year <= 2027);
  const hasMonth = Boolean(record.month !== null && record.month !== undefined);

  let temporalEvidence = (hasYear ? 0.07 : 0.0) + (hasMonth ? 0.03 : 0.0);
  if (!hasYear) {
    flags.push('missing_temporal_detail');
  }

  // C. Structured Interview Detail (0.20)
  const hasCompany = Boolean(record.company && record.company.trim().length > 0);
  const hasRole = Boolean(record.role && record.role.trim().length > 0);
  const hasRounds = Boolean(record.total_rounds >= 1 || (record.rounds && record.rounds.length > 0));

  // Round description depth
  const roundDescs = (record.rounds || []).map(r => r.description || r.questions?.join(' ') || '').join(' ');
  const hasSubstantialRoundDetail = roundDescs.trim().length >= 30;

  let structuredDetail = (hasCompany ? 0.04 : 0.0) + (hasRole ? 0.04 : 0.0) + (hasRounds ? 0.04 : 0.0) + (hasSubstantialRoundDetail ? 0.08 : 0.02);
  if (!hasRounds || !hasSubstantialRoundDetail) {
    flags.push('weak_round_detail');
  }

  if (hasCompany && hasRole && (record.company.toLowerCase() === record.role.toLowerCase())) {
    flags.push('suspicious_company_role_mapping');
  }

  // D. Question & Topic Grounding (0.25)
  const topics = record.topics || [];
  const rawText = (record.raw_text || '').toLowerCase();
  const allText = (rawText + ' ' + roundDescs.toLowerCase()).trim();

  let groundedCount = 0;
  if (topics.length > 0) {
    for (const t of topics) {
      if (allText.includes(t.toLowerCase())) {
        groundedCount++;
      }
    }
  }

  const groundingRatio = topics.length > 0 ? groundedCount / topics.length : 0.0;
  let topicGroundingScore = 0.0;
  if (topics.length > 0) {
    if (groundingRatio >= 0.80) topicGroundingScore = 0.15;
    else if (groundingRatio >= 0.40) topicGroundingScore = 0.08;
    else topicGroundingScore = 0.02;
  } else {
    topicGroundingScore = 0.05; // No fabricated topics
  }

  if (topics.length > 0 && groundingRatio < 0.50) {
    flags.push('unsupported_topics');
  }

  const hasQuestions = Boolean(record.questions && record.questions.length > 0);
  const questionEvidence = hasQuestions ? 0.10 : (allText.includes('?') ? 0.05 : 0.0);

  const topicGrounding = Number((topicGroundingScore + questionEvidence).toFixed(2));

  // E. Content Richness (0.15)
  const rawLen = (record.raw_text || '').trim().length;
  const words = (record.raw_text || '').trim().split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;

  let textLenScore = 0.0;
  if (rawLen >= 800) textLenScore = 0.06;
  else if (rawLen >= 400) textLenScore = 0.03;
  else if (rawLen >= 150) textLenScore = 0.01;

  let wordDiversityScore = 0.0;
  if (uniqueWords >= 100) wordDiversityScore = 0.05;
  else if (uniqueWords >= 40) wordDiversityScore = 0.02;

  const structuralCombo = (hasRounds && topics.length > 0 && hasQuestions) ? 0.04 : 0.01;

  let contentRichness = Number((textLenScore + wordDiversityScore + structuralCombo).toFixed(2));
  if (rawLen < 200) {
    flags.push('sparse_content');
  }

  // F. Outcome Evidence Integrity (0.15)
  let outcomeIntegrity = 0.15;
  let explicitOutcomeEvidenceMissing = false;

  if (record.outcome === 'selected' || record.outcome === 'rejected') {
    const selKeywords = ['selected', 'offer', 'cleared', 'accepted', 'hired', 'got the role', 'verdict: selected'];
    const rejKeywords = ['rejected', 'could not clear', 'disqualified', 'did not pass', 'not selected', 'verdict: rejected'];
    const searchKeys = record.outcome === 'selected' ? selKeywords : rejKeywords;
    const foundExplicit = searchKeys.some(k => rawText.includes(k));

    if (foundExplicit) {
      outcomeIntegrity = 0.15;
    } else {
      outcomeIntegrity = 0.02; // Substantial penalty for unverified outcome
      explicitOutcomeEvidenceMissing = true;
      flags.push('unsupported_outcome');
    }
  }

  // Compute raw sum
  let rawSum = provenance + temporalEvidence + structuredDetail + topicGrounding + contentRichness + outcomeIntegrity;

  // Apply Hard Caps
  if (!hasUrl) {
    rawSum = Math.min(rawSum, 0.70);
  }

  if (rawLen < 200) {
    rawSum = Math.min(rawSum, 0.50);
  }

  const finalScore = Number(Math.min(1.0, Math.max(0.0, rawSum)).toFixed(2));

  return {
    evidenceQuality: finalScore,
    evidenceLabel: getQualityLabelV2(finalScore),
    explicitOutcomeEvidenceMissing,
    evidenceBreakdown: {
      provenance: Number(provenance.toFixed(2)),
      temporalEvidence: Number(temporalEvidence.toFixed(2)),
      structuredDetail: Number(structuredDetail.toFixed(2)),
      topicGrounding: Number(topicGrounding.toFixed(2)),
      contentRichness: Number(contentRichness.toFixed(2)),
      outcomeIntegrity: Number(outcomeIntegrity.toFixed(2)),
    },
    evidenceFlags: flags,
  };
}

module.exports = {
  computeEvidenceQuality,
  getQualityLabel: getQualityLabelV2,
  getQualityLabelV2,
  QUALITY_THRESHOLDS: QUALITY_THRESHOLDS_V2,
  QUALITY_THRESHOLDS_V2,
};
