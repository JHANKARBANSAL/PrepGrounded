/**
 * resume.service.js — PDF → text → skills
 *
 * HYBRID EXTRACTION (jaan-boojh kar):
 *   1. Keyword matcher — fast, free, kabhi hallucinate nahi karta,
 *      offline chalta hai
 *   2. LLM pass — wo cheezein pakadta hai jo keywords miss karte hain
 *      ("built a routing engine with Dijkstra" → Graphs)
 *
 * LLM ka output vocabulary se INTERSECT hota hai — model naya skill
 * invent nahi kar sakta. Yahi constraint downstream gap analysis ko
 * grounded rakhta hai.
 */

const { completeJson } = require('./llm.service');

const TAXONOMY = [
  'DP', 'Arrays', 'Strings', 'Graphs', 'Trees', 'LinkedList', 'Recursion',
  'Greedy', 'SlidingWindow', 'BinarySearch', 'OOPs', 'DBMS', 'OS',
  'Networks', 'SystemDesign', 'Aptitude', 'Behavioral', 'Projects',
];

// Resume mein log topic ka naam nahi likhte — wo tool/technique likhte hain.
// Ye mapping usko canonical topic pe le aati hai.
const KEYWORD_MAP = {
  DP: ['dynamic programming', 'memoization', 'memoisation', 'tabulation', 'knapsack'],
  Arrays: ['array', 'arrays', 'two pointer', 'prefix sum', 'subarray'],
  Strings: ['string manipulation', 'strings', 'palindrome', 'anagram', 'regex'],
  Graphs: ['graph', 'graphs', 'dijkstra', 'bfs', 'dfs', 'topological', 'shortest path', 'union find'],
  Trees: ['binary tree', 'binary search tree', 'bst', 'trie', 'segment tree', 'heap'],
  LinkedList: ['linked list', 'linkedlist'],
  Recursion: ['recursion', 'backtracking', 'n-queens'],
  Greedy: ['greedy'],
  SlidingWindow: ['sliding window'],
  BinarySearch: ['binary search'],
  OOPs: ['oop', 'oops', 'object oriented', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction'],
  DBMS: ['dbms', 'sql', 'mysql', 'postgres', 'postgresql', 'mongodb', 'database', 'normalization', 'indexing'],
  OS: ['operating system', 'multithreading', 'concurrency', 'deadlock', 'process scheduling', 'mutex'],
  Networks: ['computer networks', 'tcp', 'http', 'rest api', 'socket', 'osi'],
  SystemDesign: ['system design', 'microservice', 'microservices', 'scalab', 'load balanc', 'caching', 'distributed', 'kafka', 'redis', 'docker', 'kubernetes'],
  Aptitude: ['aptitude', 'quantitative'],
  Behavioral: ['leadership', 'team lead', 'mentor', 'volunteer', 'club', 'coordinator'],
  Projects: ['project', 'built', 'developed', 'implemented', 'deployed'],
};


function keywordExtract(text) {
  const lower = String(text).toLowerCase();
  const found = new Set();
  const evidence = {};

  for (const [topic, keys] of Object.entries(KEYWORD_MAP)) {
    for (const k of keys) {
      const idx = lower.indexOf(k);
      if (idx !== -1) {
        found.add(topic);
        // Aas-paas ka text bacha lo — UI mein "ye skill kahan se aayi"
        // dikhane ke liye. Isse extraction verifiable ban jaati hai.
        if (!evidence[topic]) {
          evidence[topic] = text
            .slice(Math.max(0, idx - 40), idx + k.length + 40)
            .replace(/\s+/g, ' ').trim();
        }
        break;   // ek keyword mil gaya, is topic ke liye kaafi
      }
    }
  }
  return { skills: [...found], evidence };
}


const RESUME_PROMPT = (text) => `
You are parsing a student resume for placement preparation.

Return ONLY raw JSON:
{
  "name": string|null,
  "skills": string[],
  "projects": [{"title": string, "tech": string[], "summary": string}],
  "experience_years": number
}

STRICT RULES:
- "skills" MUST only contain values from: ${JSON.stringify(TAXONOMY)}
- Map what you read onto that list. "built a routing engine with Dijkstra" -> "Graphs".
  "Spring Boot microservices" -> "SystemDesign".
- Do NOT invent skills the resume gives no evidence for.
- If unsure, omit. Precision matters more than recall here.

RESUME TEXT:
"""
${String(text).slice(0, 12000)}
"""`;


async function extractFromText(rawText) {
  const kw = keywordExtract(rawText);
  const llm = await completeJson(RESUME_PROMPT(rawText));

  let skills = kw.skills;
  let projects = [];
  let name = null;

  if (llm) {
    // INTERSECT with taxonomy — model vocabulary widen nahi kar sakta
    const llmSkills = (llm.skills || []).filter(s => TAXONOMY.includes(s));
    skills = [...new Set([...kw.skills, ...llmSkills])];
    projects = Array.isArray(llm.projects) ? llm.projects.slice(0, 6) : [];
    name = llm.name || null;
  }

  return {
    name,
    skills,
    projects,
    evidence: kw.evidence,
    extractionMethod: llm ? 'hybrid_keyword_plus_llm' : 'keyword_only',
    rawLength: rawText.length,
  };
}


async function parsePdf(buffer) {
  let text = '';
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    text = data.text || '';
  } catch (err) {
    throw new Error(`PDF parsing failed: ${err.message}. POST plain text to /api/resumes/text instead.`);
  }

  // Scanned resume (image PDF) se text nahi nikalta. OCR support nahi hai —
  // silently khaali record banane se behtar hai clear error dena.
  if (!text.trim()) {
    throw new Error('No text found in PDF — it may be a scanned image. OCR is not supported.');
  }
  return text;
}


module.exports = { extractFromText, parsePdf, keywordExtract, TAXONOMY };
