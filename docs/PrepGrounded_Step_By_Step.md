# PrepGrounded — Step by Step, With "Kyun"
### Har step: kya kar rahe hain, kyun kar rahe hain, isse kya milta hai

---

# PART A — Pehle Ye Samjho: System Chalta Kaise Hai

Build karne se pehle ye picture saaf hona chahiye. Ye **runtime flow** hai — jab user actually use karta hai tab kya hota hai.

## User ki journey — 6 steps

```
┌─────────────────────────────────────────────────────────────┐
│ USER: resume upload karta hai + "Amazon" select karta hai    │
└──────────────────────────┬──────────────────────────────────┘
                           │
   ┌───────────────────────┴───────────────────────┐
   │                                               │
   ▼                                               ▼
┌──────────────────────┐              ┌────────────────────────┐
│ TRACK 1: RESUME      │              │ TRACK 2: COMPANY DATA  │
│                      │              │                        │
│ PDF → text           │              │ Amazon ke saare        │
│ text → skills        │              │ records uthao (25)     │
│                      │              │                        │
│ ["Arrays","OOPs"]    │              │ GINO: kaunsa topic     │
│                      │              │ kitni baar aaya        │
│                      │              │ DP: 19/25 (76%)        │
│                      │              │ Graphs: 15/25 (60%)    │
│                      │              │                        │
│                      │              │ ❌ ye RAG NAHI hai     │
│                      │              │    ye counting hai     │
└──────────┬───────────┘              └───────────┬────────────┘
           │                                      │
           └──────────────┬───────────────────────┘
                          ▼
            ┌─────────────────────────────┐
            │ GAP = company - resume      │
            │                             │
            │ Company: DP, Graphs, OOPs   │
            │ Resume:  Arrays, OOPs       │
            │ ─────────────────────────   │
            │ GAP:     DP(76%), Graphs(60%)│
            │                             │
            │ ❌ ye bhi RAG nahi          │
            │    ye Set subtraction hai   │
            └──────────────┬──────────────┘
                           ▼
        ┌──────────────────────────────────────┐
        │ 🔴 AB RAG SHURU HOTA HAI             │
        │                                      │
        │ query = "Amazon SDE DP Graphs        │
        │          interview rounds"           │
        │                                      │
        │ [R] embed(query) → top 8 records     │
        │     dhoondo  ⭐ NOVELTY YAHIN        │
        │                                      │
        │ [A] wo 8 records prompt mein daalo   │
        │                                      │
        │ [G] LLM plan likhe, citation ke saath│
        └──────────────────┬───────────────────┘
                           ▼
            ┌──────────────────────────────┐
            │ FINAL OUTPUT                 │
            │ • Stats (counting se)        │
            │ • Gaps (subtraction se)      │
            │ • 4-week plan (RAG se)       │
            │ • Citations (verify ke liye) │
            └──────────────────────────────┘
```

## Yaad rakhne wali ek line

> **Statistics counting se aati hai. Plan RAG se aata hai. Dono milke output banate hain.**

Agar ye ek line samajh gaye, toh poora system samajh gaye.

---

# PART B — Ab Build Karo, Step By Step

---

## STEP 1 — Data collect karo

### Kya kar rahe hain
80-100 real interview experiences GFG se nikaal kar `data/experiences.json` mein structured form mein daal rahe hain.

### Kyun kar rahe hain
Kyunki **poora system isi data pe khada hai.** RAG apne data se behtar kabhi nahi ho sakta. Aur specifically:

- **Structured kyun, raw text kyun nahi?** Kyunki aapko counting karni hai. "31/40 mein DP tha" ye tabhi nikal sakta hai jab har record mein `topics: ["DP", ...]` ek proper field ho. Raw paragraph se aap gin nahi sakte.
- **Saalon ka spread kyun zaroori hai?** Kyunki aapka novelty hi purane records ko peeche dhakelna hai. Agar saara data 2025 ka hua, toh aapka system aur baseline **same output denge**, aur poora project invisible ho jaayega.

### Isse kya milta hai
Ek corpus jispe aap (a) search kar sakte ho, (b) count kar sakte ho, (c) time ke hisaab se rank kar sakte ho.

### Checkpoint
`console.log` se check karo: kam se kam 5 alag saal, 6+ companies, aur har record mein `topics` bhara hua ho.

---

## STEP 2 — Embedding banao

### Kya kar rahe hain
Ek function `embed(text)` jo text ko numbers ki list (vector) mein badalta hai. Aur `cosine(a,b)` jo do vectors ki similarity naapta hai.

### Kyun kar rahe hain
Computer text ko compare nahi kar sakta. "DP problem tha" aur "dynamic programming poocha" — ye do strings alag hain, par matlab same hai. Keyword search (`includes()`) ye **miss kar dega**.

Embedding text ko aise numbers mein badalta hai ki **similar matlab wale text ke numbers paas paas** hote hain. Phir cosine se aap naap sakte ho kitne paas hain.

### Isse kya milta hai
Ab aap "meaning" se search kar sakte ho, sirf exact words se nahi. **Ye RAG ka R (Retrieval) ka foundation hai** — iske bina RAG possible hi nahi.

### Checkpoint
```
cosine(embed("dynamic programming"), embed("DP problems"))     → zyada
cosine(embed("dynamic programming"), embed("HR round"))        → kam
```
Agar dono same aa rahe hain, embedding kaam nahi kar rahi.

---

## STEP 3 — Baseline retrieval banao

### Kya kar rahe hain
`mode: "baseline"` — query ko embed karo, saare records se cosine similarity nikaalo, sort karo, top 10 do.

### Kyun kar rahe hain — ye sabse important "kyun" hai
**Ye standard RAG hai. Ye wo cheez hai jise aapko BEAT karna hai.**

Baseline banaye bina aap kabhi nahi bol sakte ki "maine improve kiya". "Mera system 85% fresh results deta hai" ka koi matlab nahi jab tak aap ye na bolo "plain RAG sirf 45% deta hai".

**Ye discipline hai jo student project ko research project banati hai.**

### Isse kya milta hai
1. Ek working RAG retrieval (aapka project ab technically RAG use kar raha hai)
2. Aur sabse important — **ek measuring stick**

### Checkpoint
Query chalao: "Amazon system design rounds". Results ke saal dekho.

Aapko 2018-2020 ke results top pe dikhenge. **Ye bug nahi hai — ye wo problem hai jo aap solve kar rahe ho.** Screenshot le lo, ye aapke report ka motivation evidence hai.

---

## STEP 4 — Recency + Outcome scoring add karo

### Kya kar rahe hain
```
score = 0.60 × similarity  +  0.30 × recency  +  0.10 × outcome_weight
```

Jahan `recency = e^(-λ × age_in_years)`

### Kyun kar rahe hain

**Recency kyun?** Kyunki interview process har 1-2 saal mein badalta hai. 2018 ka Amazon experience aaj lagbhag bekaar hai, par baseline usko top pe la sakta hai kyunki uske words match kar gaye. Time ek **relevance signal** hai, aur standard RAG ise ignore karta hai.

**Exponential decay kyun, simple cutoff kyun nahi?** "3 saal se purana = reject" ek arbitrary cliff hai. 2 saal 11 mahine wala accept aur 3 saal 1 mahina wala reject — ye galat hai. Exponential smooth hai, dheere dheere girta hai.

**Outcome weight kyun?** Aapke data mein selected aur rejected dono ke experiences hain. Jo select hua usne **poora funnel dekha** — saare rounds. Jo round 1 mein reject hua wo baaki process ke baare mein kuch nahi bata sakta. Dono ko same weight dena galat information hai.

> Ye outcome-weighting temporal RAG ki research literature mein **nahi** hai. Ye aapka apna addition hai — contribution list mein likhna.

### Isse kya milta hai
Aapka pehla measurable improvement. Ab wahi query chalao — 2025 ke results upar aa jaayenge.

### Checkpoint
| | baseline | fixed |
|---|---|---|
| Top result ka saal | 2019 | 2025 |
| Average age | 3.8 saal | 1.4 saal |

---

## STEP 5 — Adaptive λ (⭐ aapka research contribution)

### Kya kar rahe hain
λ ko hardcode karne ke bajaye, **har company ke liye data se derive** kar rahe hain.

### Kyun kar rahe hain — dhyan se padho

Step 4 mein aapne ek fixed λ use kiya — maano 0.35, sab companies ke liye same.

**Par ye galat hai.** Kyun?

- Amazon apne rounds har saal restructure karta hai → purana data **jaldi** bekaar hota hai → λ zyada hona chahiye
- TCS 5 saal se same aptitude + basic technical chala raha hai → purana data **ab bhi kaam ka** hai → λ kam hona chahiye

Ek global λ dono ke liye galat hai. Amazon pe wo bahut gentle hoga, TCS pe bahut aggressive.

**Aur ye sirf meri opinion nahi hai** — jo research paper hai (arXiv:2509.19376), usne **khud likha** hai ki fixed recency prior "parameter-sensitive" hai, ek corpus pe tuned value doosre pe fail ho jaati hai.

**Ye ek publicly stated open problem hai. Aap ise attack kar rahe ho.**

### Kaise kar rahe hain
```
Har company ke liye:
  1. Har saal ka topic distribution nikaalo
     Amazon 2019: {Arrays: 0.3, Trees: 0.3, OOPs: 0.2, DP: 0.2}
     Amazon 2025: {DP: 0.3, Graphs: 0.3, SystemDesign: 0.25, Behavioral: 0.15}

  2. Consecutive saalon ke distributions kitne alag hain? → naapo
     (Jensen-Shannon divergence se)

  3. Average difference = drift_score (0 se 1)

  4. λ = λ_base × (1 + gain × drift_score)
```

**Jensen-Shannon kyun, simple difference kyun nahi?**
- Symmetric hai (KL divergence nahi hai — KL(P,Q) ≠ KL(Q,P))
- 0 se 1 mein bounded hai — seedha score ki tarah use ho sakta hai
- Zero probabilities handle karta hai (KL infinity de deta hai jab ek topic ek saal mein hai doosre mein nahi — jo yahan har waqt hoga)

### Isse kya milta hai
Ek table jo aapne **kabhi hardcode nahi kiya**, system ne data se nikaala:

```
Company     drift    λ       half-life
Amazon      0.31     0.52    1.3 years
Google      0.28     0.50    1.4 years
TCS         0.06     0.38    1.8 years
Infosys     0.04     0.37    1.9 years
```

**Ye aapka demo highlight hai.** Bolna: *"Maine kahin nahi likha ki Amazon fast badalta hai. System ne 25 records se khud measure kiya."*

### Checkpoint
Product companies upar, service companies neeche. Agar order random hai → data mein saalon ke saath topics badal hi nahi rahe.

---

## STEP 6 — Backend + CRUD

### Kya kar rahe hain
Express server, JSON storage, aur experiences pe full CRUD (Create, Read, Update, Delete).

### Kyun kar rahe hain
Requirement toh hai hi, par ismein ek **genuinely interesting problem** chhupi hai:

> Jab koi naya experience add kare, uska embedding kab banega?

- Query time pe har baar? → bahut slow, har search pe 100 embeddings banenge
- **Save karte waqt, ek baar?** → ✅ sahi jawab
- Background job se? → is scale pe over-engineering

Aur agar koi record **edit** kare, toh purana embedding ab galat hai — **re-embed karna padega**. Par sirf tab jab semantic content badla ho. Agar sirf `source_url` badla, re-embed karna waste hai.

**Ye cache invalidation ka real example hai** — computer science ke do hard problems mein se ek. Viva mein ye bolna.

Aur ek aur: naya record add hone se **drift bhi badal sakti hai**, isliye λ recompute karna padega.

### Isse kya milta hai
Ek live system jahan naya data turant searchable ho jaata hai.

### Checkpoint
UI/Postman se naya experience add karo → turant retrieval results mein aa jaaye.

---

## STEP 7 — Statistics (counting)

### Kya kar rahe hain
`computeStats()` — company ke saare records pe loop chalao, har topic gino, percentage nikaalo.

### Kyun kar rahe hain — aur kyun ye RAG NAHI hai
Ye wo cheez hai jo **RAG kar hi nahi sakta.**

RAG 10 documents la sakta hai. Wo poore corpus pe count nahi kar sakta. "DP appeared in 31 of 40 interviews" — ye number sirf tab possible hai jab aap **saare 40 pe loop** chalao.

**Iron rule: yahan ek bhi LLM call nahi.** LLM se poochoge "DP kitni baar aaya" toh wo guess karega, har baar alag number dega. Code se poochoge toh exact number aayega, har baar same.

### Ek honest-engineering detail
Agar recent window mein 5 se kam records hain, toh percentage bekaar hai (1/2 = "50%" bolna misleading hai). Aise case mein poore history pe fall back karo **aur output mein bata do**. Ek `confidence: "low"` field rakho.

**Ye chhoti si cheez examiner ko dikhati hai ki aap apne data ki limitations samajhte ho** — bahut strong signal hai.

### Isse kya milta hai
Wo number jo ChatGPT nahi de sakta: **"31/40 (77%)"** — counted, not generated.

---

## STEP 8 — Gap Analysis

### Kya kar rahe hain
```
gaps = wo topics jo stats mein hain (>15%) par resume mein nahi
readinessScore = covered topics ka weighted %
priority: >=50% → critical, >=30% → high, warna medium
```

### Kyun kar rahe hain
Yehi **personalization** hai. Statistics sabke liye same hain — Amazon ke stats har student ke liye ek jaise hain. Par **gap har student ka alag hai.**

Aur ye ek **Set difference** hai. LLM se mat karwana — wo aise topics nikaal dega jo stats mein hain hi nahi.

### Isse kya milta hai
"Tumhare paas Arrays aur OOPs hai. DP (76%) aur Graphs (60%) missing hain. Ye tumhara critical gap hai."

---

## STEP 9 — RAG se Plan banao 🔴

### Kya kar rahe hain
**Ab actual RAG chalega:**

```
[R] query banao → embed karo → top 8 records retrieve karo
[A] un 8 records ka text prompt mein daalo
[G] LLM se 4-week plan likhwao, har week mein citation ke saath
```

### Kyun kar rahe hain
Statistics aur gaps aapko **kya** padhna hai bata dete hain. Par **kaise, kis order mein, kaunse specific problems** — wo ek plan chahiye. Aur wo plan real interview questions pe based hona chahiye, generic advice nahi.

**Isliye retrieval zaroori hai** — LLM ko wo 8 actual experiences dikhane padenge, warna wo generic bakwaas likh dega.

### Grounding contract — sabse important design decision
Prompt mein rules likho:
```
- topics sirf is list se: [gaps aur stats se aaye topics]
- har week mein kam se kam ek citation id
- koi topic recommend mat karo jo stats mein nahi hai
```

**Aur phir generation ke BAAD code se verify karo:**
```
- jo topic allowed list mein nahi → hata do
- jo citation id exist nahi karti → hata do
- report karo: groundingCheck: { passed: true/false }
```

**Kyun dono?** Kyunki prompt mein rule likhna kaafi nahi — model 10% baar todega. **Verification code mein honi chahiye.** Isse aap *prove* kar sakte ho ki system hallucinate nahi karta, sirf claim nahi karna padega.

### Isse kya milta hai
Ek personalized 4-week plan jahan har recommendation ek real interview record se traceable hai.

---

## STEP 10 — Frontend

### Kya kar rahe hain
4 pages: Experiences (CRUD), Analyze (upload), Report (output), **Compare** (baseline vs adaptive).

### Kyun kar rahe hain
Frontend yahan sirf display nahi hai — **evidence presentation** hai. Do cheezein normal apps mein nahi hoti:

1. **Score breakdown visible** — har result ke saath teen bars: similarity, recency, outcome. Ye dikhata hai ranking kaise bani. Black box nahi hai.
2. **Citations clickable** — click karo → original text khule. Ye "grounded" ko *dikhne wala* banata hai.

**Compare page sabse important hai.** Wahi wo screen hai jahan examiner ko 5 second mein samajh aa jaayega ki aapne kya kiya.

---

## STEP 11 — Evaluation (Results chapter)

### Kya kar rahe hain
Temporal holdout test + baseline comparison + λ ablation.

### Kyun kar rahe hain — circularity ka ilaaj
Agar aap apne poore data pe evaluate karoge, result circular hai. Iska proper ilaaj:

```
1. Corpus ko 2024 tak kaat do
2. 2025-26 ke records HIDE kar do — system ne inhe kabhi nahi dekha
3. System se poocho: "is company mein kya poocha jaayega?"
4. Predicted topics ko hidden 2025-26 ke ACTUAL topics se match karo
```

**Ab ye retrieval task nahi, prediction task hai.** System jaanta hi nahi ki jawab kya hai. **Circular ho hi nahi sakta.**

### Metrics
| Metric | Matlab |
|---|---|
| Freshness@10 | top-10 mein kitne 2 saal ke andar |
| Staleness@10 | kitne 4 saal se purane |
| Topic Hit Rate | predicted topics jo actually future mein aaye |

### Isse kya milta hai
Aapka Results chapter:

| Metric | Baseline | Fixed λ | **Adaptive λ** |
|---|---|---|---|
| Freshness@10 | ~0.45 | ~0.82 | **~0.88** |
| Staleness@10 | ~0.38 | ~0.09 | **~0.05** |
| Topic Hit Rate | ~0.61 | ~0.68 | **~0.74** |

> Agar adaptive fixed se better nahi nikla, **honestly report karo.** Ek negative result jo aap samjha sako, ek fudged positive se hazaar guna better hai.

---

## STEP 12 — Verification

### Kya kar rahe hain
Har layer ko alag tareeke se verify karna.

### Kyun kar rahe hain
Kyunki evaluator poochega "kaise pata aapka system sahi hai?" — aur "sahi" ka matlab har layer mein alag hai:

| Layer | Verification method |
|---|---|
| Counting/stats | Unit test — chhota fake dataset, manually verify |
| Retrieval | Temporal holdout + baseline comparison |
| Plan generation | Automated citation audit + 20 outputs manually check |
| Resume extraction | 15 resumes manually label karo → precision/recall |
| End-to-end | 10-15 students se feedback |

---

# PART C — RAG Ka Summary (ek jagah)

## RAG kahan hai, kahan nahi

| Component | RAG? | Kyun |
|---|---|---|
| Embedding banana | Foundation | R ka base |
| Retrieval (top 8) | ✅ **R** | Semantic search — ⭐ novelty yahin |
| Prompt mein records daalna | ✅ **A** | Augmentation |
| Plan generate karna | ✅ **G** | Grounded generation |
| Statistics (31/40) | ❌ | Poore corpus pe counting |
| Gap analysis | ❌ | Set difference |
| Resume parsing | ❌ | Extraction, retrieval nahi |

## Aapka novelty RAG ke andar kahan hai

```
Standard RAG:     score = cosine_similarity

Aapka RAG:        score = 0.60 × cosine_similarity
                        + 0.30 × recency(λ_company)     ← naya
                        + 0.10 × outcome_weight          ← naya

                  aur λ_company data se derive hota hai  ← ⭐ sabse naya
```

**Ek line mein:** aap RAG ke retrieval step ko time-aware aur outcome-aware bana rahe ho, aur time-decay ka parameter khud data se seekh rahe ho.

---

*Ab STEP 1 se shuru karo. Jab data ban jaaye, bolna — main STEP 2 detail mein khol dunga.*
