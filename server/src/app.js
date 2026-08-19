/**
 * app.js — Express server
 *
 * Startup pe corpus.warmup() chalta hai: saare records embed hote hain
 * (ya cache se aate hain) aur drift profiles ban jaate hain. Server tabhi
 * listen karta hai jab ye ho jaaye — warna pehli request pe embeddings
 * missing milti aur retrieval khaali results deta.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const store = require('./store');
const corpus = require('./services/corpus.service');
const { provider: embedProvider } = require('./services/embedding.service');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Request log — demo ke waqt terminal mein dikhta hai ki UI kya call kar raha hai
app.use((req, _res, next) => {
  if (!req.path.startsWith('/api/health')) console.log(`${req.method} ${req.path}`);
  next();
});


app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    ready: corpus.isReady(),
    corpusSize: store.experiences.all().length,
    embeddingProvider: embedProvider,
  });
});

app.use('/api/experiences', require('./routes/experiences.routes'));
app.use('/api/retrieve', require('./routes/retrieve.routes'));
app.use('/api/corpus', require('./routes/corpus.routes'));
app.use('/api/resumes', require('./routes/resumes.routes'));
app.use('/api/analyze', require('./routes/analyze.routes'));
app.use('/api/ingest', require('./routes/ingest.routes'));

// Saved prep plans (CRUD)
app.get('/api/plans', (_req, res) => res.json(store.plans.list()));
app.get('/api/plans/:id', (req, res) => {
  const p = store.plans.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Plan not found' });
  res.json(p);
});
app.delete('/api/plans/:id', (req, res) => {
  const ok = store.plans.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Plan not found' });
  res.json({ deleted: true, id: req.params.id });
});


// 404 — koi route match nahi hua
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler. Express ise tabhi pehchanta hai jab 4 arguments hon,
// isliye _next unused hone ke baad bhi rakhna zaroori hai.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});


const PORT = process.env.PORT || 4000;

const { initScheduler } = require('./services/scheduler.service');

// require.main === module → ye file seedha chalayi gayi hai (node src/app.js).
// Agar koi test file ise import kare toh server auto-start nahi hoga.
if (require.main === module) {
  corpus.warmup()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`\n  PrepGrounded API  →  http://localhost:${PORT}`);
        console.log(`  embeddings: ${embedProvider}`);
        console.log(`  try: curl localhost:${PORT}/api/corpus/health\n`);
        initScheduler();
      });
    })
    .catch(err => {
      console.error('Startup failed:', err);
      process.exit(1);
    });
}

module.exports = app;
