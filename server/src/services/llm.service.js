/**
 * llm.service.js
 * ------------------------------------------------------------------
 * Provider-agnostic LLM wrapper with a deterministic fallback.
 *
 * Providers: "gemini" | "groq" | "openai" | "mock"
 *
 * The "mock" provider is not a toy — it is DEMO INSURANCE. If the venue
 * wifi dies or you hit a rate limit five minutes before your demo, the
 * whole app still runs end to end on template-based generation. Set
 * LLM_PROVIDER=mock and nothing breaks.
 * ------------------------------------------------------------------
 */

const PROVIDER = process.env.LLM_PROVIDER || 'mock';

async function callGemini(prompt, { json = false } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGroq(prompt, { json = false } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY missing');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenAI(prompt, { json = false } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Strip markdown fences and parse JSON. LLMs wrap JSON in ```json fences
 * roughly half the time regardless of instructions, so never JSON.parse
 * raw model output directly.
 */
function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.search(/[[{]/);
  if (start > 0) t = t.slice(start);
  const lastBrace = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (lastBrace !== -1) t = t.slice(0, lastBrace + 1);
  try { return JSON.parse(t); } catch { return null; }
}

async function complete(prompt, opts = {}) {
  switch (PROVIDER) {
    case 'gemini': return callGemini(prompt, opts);
    case 'groq': return callGroq(prompt, opts);
    case 'openai': return callOpenAI(prompt, opts);
    default: return null;   // mock — caller falls back to template output
  }
}

/**
 * Ask for JSON, retry once with the parse error fed back in.
 * Returns null in mock mode so callers use their deterministic fallback.
 */
async function completeJson(prompt, { retries = 1 } = {}) {
  if (PROVIDER === 'mock') return null;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const suffix = attempt === 0 ? '' :
        `\n\nYour previous reply could not be parsed as JSON (${lastErr}). Reply with RAW JSON only — no prose, no markdown fences.`;
      const text = await complete(prompt + suffix, { json: true });
      const parsed = parseJsonLoose(text);
      if (parsed) return parsed;
      lastErr = 'unparseable output';
    } catch (err) {
      lastErr = err.message;
    }
  }
  console.warn('[llm] falling back to deterministic output:', lastErr);
  return null;
}

module.exports = { complete, completeJson, parseJsonLoose, provider: PROVIDER };
