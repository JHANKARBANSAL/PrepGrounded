/**
 * resumes.routes.js — upload, parse, CRUD.
 */

const express = require('express');
const multer = require('multer');
const store = require('../store');
const { extractFromText, parsePdf } = require('../services/resume.service');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB is plenty for a resume
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) return cb(null, true);
    cb(new Error('Only PDF resumes are accepted'));
  },
});

// POST /api/resumes/upload   (multipart, field name: "resume")
router.post('/upload', upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name must be "resume")' });
    const text = await parsePdf(req.file.buffer);
    const extracted = await extractFromText(text);
    const saved = store.resumes.create({
      filename: req.file.originalname,
      raw_text: text,
      extracted_skills: extracted.skills,
      extracted_projects: extracted.projects,
      candidate_name: extracted.name,
      evidence: extracted.evidence,
      extraction_method: extracted.extractionMethod,
    });
    res.status(201).json({ ...saved, raw_text: undefined, rawLength: text.length });
  } catch (err) { next(err); }
});

// POST /api/resumes/text   { text }  — fallback path, also handy for tests
router.post('/text', async (req, res, next) => {
  try {
    const { text, filename = 'pasted.txt' } = req.body;
    if (!text || text.length < 30) return res.status(400).json({ error: 'text is required (min 30 chars)' });
    const extracted = await extractFromText(text);
    const saved = store.resumes.create({
      filename,
      raw_text: text,
      extracted_skills: extracted.skills,
      extracted_projects: extracted.projects,
      candidate_name: extracted.name,
      evidence: extracted.evidence,
      extraction_method: extracted.extractionMethod,
    });
    res.status(201).json({ ...saved, raw_text: undefined, rawLength: text.length });
  } catch (err) { next(err); }
});

router.get('/', (req, res) => {
  res.json(store.resumes.list().map(r => ({ ...r, raw_text: undefined })));
});

router.get('/:id', (req, res) => {
  const r = store.resumes.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Resume not found' });
  res.json(r);
});

router.put('/:id', (req, res) => {
  const updated = store.resumes.update(req.params.id, {
    extracted_skills: req.body.extracted_skills,
    candidate_name: req.body.candidate_name,
  });
  if (!updated) return res.status(404).json({ error: 'Resume not found' });
  res.json({ ...updated, raw_text: undefined });
});

router.delete('/:id', (req, res) => {
  const ok = store.resumes.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Resume not found' });
  res.json({ deleted: true, id: req.params.id });
});

module.exports = router;
