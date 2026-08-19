# PrepGrounded — Layered Development Plan
### 7 Layers, order mein banao. Har layer pichli layer pe depend karti hai.

---

## LAYER 0 — Data
**Goal:** corpus taiyar karna, jispe sab kuch chalega

- [ ] 40 REAL interview experiences GFG se collect (`source: "real"`)
  - Companies: 2 product (Amazon/Google) + 2 service (TCS/Infosys) — contrast zaroori
  - Years: 2017–2026 tak spread karna (temporal decay dikhne ke liye)
- [ ] 60–100 SYNTHETIC records LLM se generate (`source: "synthetic"`, volume ke liye)
- [ ] Fixed topic vocabulary decide karo (DP, Graphs, Trees, OOPs, DBMS...)
- [ ] `data/experiences.json` mein save karo — schema: company, role, year, month, rounds[], topics[], questions[], outcome, raw_text, source, source_url

**Checkpoint:** `experiences.json` mein kam se kam 6 alag saal aur 4+ companies dikhein.

**Time:** ~2 ghante (real data collection sabse zyada time lega)

---

## LAYER 1 — Embedding + Retrieval Core ⭐ (novelty yahin hai)
**Goal:** text ko vector banana + custom scoring se rank karna

- [ ] `embedding.service.js` — `embed(text)` aur `cosine(a,b)` (local hash-based, no API key chahiye)
- [ ] `retrieval.service.js` — `mode: "baseline"` (sirf cosine)
- [ ] Same file mein `mode: "fixed"` add karo — similarity + recency(λ fixed) + outcome weight
- [ ] `drift.service.js` — per-company adaptive λ (Jensen-Shannon divergence se drift measure)
- [ ] `mode: "adaptive"` — drift-based λ use kare

**Checkpoint:** ek hi query teeno modes mein chalao → baseline purane saal la raha ho, adaptive naye + company-aware results de.

**Time:** ~2-3 ghante (sabse important layer, time do)

---

## LAYER 2 — Backend + CRUD
**Goal:** Express server, storage, full CRUD

- [ ] `store/index.js` — JSON file read/write (ya Postgres agar time ho)
- [ ] `experiences.routes.js` — GET/POST/PUT/DELETE, validation, auto re-embed on write
- [ ] `app.js` — Express setup, health check route
- [ ] Corpus load hote hi saare records embed ho jayein (startup pe)

**Checkpoint:** Postman/curl se naya experience add karo → turant retrieval mein searchable ho.

**Time:** ~1.5 ghante

---

## LAYER 3 — Intelligence (Aggregation + Gap + Planner)
**Goal:** counting, gap analysis, LLM se plan — sab grounded

- [ ] `aggregation.service.js` — `computeStats()` (topic %, confidence level agar sample chhota ho)
- [ ] `computeGaps()` — resume skills vs stats ka Set difference
- [ ] `resume.service.js` — PDF parse + keyword/LLM se skill extraction (fixed vocabulary se intersect)
- [ ] `planner.service.js` — LLM prompt (grounding rules ke saath) + `sanitize()` jo fake topics/citations hataye
- [ ] `templatePlan()` — LLM ke bina bhi chale, deterministic fallback
- [ ] `analyze.routes.js` — sab jodo ek endpoint mein

**Checkpoint:** resume upload → sahi gaps aayein → plan ke har week mein valid citation ho.

**Time:** ~2 ghante

---

## LAYER 4 — Frontend
**Goal:** UI jo sab dikhaye, khaaskar Compare page

- [ ] **Experiences page** — CRUD table + filters + form
- [ ] **Analyze page** — resume upload + company dropdown + mode selector
- [ ] **Report page** — stats chart, gap list, plan accordion, citation cards
- [ ] **Compare page** ⭐ — ek query, teen columns (baseline/fixed/adaptive) side by side + drift table

**Checkpoint:** poora flow UI se end-to-end chale, bina Postman ke.

**Time:** ~2-2.5 ghante

---

## LAYER 5 — Evaluation ⭐ (Results chapter)
**Goal:** numbers nikalna jo prove karein ki improvement real hai

- [ ] `eval/queries.json` — 15-20 test queries
- [ ] `eval/run_eval.js` — temporal holdout (2024 tak dikhao, 2025-26 hide karke test karo)
- [ ] Metrics: Freshness@10, Staleness@10, Topic Hit Rate — teeno modes pe
- [ ] `eval/ablation.js` — λ ko 0.1/0.35/0.5/0.8/1.2 pe chalao, graph banao
- [ ] Real subset pe headline numbers, synthetic sirf demo ke liye — clearly label karo

**Checkpoint:** ek table ready ho: baseline vs fixed vs adaptive, teeno metrics ke saath.

**Time:** ~1 ghanta

---

## LAYER 6 — Verification + Polish + Demo
**Goal:** "sahi result hai" prove karna + demo-ready banana

- [ ] Unit tests: aggregation counting pe (chhota fake dataset se manually verify)
- [ ] Citation audit: 20 outputs manually check karo — citation claim ko support karti hai?
- [ ] Resume extraction: 15 resumes manually label karo, precision/recall nikaalo
- [ ] `LLM_PROVIDER=mock` mode test karo (demo insurance — bina API ke chale)
- [ ] README + architecture diagram
- [ ] Demo script rehearse (3 baar) — Problem → CRUD → Compare page (money shot) → Report → Evaluation numbers

**Checkpoint:** poora system offline/mock mode mein bhi crash na ho.

**Time:** ~1-1.5 ghanta

---

## Total: ~10-12 ghante (2 din mein aaram se, ya ek lambe din mein tight)

## Agar time kam pade — is order mein kaato
Kabhi mat kaato: **Layer 0, 1, 5** (data, novelty, proof)
Simplify kar sakte ho: Layer 4 (sirf Compare + Report page rakho)
Sabse pehle kaato: Layer 6 ka polish wala hissa, Layer 3 ka LLM (template plan se chalao)

---

*Har layer khatam hote hi bolna "Layer X ho gaya" — main us layer ka detailed concept+code-hint wapas kholunga jaisa Build Guide mein tha.*
