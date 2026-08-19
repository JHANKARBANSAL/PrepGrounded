/**
 * corpus.service.js
 * ------------------------------------------------------------------
 * Keeps embeddings and drift profiles in sync with the stored corpus.
 *
 * Two cache-invalidation triggers (a real cache-coherence problem, worth
 * mentioning in viva):
 *   - a record is created/updated  -> re-embed THAT record
 *   - the corpus changes at all    -> recompute drift profiles, because
 *                                     lambda is derived from the corpus
 * ------------------------------------------------------------------
 */

const store = require('../store');
const { embed, embedBatch } = require('./embedding.service');
const { buildDriftProfiles } = require('./drift.service');

let driftProfiles = {};
let ready = false;

/**
 * Which text do we embed?
 *
 * Not just raw_text. topics and questions are repeated here even though
 * they usually also appear inside raw_text — that repetition deliberately
 * increases their weight in the vector, because they are the most
 * information-dense fields we have. raw_text carries a lot of filler
 * ("I applied through the careers portal and after two weeks...").
 */
function textFor(exp) {
  return [
    exp.company,
    exp.role,
    `year ${exp.year}`,
    (exp.topics || []).join(' '),
    (exp.questions || []).join(' '),
    exp.raw_text,
  ].filter(Boolean).join(' . ');
}

const path = require('path');
const fs = require('fs');
const CACHE_FILE = path.join(__dirname, '..', '..', '..', 'data', '.embeddings.json');

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

/**
 * Embed anything missing an embedding, then recompute drift.
 *
 * Embeddings are cached on disk keyed by record id + a hash of the text,
 * so editing one record only re-embeds that record. With the Gemini
 * provider this is the difference between 1 API call and 139.
 */
async function warmup() {
  const all = store.experiences.all();
  const cache = loadCache();

  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };

  const toEmbed = [];
  all.forEach(e => {
    const text = textFor(e);
    const key = `${e.id}:${hash(text)}`;
    if (cache[key]) { e.embedding = cache[key]; }
    else { toEmbed.push({ e, text, key }); }
  });

  if (toEmbed.length) {
    console.log(`[corpus] embedding ${toEmbed.length} record(s)...`);
    const vectors = await embedBatch(toEmbed.map(x => x.text));
    toEmbed.forEach((x, i) => { x.e.embedding = vectors[i]; cache[x.key] = vectors[i]; });
    saveCache(cache);
  } else {
    console.log('[corpus] all embeddings served from cache');
  }

  refreshDrift();
  ready = true;
  console.log(`[corpus] ready — ${all.length} records, ${Object.keys(driftProfiles).length} companies`);
  return { total: all.length, embedded: toEmbed.length };
}

function refreshDrift() {
  driftProfiles = buildDriftProfiles(store.experiences.all());
  return driftProfiles;
}

async function embedRecord(exp) {
  exp.embedding = await embed(textFor(exp));
  return exp;
}

module.exports = {
  warmup,
  refreshDrift,
  embedRecord,
  textFor,
  getDriftProfiles: () => driftProfiles,
  isReady: () => ready,
};
