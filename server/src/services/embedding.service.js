/**
 * embedding.service.js — text ko vector mein badalta hai
 *
 * Do provider, ek interface:
 *   "local"  — yahin calculate hota hai, koi API key nahi
 *   "gemini" — real semantic model, key chahiye
 *
 * Local provider kyun (viva mein ye bolna): aapka novelty SCORING FUNCTION
 * hai, embedding model nahi. Jab tak baseline aur custom dono same
 * embeddings use kar rahe hain, comparison valid hai. Local se evaluation
 * reproducible ho jaati hai aur demo ke din API down ho toh bhi sab chalta hai.
 */

const PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DIM = 256;


/* ---------------------------- LOCAL PROVIDER ---------------------------- */

/**
 * Ye shabd HAR record mein aate hain, isliye ye kuch distinguish nahi karte.
 * Inhe rakha toh har record har query se match karega — signal noise mein
 * kho jaayega. "round", "interview", "questions" — sabse zaroori hataane wale.
 */
const STOPWORDS = new Set(('a an the and or of in on for to with was were is are ' +
  'it this that there they i he she we you my me at as by from be been being had ' +
  'has have do did does not no so then than but if else when while about into out ' +
  'up down over under again further once here all any both each few more most other ' +
  'some such only own same too very can will just round rounds interview experience ' +
  'asked question questions final result company').split(' '));

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, ' ')   // + aur # rakhe — "C++" aur "C#" valid tokens hain
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * FNV-1a hash. Har machine pe, har run pe same output deta hai — isliye
 * embeddings reproducible rehte hain, jo evaluation ke liye zaroori hai.
 */
function hashToken(token) {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);   // imul isliye ki normal * bade numbers pe float ban jaata hai
  }
  return Math.abs(h);
}

function localEmbed(text) {
  const vec = new Array(DIM).fill(0);
  const tokens = tokenize(text);

  const tf = {};
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });

  for (const [token, count] of Object.entries(tf)) {
    // Sublinear TF: "DP" 10 baar aaya toh 1 baar se zyada important hai,
    // par 10 GUNA nahi. log isko dabata hai.
    const weight = 1 + Math.log(count);

    vec[hashToken(token) % DIM] += weight;

    // Doosra slot aadhe weight ke saath — hash collision ka damage kam karta hai.
    // Do words ek slot pe takra sakte hain, par dono slots pe takrana mushkil.
    vec[hashToken(token + '#2') % DIM] += weight * 0.5;
  }

  // NORMALIZATION — ye step mat chhodna.
  // Bina iske lambe records (5-round wale) har query se "similar" lagenge
  // sirf isliye ki unke numbers bade hain. Normalize ke baad sirf direction
  // matter karta hai, magnitude nahi. Classic IR mistake hai.
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}


/* ---------------------------- GEMINI PROVIDER --------------------------- */

async function geminiEmbed(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: String(text).slice(0, 8000) }] },   // API ki input limit
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embed failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.embedding.values;
}


/* ------------------------------ PUBLIC API ------------------------------ */

async function embed(text) {
  if (PROVIDER === 'gemini') {
    if (!GEMINI_KEY) throw new Error('EMBEDDING_PROVIDER=gemini but GEMINI_API_KEY is missing');
    return geminiEmbed(text);
  }
  return localEmbed(text);
}

async function embedBatch(texts, { concurrency = 5 } = {}) {
  if (PROVIDER === 'local') return texts.map(localEmbed);

  // Gemini pe 139 requests ek saath bhejoge toh rate limit lag jaayegi.
  // 5-5 ke groups mein bhejo.
  const out = new Array(texts.length);
  for (let i = 0; i < texts.length; i += concurrency) {
    const slice = texts.slice(i, i + concurrency);
    const res = await Promise.all(slice.map(t => geminiEmbed(t)));
    res.forEach((v, j) => { out[i + j] = v; });
  }
  return out;
}

/**
 * cosine(A,B) = (A · B) / (|A| × |B|)
 * Result 0 se 1 ke beech (text embeddings mein). 1 = same matlab, 0 = unrelated.
 */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;

  // Math.min — safety agar galti se alag-size vectors mix ho jaayein
  // (local 256 aur gemini 768). Crash ke bajaye partial compare karega.
  const n = Math.min(a.length, b.length);

  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }

  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;   // all-zero vector se divide-by-zero se bacho
}

module.exports = { embed, embedBatch, cosine, provider: PROVIDER, DIM };
