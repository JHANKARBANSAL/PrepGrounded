# PrepGrounded

**Evidence-grounded placement readiness engine.** Real interview experiences pe
grounded RAG system jo batata hai ki ek company ne *pichhle kuch saal mein actually
kya poocha*, aapke resume ke against aapka gap kya hai, aur har claim ka source kya hai.

---

## Problem

Placement prep karte waqt student ke paas information ki kami nahi hai — usko sort
karne ka tareeka nahi hai. Public archives pe ek company ke sainkdon interview
experiences hain, par:

1. **Temporally undifferentiated** — 2018 aur 2025 ke experiences ek hi list mein,
   jabki hiring process har 1–2 saal mein badalta hai
2. **Statistically opaque** — "kaunsa topic kitni baar aaya" ye number kahin nahi milta
3. **Impersonal** — koi archive nahi batata ki *is* student ka gap kya hai

Maujooda AI tools ye gap isliye nahi bharte kyunki wo **job descriptions** pe operate
karte hain, real interview outcomes pe nahi.

---

## Contribution

| # | Kya | Kahan |
|---|---|---|
| 1 | **Temporal-decay retrieval** — recency ek explicit ranking signal | `retrieval.service.js` |
| 2 | **Outcome-conditioned retrieval** — selected/rejected alag weight *(prior work mein nahi hai)* | `retrieval.service.js` |
| 3 | **Per-company adaptive λ** — decay rate data se derived, hardcode nahi | `drift.service.js` |
| 4 | **Grounding contract** — generation ke baad code se citations verify | `planner.service.js` |

**Scoring:**
```
final = 0.60 × cosine_similarity
      + 0.30 × e^(-λ_company × age_in_years)
      + 0.10 × outcome_weight
```

---

## Results

Deta hai `eval/RESULTS.md` aur `eval/ABLATION.md` (dono scripts se generate hote hain).

**Retrieval metrics** — 20 queries, k=10, 139 real records:

| Mode | Avg age | Freshness@10 | Staleness@10 |
|---|---|---|---|
| baseline (cosine only) | 3.82y | 32.0% | 38.4% |
| fixed λ | 2.27y | **61.6%** | **15.7%** |
| adaptive λ | 2.34y | 60.5% | 18.0% |

**Temporal holdout prediction** — train ≤2023, test >2023, Topic Hit Rate@5:

| Mode | Score |
|---|---|
| baseline | 0.600 |
| fixed λ | **0.640** (+7%) |
| adaptive λ | 0.640 |

> Holdout metric circular nahi hai — system ne 2024–26 ke records dekhe hi nahi.
> **Par gain 5 mein se sirf 1 company se aa raha hai.** Direction hypothesis ko
> support karta hai; magnitude use establish nahi karta. Details `eval/RESULTS.md` mein.

**λ ablation** — ek non-obvious finding:

Freshness λ ke saath **monotonic nahi** hai. λ=0.35 pe peak karke *girti* hai.
Wajah: bahut zyada λ pe `e^(-λ·age)` har record ke liye ~0 ho jaata hai, toh recency
term differentiate karna band kar deta hai aur ranking wapas similarity pe chali
jaati hai. **Over-decaying se recency signal khud mit jaata hai.**

---

## ⚠️ Honest limitations

Ye section jaan-boojh kar README mein upar hai, appendix mein nahi.

1. **Adaptive λ is corpus pe validated NAHI hai.** Measured drift sample size ke saath
   *ulta* correlate karta hai (Accenture 1.3 rec/yr → drift 0.374; TCS 2.0 rec/yr →
   drift 0.209). ~2–3 records per company-year pe metric drift nahi, **sample size**
   naap raha hai. Mechanism implemented hai; corpus abhi utna dense nahi hai.
   Estimated threshold: ~10 records/company-year. `data/DATA_README.md` dekho.

2. **Selection bias.** 139 mein se 94 records "selected" report karte hain (68%) —
   asli selection rate isse bahut kam hoti hai. Saare percentages *reported*
   interviews ke hain, saare interviews ke nahi.

3. **Small corpus.** 139 records, 25 companies. Holdout evaluation sirf 5 companies pe.

4. **Extraction accuracy abhi audit pending hai** — `eval/audit_sample.js` se worksheet
   banti hai, manually bharni padti hai.

---

## Setup

```bash
# Backend
cd server && npm install && npm start          # → localhost:4000

# Frontend (doosra terminal)
cd client && npm install && npm run dev        # → localhost:5173
```

Bina kisi API key ke chalta hai (`EMBEDDING_PROVIDER=local`, `LLM_PROVIDER=mock`).
Real embeddings/generation ke liye `server/.env` mein `GEMINI_API_KEY` daalo.

---

## Architecture

```
data/experiences.json          139 real records, 7 sources, 2018–2026
        │
        ▼
corpus.service    embed (cached) + drift profiles compute
        │
        ├──► aggregation.service   counting, gap analysis     ❌ RAG nahi
        │
        └──► RAG pipeline:
             embedding.service     query → vector             🔴 R
             retrieval.service     top-k, custom scoring      🔴 R  ⭐ novelty
             planner.service       records → prompt           🔴 A
             llm.service           generate + sanitize        🔴 G
```

**Design rule:** LLM sirf do kaam karta hai — text ko structure karna, aur structure
ko text banana. Beech ka saara sochna (counting, comparing, ranking) plain code karta
hai. `node eval/rag_trace.js` chalao, ye live trace dikhata hai.

---

## Scripts

| Command | Kya karta hai |
|---|---|
| `node data/check.js` | corpus schema + vocabulary validate |
| `node eval/unit_tests.js` | 50 unit tests — counting, decay, JSD, sanitizer |
| `node eval/checkpoint_layer1.js` | embedding sanity + baseline vs custom |
| `node eval/checkpoint_layer2.js` | CRUD write path (18 tests) |
| `node eval/checkpoint_layer3.js` | intelligence layer (27 tests) |
| `node eval/run_eval.js` | full evaluation → `eval/RESULTS.md` |
| `node eval/ablation.js` | λ sweep → `eval/ABLATION.md` |
| `node eval/holdout_test.js` | non-circular prediction test |
| `node eval/rag_trace.js` | RAG pipeline ka step-by-step trace |
| `node eval/audit_sample.js` | 20-record extraction audit worksheet banao |
| `node eval/audit_score.js` | audit se precision/recall nikaalo |

---

## Data

139 real records, **zero synthetic**. Sources: GeeksforGeeks (80), LeetCode Discuss (22),
Medium (19), PrepInsta (14), + 4 others. Years 2018–2026, 25 companies.

Collection methodology aur limitations: `data/DATA_METHODOLOGY.md`, `data/DATA_README.md`.

---

## Future work

- **Live ingestion** (`docs/PrepGrounded_Layer7_Live_Ingestion.md`) — scheduled scraper
  jo corpus badhata rahe. Isse density threshold cross hoga aur adaptive λ apne aap
  valid ho jaayega, koi code change ke bina.
- **Exhaustive crawl** discovery ke liye — abhi search-based hai, jisme search-ranking
  bias hai.
- **pgvector migration** — abhi JSON + in-memory cosine. 139 records pe ye sub-millisecond
  hai; storage layer isolated hai (`store/index.js`) toh migration single-file change hai.

---

## Reference

Grofsky, M. (2026). *Freshness and the Limits of Heuristic Trend Detection in Temporal
RAG.* arXiv:2509.19376 — fixed half-life priors ki parameter-sensitivity, jo is project
ke adaptive-λ approach ki motivation hai.
