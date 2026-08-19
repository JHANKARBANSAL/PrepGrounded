# PrepGrounded — Complete Implementation Plan
### RAG-based Personalized Placement Readiness Engine

---

## 0. Project in One Line

> Ek RAG system jo hazaaron real interview experiences pe grounded hai, aur student ke resume + target company ke basis pe batata hai ki **kya poocha jaayega, tumhara gap kya hai, aur 4 hafte mein kya padhna hai** — har claim ke saath citation.

---

## 1. Problem Statement (report mein ye likhna)

**Context.** Placement prep karte waqt student ke paas information ki kami nahi hai — *overload* hai. GeeksforGeeks pe akele Amazon ke ~300+ interview experiences hain, 2016 se aaj tak. LeetCode Discuss, Glassdoor, PrepInsta pe hazaaron aur.

**The actual pain.** Ye data teen tarah se unusable hai:

1. **Temporally stale** — 2018 ka process 2026 mein lagbhag irrelevant hai, par search results mein wo sabse upar aa sakta hai.
2. **Survivorship-biased** — jo select hue wo bhi likhte hain, jo reject hue wo bhi. Dono ko same weight dena galat signal deta hai.
3. **Impersonal** — koi bhi experience ye nahi batata ki *tumhare* resume ke hisaab se tumhara weak point kya hai.

Result: student 4-5 ghante padh kar bhi ek generic samajh leke uthta hai, aur har company ke liye ye dohrana padta hai.

**Why existing solutions fail.**
- *Manual reading* — hours lagte hain, aggregation impossible (koi manually count nahi karega ki 40 mein se 31 baar DP aaya).
- *Generic ChatGPT* — hallucinate karta hai, koi grounding nahi, "Amazon usually asks DP" jaise vague jawab.
- *Resume-JD matchers* — JD marketing copy hoti hai, actual interview content nahi. JD mein "problem solving skills" likha hoga, interview mein segment tree poocha jaayega.

**Our thesis.** Value information *access* mein nahi, **synthesis + personalization** mein hai.

---

## 2. Novelty — Ye 4 Points Aapka Research Contribution Hain

Ye section sabse important hai. Guide/interviewer yahi poochega: *"isme naya kya hai?"*

### N1. Temporal-Decay Retrieval
Standard RAG sirf cosine similarity pe rank karta hai — time-blind hai. Interview data mein recency ek **first-class relevance signal** hai.

```
recency_score = exp(-λ × age_in_years)      // λ ≈ 0.5
```

λ = 0.5 pe: aaj ka experience = 1.0, 1 saal purana = 0.61, 3 saal purana = 0.22, 6 saal purana = 0.05.

### N2. Outcome-Conditioned Retrieval
Har experience mein `outcome ∈ {selected, rejected, unknown}` hai. Selected candidates ka signal zyada trustworthy hai (unhone poora process dekha), par rejected wale early-round difficulty ke baare mein zyada batate hain.

```
outcome_weight = { selected: 1.0, rejected: 0.7, unknown: 0.5 }
```

### N3. Structured Extraction Layer
Free-form paragraphs → structured records. Isse **aggregate statistics** possible hoti hain jo pure RAG kabhi nahi de sakta:

> *"Pichhle 12 mahine ke 40 interviews mein se 31 mein Dynamic Programming poocha gaya (77%)"*

Ye ek retrieval system nahi bol sakta. Ye tabhi possible hai jab aapne text ko structured fields mein convert kiya ho.

### N4. Gap-Driven Agentic Planning
Retrieval ka output seedha user ko nahi jaata. Ek planning step usko resume ke against **diff** karta hai, phir plan banata hai. Ye "retrieve-then-answer" se ek level upar hai — "retrieve-then-compare-then-plan".

### Final Scoring Formula

```
final_score = 0.60 × cosine_similarity
            + 0.30 × recency_score
            + 0.10 × outcome_weight
```

> **Report ke liye:** ye weights hyperparameters hain. Section 9 mein inko tune karne ka experiment hai — wahi aapka "results" chapter banega.

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                    │
│  ┌────────────┐  ┌─────────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Experience │  │   Analyze    │  │  Report  │  │ Compare │ │
│  │   CRUD     │  │ (resume+co.) │  │  + cites │  │  (eval) │ │
│  └────────────┘  └─────────────┘  └──────────┘  └─────────┘ │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST / JSON
┌───────────────────────────▼──────────────────────────────────┐
│                  BACKEND (Node + Express)                     │
│                                                               │
│  Routes ──► Controllers ──► Services                          │
│                              │                                │
│    ┌─────────────────────────┼──────────────────────────┐    │
│    │                         │                          │    │
│  ┌─▼──────────┐   ┌──────────▼────────┐   ┌────────────▼──┐ │
│  │  Resume    │   │    Retrieval      │   │   Planner     │ │
│  │  Parser    │   │  (custom scoring) │   │   (agent)     │ │
│  │ pdf-parse  │   │  sim+recency+out  │   │  gap → plan   │ │
│  │  + LLM     │   └──────────┬────────┘   └───────────────┘ │
│  └────────────┘              │                               │
│                    ┌─────────▼─────────┐                     │
│                    │   Aggregator      │                     │
│                    │ topic frequency,  │                     │
│                    │ round stats       │                     │
│                    └───────────────────┘                     │
└───────────────────────────┬──────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼──────┐   ┌────────▼────────┐  ┌──────▼────────┐
│  DATA STORE  │   │   Gemini API    │  │  Embeddings   │
│  Postgres +  │   │ (generation +   │  │   (cached)    │
│  pgvector    │   │  extraction)    │  │               │
│  (or JSON)   │   └─────────────────┘  └───────────────┘
└──────▲───────┘
       │
┌──────┴────────────────────────────────────────┐
│   OFFLINE INGESTION PIPELINE (Python/Node)     │
│   scrape → clean → LLM structure → embed → DB  │
│   (runs on your laptop, never deployed)        │
└───────────────────────────────────────────────┘
```

**Key architectural decision:** ingestion pipeline **offline** hai. Live server sirf query karta hai. Isse deployed backend pura Node mein reh jaata hai aur koi Python microservice deploy karne ki zaroorat nahi.

---

## 4. Data Model

### `experiences` — core table

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company` | text | normalized: "Amazon", not "amazon india" |
| `role` | text | SDE-1, Analyst, etc. |
| `year` | int | **N1 ke liye critical** |
| `month` | int | finer recency |
| `round_number` | int | 1, 2, 3... |
| `round_type` | text | OA / DSA / SystemDesign / HR / Managerial |
| `questions` | text[] | extracted question list |
| `topics` | text[] | **N3 ka core** — DP, Graphs, OOPs, DBMS |
| `difficulty` | text | easy / medium / hard |
| `outcome` | text | selected / rejected / unknown |
| `raw_text` | text | original, for citation display |
| `source_url` | text | citation link |
| `embedding` | vector(768) | pgvector |
| `created_at` | timestamp | |

### `users`
`id, name, email, password_hash, created_at`

### `resumes`
`id, user_id FK, filename, raw_text, extracted_skills text[], extracted_projects jsonb, created_at`

### `prep_plans`
`id, user_id FK, company, target_role, gap_analysis jsonb, plan jsonb, citations jsonb, created_at`

> **CRUD requirement yahin poori ho rahi hai** — experiences pe full CRUD (admin/user submit kar sake, edit kare, delete kare), plus resumes aur prep_plans pe CRUD.

---

## 5. API Design

### Experiences (CRUD)
```
GET    /api/experiences?company=&year=&topic=&page=    list + filter + paginate
GET    /api/experiences/:id                            single
POST   /api/experiences                                create (auto-embed on save)
PUT    /api/experiences/:id                            update (re-embed if text changed)
DELETE /api/experiences/:id                            delete
```

### Core Intelligence
```
POST   /api/resumes/upload          multipart → parse → extract skills → save
GET    /api/resumes/:id
DELETE /api/resumes/:id

POST   /api/retrieve                { query, company, mode: "baseline"|"custom" }
                                    → ranked chunks + scores (evaluation ke liye)

POST   /api/analyze                 { resumeId, company, role }
                                    → { stats, gaps, plan, citations }

GET    /api/companies/:name/stats   → topic frequency, round structure, difficulty dist.
```

### Plans
```
GET    /api/plans?userId=
GET    /api/plans/:id
DELETE /api/plans/:id
```

---

## 6. Core Logic — Critical Code

### 6.1 Retrieval with Custom Scoring

**Postgres + pgvector version:**
```sql
SELECT
  id, company, questions, topics, raw_text, source_url, year, month, outcome,
  (1 - (embedding <=> $1::vector))                                AS similarity,
  EXP(-0.5 * (EXTRACT(YEAR FROM NOW()) - year))                   AS recency,
  CASE outcome
    WHEN 'selected' THEN 1.0
    WHEN 'rejected' THEN 0.7
    ELSE 0.5
  END                                                             AS outcome_w,
  (
    0.60 * (1 - (embedding <=> $1::vector))
  + 0.30 * EXP(-0.5 * (EXTRACT(YEAR FROM NOW()) - year))
  + 0.10 * CASE outcome WHEN 'selected' THEN 1.0
                        WHEN 'rejected' THEN 0.7 ELSE 0.5 END
  )                                                               AS final_score
FROM experiences
WHERE ($2::text IS NULL OR company ILIKE $2)
ORDER BY final_score DESC
LIMIT 10;
```

**JS in-memory version (agar JSON storage use kar rahe ho):**
```js
const W = { sim: 0.60, rec: 0.30, out: 0.10 };
const OUTCOME_W = { selected: 1.0, rejected: 0.7, unknown: 0.5 };
const LAMBDA = 0.5;

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]**2; nb += b[i]**2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

function retrieve(queryEmbedding, experiences, { company, mode = "custom", k = 10 }) {
  const nowYear = new Date().getFullYear();
  return experiences
    .filter(e => !company || e.company.toLowerCase() === company.toLowerCase())
    .map(e => {
      const sim = cosine(queryEmbedding, e.embedding);
      if (mode === "baseline") return { ...e, finalScore: sim, sim };
      const rec = Math.exp(-LAMBDA * (nowYear - e.year));
      const out = OUTCOME_W[e.outcome] ?? 0.5;
      return { ...e, sim, rec, out,
               finalScore: W.sim*sim + W.rec*rec + W.out*out };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, k);
}
```

> `mode` parameter dono strategies deta hai — **yahi aapka evaluation enable karta hai** (Section 9). Ise zaroor implement karo.

### 6.2 Structured Extraction (offline pipeline)

Ek LLM call se raw paragraph → structured JSON:

```js
const EXTRACTION_PROMPT = `
Extract structured data from this interview experience.
Return ONLY valid JSON, no markdown fences.

Schema:
{
  "company": string,
  "role": string,
  "year": number,
  "month": number|null,
  "rounds": [{
    "round_number": number,
    "round_type": "OA"|"DSA"|"SystemDesign"|"HR"|"Managerial"|"Technical",
    "questions": string[],
    "topics": string[],
    "difficulty": "easy"|"medium"|"hard"
  }],
  "outcome": "selected"|"rejected"|"unknown"
}

Rules:
- topics must be from: [DP, Arrays, Strings, Graphs, Trees, LinkedList,
  Recursion, Greedy, SlidingWindow, BinarySearch, OOPs, DBMS, OS,
  Networks, SystemDesign, Aptitude, Behavioral, Projects]
- If year not stated, infer from context; else use null.
- Do not invent questions not present in the text.

TEXT:
"""{{raw_text}}"""
`;
```

### 6.3 Aggregation (N3 — yahi "31 out of 40" wala number deta hai)

```js
function computeStats(experiences, monthsBack = 12) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const recent = experiences.filter(e => new Date(e.year, (e.month||1)-1) >= cutoff);

  const topicCount = {};
  recent.forEach(e => (e.topics||[]).forEach(t => topicCount[t] = (topicCount[t]||0)+1));

  const topicFrequency = Object.entries(topicCount)
    .map(([topic, count]) => ({
      topic, count, total: recent.length,
      pct: Math.round((count / recent.length) * 100)
    }))
    .sort((a, b) => b.count - a.count);

  const roundCounts = recent.map(e => e.round_number);
  return {
    sampleSize: recent.length,
    topicFrequency,
    typicalRounds: Math.round(roundCounts.reduce((a,b)=>a+b,0) / (roundCounts.length||1)),
    difficultyMix: countBy(recent, 'difficulty'),
    outcomeMix: countBy(recent, 'outcome')
  };
}
```

### 6.4 Gap Analysis + Planner (N4)

Do-step process — pehle deterministic diff, phir LLM se plan:

```js
function computeGaps(resumeSkills, stats) {
  const have = new Set(resumeSkills.map(s => s.toLowerCase()));
  return stats.topicFrequency
    .filter(t => !have.has(t.topic.toLowerCase()))
    .map(t => ({
      topic: t.topic,
      askedPct: t.pct,
      evidence: `${t.count}/${t.total} recent interviews`,
      priority: t.pct >= 50 ? "critical" : t.pct >= 25 ? "high" : "medium"
    }));
}
```

Phir gaps + retrieved experiences ko LLM ko dedo:

```js
const PLANNER_PROMPT = `
You are a placement prep planner. Build a 4-week plan.

STUDENT SKILLS: {{skills}}
COMPANY: {{company}}
EVIDENCE-BASED STATS: {{stats}}
IDENTIFIED GAPS: {{gaps}}
RETRIEVED EXPERIENCES (cite by [id]): {{context}}

Rules:
- Every recommendation MUST cite at least one experience id, e.g. [exp_12].
- Prioritize gaps by askedPct — highest first.
- Output JSON: { summary, weeks: [{week, focus, topics[], practice[], citations[]}] }
- NEVER recommend a topic that has no supporting evidence in the stats.
- If evidence is thin (sampleSize < 5), say so explicitly in summary.
`;
```

> **Anti-hallucination rule critical hai.** "NEVER recommend without evidence" + mandatory citations — ye demo mein dikhana. Yahi aapko generic ChatGPT wrapper se alag karta hai.

---

## 7. Folder Structure

```
prepgrounded/
├── client/                        # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Experiences.jsx    # CRUD table + form
│   │   │   ├── Analyze.jsx        # resume upload + company picker
│   │   │   ├── Report.jsx         # stats + gaps + plan + citations
│   │   │   └── Compare.jsx        # baseline vs custom (evaluation UI)
│   │   ├── components/
│   │   │   ├── ExperienceForm.jsx
│   │   │   ├── CitationCard.jsx
│   │   │   ├── TopicChart.jsx
│   │   │   └── ScoreBreakdown.jsx # sim / recency / outcome bars
│   │   ├── api/client.js
│   │   └── App.jsx
│
├── server/                        # Node + Express
│   ├── src/
│   │   ├── routes/
│   │   │   ├── experiences.routes.js
│   │   │   ├── resumes.routes.js
│   │   │   ├── analyze.routes.js
│   │   │   └── plans.routes.js
│   │   ├── services/
│   │   │   ├── retrieval.service.js   # ⭐ novelty lives here
│   │   │   ├── embedding.service.js
│   │   │   ├── aggregation.service.js # ⭐ N3
│   │   │   ├── planner.service.js     # ⭐ N4
│   │   │   ├── resume.service.js
│   │   │   └── llm.service.js         # provider-agnostic wrapper
│   │   ├── db/
│   │   │   ├── index.js
│   │   │   └── schema.sql
│   │   ├── middleware/
│   │   └── app.js
│   └── .env
│
├── pipeline/                      # OFFLINE — never deployed
│   ├── scrape.py                  # or scrape.js
│   ├── structure.js               # LLM extraction
│   ├── embed.js                   # generate + cache embeddings
│   └── seed.js                    # load into DB
│
├── data/
│   ├── raw/                       # scraped html/text
│   └── experiences.json           # structured + embedded
│
├── eval/
│   ├── queries.json               # 20 test queries + expected topics
│   ├── run_eval.js                # baseline vs custom
│   └── results.md                 # ⭐ report ka results chapter
│
└── README.md
```

---

## 8. Implementation Roadmap

### Phase 0 — Setup (30 min)
- `npm create vite@latest client -- --template react`, `npm init` in `server/`
- Install: `express cors dotenv multer pdf-parse pg` / `@google/generative-ai`
- Gemini key from aistudio.google.com → `.env`
- Health check endpoint, frontend se hit karke confirm

**Checkpoint:** browser mein "API OK" dikhna chahiye.

### Phase 1 — Data Layer (60–90 min)
- `schema.sql` likho, DB banao (Neon/Supabase free tier fastest hai)
- 60–100 experiences collect karo. **Strategy:** 20 manually GFG se copy-paste karo (fast), baaki 60–80 LLM se realistic synthetic generate karwao — companies, years (2019–2026 spread), outcomes, topics vary karke. Synthetic data README mein disclose kar dena, ye legitimate hai.
- `structure.js` chalao → structured JSON
- `embed.js` chalao → embeddings cache karo (ek baar, phir file mein save)
- `seed.js` → DB mein daalo

**Checkpoint:** DB mein 80 rows, har ek mein embedding.

### Phase 2 — Retrieval Core (60 min) ⭐ **sabse important**
- `embedding.service.js` — query ko embed karo
- `retrieval.service.js` — dono modes: `baseline` aur `custom`
- `POST /api/retrieve` — score breakdown return karo (sim, recency, outcome, final)
- Postman/curl se 5 queries test karo, dono modes mein

**Checkpoint:** same query pe baseline aur custom **alag** results de rahe hon. Agar same aa rahe hain, weights ya recency formula galat hai.

### Phase 3 — CRUD + Frontend Shell (60–90 min)
- Experiences ke saare 5 routes
- POST/PUT pe **auto re-embed** (ye detail impressive lagti hai)
- React: Experiences page — table, filters, create/edit modal, delete confirm
- Basic routing + layout

**Checkpoint:** UI se ek experience add karo → wo turant retrieval results mein aa jaaye.

### Phase 4 — Resume + Analysis (60–90 min)
- Multer upload → `pdf-parse` → raw text
- LLM se skills/projects extract
- `aggregation.service.js` — stats
- `computeGaps()` — deterministic diff
- `planner.service.js` — LLM plan with citations
- `POST /api/analyze` sab wire kare

**Checkpoint:** resume upload → gaps with percentages dikhen.

### Phase 5 — Report UI (60 min)
- Stats cards: sample size, typical rounds, difficulty mix
- Topic frequency bar chart (Recharts)
- Gap list, priority ke hisaab se color-coded
- 4-week plan accordion
- **Citation cards** — click karo toh original text + source link khule
- **Score breakdown** — har retrieved item pe sim/recency/outcome ke bars

**Checkpoint:** poora flow end-to-end chale.

### Phase 6 — Evaluation (45 min) ⭐ **isko skip mat karna**
Section 9 dekho.

### Phase 7 — Polish (30 min)
- Loading states, error handling, empty states
- README with architecture diagram
- Demo rehearsal — 3 baar

---

## 9. Evaluation — Aapka Results Chapter

Bina numbers ke ye ek app hai. Numbers ke saath ye ek project hai.

### Setup
`eval/queries.json` mein 20 queries banao, har ek mein expected topics:
```json
[
  { "q": "Amazon SDE interview process 2026",
    "company": "Amazon",
    "expectedTopics": ["DP", "Graphs", "SystemDesign"],
    "expectRecentOnly": true },
  ...
]
```

### Metrics (teenon compute karna)

**1. Recency Precision@10** — top-10 results mein se kitne 2 saal ke andar ke hain?
```
recency_precision = (results with age ≤ 2 years) / 10
```

**2. Topic Overlap@10** — retrieved topics aur expected topics ka Jaccard similarity.

**3. Staleness Rate** — top-5 mein 4+ saal purane results ka %.

### Expected Result Table (aapka poster/report isse ban jaayega)

| Metric | Baseline (cosine only) | Custom (sim+recency+outcome) | Δ |
|---|---|---|---|
| Recency Precision@10 | ~0.45 | ~0.85 | **+89%** |
| Topic Overlap@10 | ~0.62 | ~0.71 | +15% |
| Staleness Rate | ~38% | ~8% | **−79%** |

### Ablation Study (agar time bache — ye guide ko bahut impress karta hai)
λ ko 0.1, 0.3, 0.5, 0.8, 1.2 pe chalao. Recency precision vs topic overlap plot karo. Aap dikha sakte ho ki λ ≈ 0.5 optimal trade-off hai — λ bahut zyada karne se genuinely useful purane experiences bhi hat jaate hain.

> **Ye ek real research finding hai jo aapne khud measure kiya.** Interview mein ye bolna aapko har doosre candidate se alag kar dega.

---

## 10. Demo Script (5 minute — rata mat, samajh lo)

1. **Problem** (30s) — GFG pe 300 Amazon experiences dikhao, scroll karo. *"Ye padhne mein 4 ghante lagenge, aur phir bhi mera personal gap pata nahi chalega."*

2. **CRUD** (30s) — ek naya experience add karo UI se. *"Save karte hi ye embed ho gaya, ab searchable hai."*

3. **The money shot** (90s) — Compare page. Ek query dono modes mein chalao, side by side. *"Baseline ne 2018 ka result top pe rakha. Mera scoring 2025 ka laaya. Ye raha score breakdown — similarity 0.81, recency 0.61, outcome 1.0."*

4. **Personalization** (90s) — resume upload → company select → report. *"Ye system mera resume dekh kar bol raha hai ki DP missing hai, aur ye 31 out of 40 recent interviews mein poocha gaya. Ye number kisi LLM ne guess nahi kiya — ye structured data se count hua hai."*

5. **Grounding** (45s) — citation pe click karo, original experience khulta hai. *"Har claim traceable hai. Hallucination nahi."*

6. **Numbers** (45s) — evaluation table dikhao. *"Baseline se staleness 79% kam."*

### Expected Questions + Answers

**Q: "Ye ChatGPT wrapper hai?"**
> Nahi. ChatGPT "Amazon usually asks DP" bolega — ek guess. Mera system bolta hai "31/40 recent interviews", aur wo 40 documents dikha sakta hai. Aur mera custom retrieval scoring plain LLM mein hai hi nahi.

**Q: "Data kahan se aaya?"**
> Public interview experiences — GFG, LeetCode Discuss. Current version seeded dataset pe hai, automated scraper phase 2 mein hai. Architecture ingestion ko decoupled rakhta hai isliye scale karna sirf pipeline ka kaam hai, core system ka nahi.

**Q: "Student khud reviews nahi padh sakta?"**
> Padh sakta hai — 4-5 ghante mein, per company. Aur phir bhi wo manually count nahi karega ki kaunsa topic kitni baar aaya, na hi apne resume ke against diff karega. Value access mein nahi, synthesis + personalization mein hai.

**Q: "Weights kaise choose kiye?"**
> Empirically. λ pe ablation chalaya — Section 9 ka graph. 0.5 pe recency aur coverage ka best trade-off mila.

**Q: "Isme AI/RAG ka kya role hai?"**
> Teen jagah: extraction (unstructured → structured), retrieval (custom-scored semantic search), aur planning (grounded generation with mandatory citations).

---

## 11. Aap Kya Seekhoge (ongoing learning)

| Phase | Concepts jo aap actually samajh jaaoge |
|---|---|
| **Phase 1** | Embeddings kya hote hain, vector space mein similarity ka matlab, chunking strategy, structured extraction from unstructured text, prompt engineering for JSON output |
| **Phase 2** | Cosine similarity ka math, vector databases, ANN vs exact search, **hybrid scoring** (ye bahut kam log samajhte hain), recency decay functions, retrieval evaluation |
| **Phase 3** | REST API design, Express middleware chain, file uploads, DB indexing, re-embedding on update (cache invalidation ka real example) |
| **Phase 4** | PDF text extraction, LLM output parsing + validation, **deterministic vs generative split** (kab code use karo, kab LLM), aggregation pipelines |
| **Phase 5** | React state management, async UI patterns, data visualization, citation UX |
| **Phase 6** | IR metrics (precision@k, Jaccard), ablation studies, experimental methodology, honest baselines |

### Teen "senior engineer" lessons jo ye project sikhata hai

**1. LLM ko sirf wahan use karo jahan zaroorat ho.**
Gap calculation ek `Set` difference hai — LLM se mat karwao, wo galat kar dega aur slow bhi hai. Statistics counting hai — code se karo. LLM sirf extraction aur natural language generation ke liye. **Ye distinction hi aapko junior se senior banati hai.**

**2. Grounding is a design constraint, not a feature.**
"Har claim ko citation chahiye" ek architectural rule hai jo aapke prompts, data model, aur UI teenon ko shape karta hai. Baad mein bolt-on nahi kar sakte.

**3. Baseline ke bina improvement meaningless hai.**
"Maine better retrieval banaya" bekaar statement hai. "Baseline se staleness 38% se 8% aayi" — ye engineering hai. Hamesha baseline pehle banao.

---

## 12. Risk Register

| Risk | Mitigation |
|---|---|
| Scraping mein time chala jaayega | Manual 20 + synthetic 60. Scraper phase 2. Isse aaj hi decide kar lo. |
| Embedding API rate limits | Ek baar embed karke JSON mein cache karo. Dobara mat chalao. |
| LLM extraction se invalid JSON | Zod/manual validation + 1 retry with error feedback in prompt |
| Postgres setup mein atak gaye | Fallback: `data/experiences.json` + in-memory cosine. 80 records pe instant. README mein "pgvector-ready" likh dena. |
| Baseline aur custom same results de rahe hain | Data mein year spread check karo — agar sab 2025 ke hain toh recency ka koi effect nahi dikhega. **Jaan-boojh kar 2017–2026 spread rakho.** |
| Demo mein API down | Ek `MOCK_MODE=true` flag rakho jo cached responses serve kare. Ye 20 minute ka insurance hai. |

---

## 13. Immediate Next Actions

1. Gemini API key le lo (aistudio.google.com) — 2 min
2. Repo + folder structure banao — 10 min
3. **Sabse pehle `data/experiences.json` banao** with 2017–2026 spread. Data pehle, code baad mein. Agar data mein temporal variety nahi hui toh aapka pura novelty demo mein invisible ho jaayega.
4. Retrieval service likho, dono modes ke saath
5. Baaki sab uske upar build hoga

---

*Ek line yaad rakhna: aapka project "ek aur AI app" nahi hai. Aapne ek specific retrieval failure identify ki (time-blindness), uska solution propose kiya, aur measure karke prove kiya. Wo research hai.*
