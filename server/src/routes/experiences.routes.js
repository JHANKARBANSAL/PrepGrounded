/**
 * experiences.routes.js — corpus pe full CRUD
 *
 * Write path pe do cheezein hoti hain jo normal CRUD mein nahi hoti:
 *   1. record save hone se PEHLE embed hota hai (query time pe nahi)
 *   2. save ke baad drift profiles recompute hote hain
 *
 * Doosra kyun: λ corpus se derive hota hai. Ek naya 2026 ka Amazon record
 * add karne se Amazon ka drift badal sakta hai. Agar recompute na karo toh
 * λ stale ho jaayega. Ye cache invalidation ka real example hai — viva mein
 * ye bolne layak hai.
 */

const express = require('express');
const store = require('../store');
const corpus = require('../services/corpus.service');

const router = express.Router();

const VALID_OUTCOMES = ['selected', 'rejected', 'unknown'];
const VOCAB = ['DP','Arrays','Strings','Graphs','Trees','LinkedList','Recursion',
  'Greedy','SlidingWindow','BinarySearch','OOPs','DBMS','OS','Networks',
  'SystemDesign','Aptitude','Behavioral','Projects'];


/**
 * Validation. Ek galat record poore corpus ki counting bigaad deta hai —
 * "Dynamic Programming" aur "DP" alag topics ban jaate hain aur aapke
 * saare percentages galat ho jaate hain. Isliye gate yahin lagana zaroori hai.
 *
 * partial=true → PUT ke liye, jahan sirf kuch fields aayenge
 */
function validate(body, { partial = false } = {}) {
  const errors = [];

  if (!partial) {
    if (!body.company) errors.push('company is required');
    if (body.year === undefined) errors.push('year is required');
  }

  if (body.year !== undefined) {
    const y = Number(body.year);
    // +1 isliye ki abhi August 2026 hai par log agle saal ke drives ke
    // liye bhi post karte hain
    if (!Number.isInteger(y) || y < 2000 || y > new Date().getFullYear() + 1) {
      errors.push('year must be a realistic 4-digit year');
    }
  }

  if (body.month !== undefined && body.month !== null) {
    const m = Number(body.month);
    if (!Number.isInteger(m) || m < 1 || m > 12) errors.push('month must be 1-12');
  }

  if (body.outcome && !VALID_OUTCOMES.includes(body.outcome)) {
    errors.push(`outcome must be one of: ${VALID_OUTCOMES.join(', ')}`);
  }

  if (body.topics !== undefined) {
    if (!Array.isArray(body.topics)) {
      errors.push('topics must be an array');
    } else {
      const invalid = body.topics.filter(t => !VOCAB.includes(t));
      if (invalid.length) {
        errors.push(`invalid topics: ${invalid.join(', ')}. Allowed: ${VOCAB.join(', ')}`);
      }
    }
  }

  return errors;
}


/** raw_text auto-generate karo agar user ne nahi diya */
function buildRawText(e) {
  const rounds = (e.rounds || []).map(r =>
    `Round ${r.round_number} (${r.round_type}): ${(r.topics || []).join(', ')}. ` +
    `Questions: ${(r.questions || []).join('; ')}.`
  ).join(' ');

  return `${e.company} ${e.role || ''} interview experience (${e.month || '?'}/${e.year}). ` +
         `${rounds} Result: ${e.outcome || 'unknown'}.`.trim();
}


/* ------------------------------- READ ------------------------------- */

// GET /api/experiences?company=Amazon&year=2025&topic=DP&page=1&limit=20
router.get('/', (req, res) => {
  res.json(store.experiences.list(req.query));
});

router.get('/:id', (req, res) => {
  const row = store.experiences.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Experience not found' });
  res.json(row);
});


/* ------------------------------ CREATE ------------------------------ */

router.post('/', async (req, res, next) => {
  try {
    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const draft = {
      ...req.body,
      source: req.body.source || 'user',
      source_site: req.body.source_site || 'user_submitted',
      raw_text: req.body.raw_text || buildRawText(req.body),
    };

    // Embed PEHLE, save BAAD mein. Agar embedding fail ho jaaye toh corpus
    // mein aisa record nahi ghusna chahiye jo searchable hi na ho.
    await corpus.embedRecord(draft);

    const created = store.experiences.create(draft);
    corpus.refreshDrift();

    res.status(201).json({
      ...created,
      _note: 'Embedded and drift recomputed. Turant searchable hai.',
    });
  } catch (err) { next(err); }
});


/* ------------------------------ UPDATE ------------------------------ */

router.put('/:id', async (req, res, next) => {
  try {
    const errors = validate(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const existing = store.experiences.getRaw(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Experience not found' });

    const merged = { ...existing, ...req.body };

    // Re-embed SIRF tab jab semantic content badla ho. Agar sirf source_url
    // ya month badla hai toh embedding wahi rahegi — dobara banana waste hai.
    // (Gemini provider pe ye ek API call bachata hai.)
    const contentChanged = ['raw_text', 'topics', 'questions', 'company', 'role', 'year']
      .some(f => req.body[f] !== undefined
                 && JSON.stringify(req.body[f]) !== JSON.stringify(existing[f]));

    if (contentChanged) {
      merged.raw_text = req.body.raw_text || buildRawText(merged);
      await corpus.embedRecord(merged);
    }

    const updated = store.experiences.update(req.params.id, merged);
    corpus.refreshDrift();

    res.json({ ...updated, _reEmbedded: contentChanged });
  } catch (err) { next(err); }
});


/* ------------------------------ DELETE ------------------------------ */

router.delete('/:id', (req, res) => {
  const ok = store.experiences.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Experience not found' });

  corpus.refreshDrift();
  res.json({ deleted: true, id: req.params.id });
});


module.exports = router;
