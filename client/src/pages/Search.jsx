/**
 * Search.jsx — Main User Search Experience for PrepGrounded
 *
 * Single-column production feed using Semantic + Recency ranking.
 */

import { useEffect, useState } from 'react';
import { api } from '../api';
import { EvidenceQualityBadge, HumanWhyThisResult, TrendInsightCard } from '../components';

const FRESHNESS_OPTIONS = [
  { key: 'balanced', label: 'Balanced', desc: 'Balance relevance with recent interview trends.' },
  { key: 'recent', label: 'Recent First', desc: 'Prioritize newer interview experiences.' },
  { key: 'broad', label: 'Broad History', desc: 'Include older experiences when they are still relevant.' },
];

const OUTCOME_OPTIONS = [
  { key: 'any', label: 'Any Outcome' },
  { key: 'selected', label: 'Selected' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'unknown', label: 'Unknown' },
];

export default function Search() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('Amazon');
  const [query, setQuery] = useState('system design rounds and interview process');
  const [freshnessPref, setFreshnessPref] = useState('balanced');
  const [outcomeFilter, setOutcomeFilter] = useState('any');

  const [results, setResults] = useState(null);
  const [driftProfile, setDriftProfile] = useState(null);
  const [searchedCount, setSearchedCount] = useState(null);

  const [loading, setLoading] = useState(false);
  const [slowNotice, setSlowNotice] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.companies().then(setCompanies).catch(() => {});
  }, []);

  async function handleSearch(e) {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSlowNotice(false);
    setError(null);

    const timer = setTimeout(() => setSlowNotice(true), 3500);

    try {
      // Execute production search query via compare API or retrieve API
      const res = await api.compare({
        query: query.trim(),
        company: company || null,
        freshnessPreference: freshnessPref,
        outcomeFilter: outcomeFilter === 'any' ? null : outcomeFilter,
        k: 10,
      });

      const prodArm = res.arms?.find(a => a.mode === 'fixed');
      setResults(prodArm?.results || []);
      setDriftProfile(res.driftProfile || null);

      // Count total candidate experiences searched
      const compObj = companies.find(c => (c.name || '').toLowerCase() === (company || '').toLowerCase());
      setSearchedCount(compObj ? compObj.count : (company ? 0 : 204));
    } catch (err) {
      setError(err.message || 'We couldn\'t load interview results.');
    } finally {
      clearTimeout(timer);
      setLoading(false);
      setSlowNotice(false);
    }
  }

  // Auto-run search on mount & when filters change
  useEffect(() => {
    handleSearch();
  }, [company, outcomeFilter]);

  const selectedCompObj = companies.find(c => (c.name || '').toLowerCase() === (company || '').toLowerCase());
  const companyRecordCount = selectedCompObj ? selectedCompObj.count : null;

  return (
    <div className="search-page">
      {/* Hero Header */}
      <div className="search-hero">
        <h2>PrepGrounded</h2>
        <p className="hero-sub">
          Relevant interview experiences, prioritized for today's hiring patterns.
        </p>
      </div>

      {/* Main Search Panel */}
      <div className="card search-card">
        <form onSubmit={handleSearch}>
          <div className="search-input-group">
            <label className="field-label" htmlFor="main-query">
              What are you preparing for?
            </label>
            <div className="query-row">
              <input
                id="main-query"
                type="text"
                className="search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. system design rounds, Amazon SDE interview, dynamic programming"
              />
              <button type="submit" className="btn-primary search-btn" disabled={loading}>
                {loading ? 'Searching…' : 'Search Interviews'}
              </button>
            </div>
          </div>

          <div className="search-controls-grid">
            {/* Company Dropdown */}
            <div className="control-box">
              <label className="control-label" htmlFor="company-select">Company</label>
              <select
                id="company-select"
                className="select-input"
                value={company}
                onChange={e => setCompany(e.target.value)}
              >
                <option value="">All Companies</option>
                {companies.map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
                ))}
              </select>
            </div>

            {/* Outcome Filter */}
            <div className="control-box">
              <label className="control-label" htmlFor="outcome-select">Candidate Outcome</label>
              <select
                id="outcome-select"
                className="select-input"
                value={outcomeFilter}
                onChange={e => setOutcomeFilter(e.target.value)}
              >
                {OUTCOME_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <span className="control-desc">Filter candidate result status</span>
            </div>
          </div>
        </form>

        {error && (
          <div className="error-banner">
            <p>We couldn't load interview results. {error}</p>
            <button className="btn-ghost btn-sm" onClick={handleSearch}>Try Again</button>
          </div>
        )}
      </div>

      {/* Loading & Cold Start Indicator */}
      {loading && (
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">
            {slowNotice
              ? 'The search service is waking up — this may take a few seconds.'
              : 'Finding the most relevant interview experiences...'}
          </p>
        </div>
      )}

      {/* Results Content Stream */}
      {!loading && results && (
        <div className="results-wrapper">
          {/* Subtle Search Summary Line */}
          <div className="search-summary-bar">
            <span>
              {searchedCount !== null ? `${searchedCount} ${company || ''} experiences searched` : 'Searched verified database'}
            </span>
            <span className="summary-pill">Production Ranking (Semantic + Recency)</span>
          </div>



          {/* Empty State */}
          {results.length === 0 ? (
            <div className="card empty-card">
              <h3>No matching interview experiences found.</h3>
              <p>Try selecting another company, setting broader freshness, or entering a more general search term.</p>
              <button
                className="btn-ghost btn-sm"
                onClick={() => { setFreshnessPref('broad'); setOutcomeFilter('any'); setCompany(''); }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            /* Result Cards Feed */
            <div className="results-feed">
              {results.map(r => {
                const isOld = (new Date().getFullYear() - r.year) > 4;
                return (
                  <div className="card result-card" key={r.id}>
                    {/* Header Row: Company + Role | Badges */}
                    <div className="result-card-header">
                      <div className="result-title">
                        <span className="company-name">{r.company}</span>
                        <span className="role-title"> — {r.role || 'Software Development Engineer'}</span>
                      </div>
                      <div className="result-badges">
                        <span className={`year-badge ${isOld ? 'old' : ''}`}>{r.year}</span>
                        <span className={`outcome-chip ${r.outcome}`}>{r.outcome}</span>
                        <EvidenceQualityBadge
                          label={r.evidenceLabel}
                          breakdown={r.evidenceBreakdown}
                          flags={r.evidenceFlags}
                        />
                      </div>
                    </div>

                    {/* Topics Row */}
                    <div className="topics-row">
                      {(r.topics || []).map(t => (
                        <span className="topic-chip" key={t}>{t}</span>
                      ))}
                    </div>

                    {/* Snippet Preview */}
                    {r.snippet && (
                      <p className="snippet-text">"{r.snippet}"</p>
                    )}

                    {/* Footer Row: Human Why This Result + Source Link */}
                    <div className="result-card-footer">
                      <HumanWhyThisResult result={r} companyRecordCount={companyRecordCount} />

                      {r.source_url && (
                        <a href={r.source_url} target="_blank" rel="noreferrer" className="source-link">
                          {r.source_site || 'Source Post'} ↗
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
