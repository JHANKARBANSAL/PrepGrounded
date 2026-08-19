# PrepGrounded — Build It Yourself Guide
### Har stage pe: pehle concept samjho, phir khud likho, phir test karo

---

> **Is guide ko use kaise karna hai**
>
> Har stage ke 5 hisse hain:
> - **Kya banana hai** — stage ka goal
> - **Concept** — jo cheez samajhna zaroori hai, code likhne se PEHLE
> - **Khud try karo** — ek chhota experiment jo concept ko haath se feel karata hai
> - **Ab likho** — kya file, kya function, kya logic (code main nahi doonga, structure aur hints doonga)
> - **Checkpoint** — kaise verify karo ki sahi hua
> - **Ab aap ye samajh gaye** — viva mein ye bol paoge
>
> **Rule: agar "Concept" samajh nahi aaya, toh "Ab likho" pe mat jao.** Wapas aao, poocho, phir aage badho. Ye guide speed ke liye nahi, samajh ke liye hai.

---

# PART 0 — Poore System Ka Mental Model

Code likhne se pehle ye kahani apne dimaag mein saaf honi chahiye. Agar aap ye kahani bina dekhe bol sakte ho, tabhi aage badho.

### Data ki journey — ek user ke perspective se

```
Student aata hai
   │
   ├─ apna resume PDF upload karta hai
   │     │
   │     └─► PDF se text nikala jaata hai
   │           └─► text se SKILLS nikale jaate hain  → ["Arrays", "OOPs", "DBMS"]
   │
   └─ "Amazon" select karta hai
         │
         ├─► Amazon ke SAARE records uthao (maan lo 25)
         │      └─► GINO: kaunsa topic kitni baar aaya?
         │             → DP: 19/25 (76%), Graphs: 15/25 (60%), OOPs: 8/25 (32%)
         │             [ye plain counting hai — LLM nahi]
         │
         ├─► GAP = jo topics company poochti hai, par resume mein nahi hain
         │      → student ke paas Arrays, OOPs, DBMS hai
         │      → company DP, Graphs poochti hai
         │      → GAP = [DP (76%), Graphs (60%)]
         │             [ye Set subtraction hai — LLM nahi]
         │
         ├─► SEARCH: "Amazon DP Graphs interview" ke liye
         │      sabse relevant 8 records dhoondo
         │             [YAHAN RAG hai — aur yahan aapka novelty hai]
         │
         └─► LLM ko do: stats + gaps + 8 records
                └─► LLM 4-week plan likhta hai, har week mein citation
                       [LLM sirf LIKHTA hai, DECIDE nahi karta]
```

### Ek line mein har layer ka kaam

| Layer | Kaam | Kaun karta hai |
|---|---|---|
| Ingestion | Text → structured records | LLM (offline, ek baar) |
| Storage | Records + unke vectors | Database / JSON |
| **Retrieval** | Sawal ke liye best records | **Aapka custom scoring — ⭐ novelty** |
| Aggregation | Percentages nikalna | Plain code (counting) |
| Gap analysis | Resume vs company | Plain code (Set difference) |
| Generation | Plan likhna | LLM (constrained) |

### 🔴 Sabse important rule — isko yaad kar lo

> **LLM sirf do kaam karta hai: text ko structure karna, aur structure ko text banana.**
> **Beech ka saara SOCHNA (counting, comparing, ranking) plain code karta hai.**

Kyun? Kyunki LLM se agar aap poochoge "DP kitni baar aaya", wo guess karega — 70%, 80%, jo mann mein aaye. Aur har baar alag jawab dega. Code se poochoge, toh exact number aayega, har baar same.

**Viva mein ye poocha jaayega: "aapne LLM ka use kahan kiya aur kahan nahi, aur kyun?"** — upar wali table hi aapka jawab hai.

---

# PART 1 — Concepts (code se pehle)

Ye 4 concepts samajhna zaroori hai. Har ek ke saath ek chhota experiment hai — wo zaroor chalao.

## 1.1 Embedding kya hai?

**Concept.** Computer text ko compare nahi kar sakta, numbers ko kar sakta hai. Embedding ek function hai jo text ko numbers ki list (vector) mein badalta hai — is tarah se ki **similar matlab wale text ke vectors paas paas hote hain.**

Socho ek map ki tarah. "Dynamic Programming" aur "Memoization" map pe paas paas honge. "Dynamic Programming" aur "HR round" door honge. Embedding wo map banata hai.

Vector ki length (dimensions) usually 384, 768, ya 1536 hoti hai. Har number ka apna koi "matlab" nahi hota — matlab poore vector ke *direction* mein hota hai.

**Khud try karo.** Node mein ye chalao (koi library nahi chahiye) — ye ek bahut simple, khud ka embedding hai:

```js
// har word ko ek slot deta hai — sabse basic "embedding"
const VOCAB = ["dp", "graph", "tree", "oops", "sql", "hr", "aptitude"];

function toyEmbed(text) {
  const words = text.toLowerCase().split(/\s+/);
  return VOCAB.map(v => words.includes(v) ? 1 : 0);
}

console.log(toyEmbed("dp and graph questions"));  // [1,1,0,0,0,0,0]
console.log(toyEmbed("hr and oops round"));       // [0,0,0,1,0,1,0]
```

Real embedding models yahi kaam karte hain, bas bahut zyada sophisticated tareeke se — wo synonyms bhi samajhte hain ("memoization" aur "DP" ko paas rakhte hain), jo ye toy version nahi kar sakta.

**Samajh gaye?** Embedding = text ka numeric fingerprint jisme *matlab* preserve hota hai.

## 1.2 Cosine similarity kya hai?

**Concept.** Do vectors kitne similar hain, ye naapne ka tareeka. Formula:

```
cosine(A, B) = (A · B) / (|A| × |B|)
```

- `A · B` = dot product = har position ko multiply karke sab jodo
- `|A|` = vector ki length = sqrt(saare squares ka sum)

Result hamesha **-1 se 1** ke beech hota hai. Text embeddings mein usually **0 se 1**:
- `1.0` = bilkul same direction (same matlab)
- `0.0` = bilkul unrelated
- Beech mein = kitna related hai

**Khud try karo.** Upar wale toyEmbed ke saath:

```js
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const q  = toyEmbed("dp graph");
const d1 = toyEmbed("dp graph tree questions");
const d2 = toyEmbed("hr aptitude round");

console.log(cosine(q, d1));  // ~0.82  → related
console.log(cosine(q, d2));  // 0      → unrelated
```

**Ye chala kar dekho.** Jab tak aap khud numbers nahi dekhoge, ye abstract rahega.

**Samajh gaye?** Cosine = do vectors ke beech ke angle ka measure. Chhota angle = zyada similar.

## 1.3 RAG kya hai — aur kya nahi hai?

**Concept.** RAG = **R**etrieval **A**ugmented **G**eneration. Teen steps:

```
1. RETRIEVE  — user ka sawal → embed karo → apne documents mein
               sabse similar wale k documents dhoondo
2. AUGMENT   — wo documents prompt mein daal do
3. GENERATE  — LLM sirf un documents ke basis pe jawab de
```

**Kyun zaroori hai?** LLM ko aapka data pata nahi. Aur agar bina data ke poochoge, wo bana dega (hallucination). RAG usko "open book exam" de deta hai.

**RAG kya NAHI hai** — ye galatfehmi bahut common hai:
- ❌ RAG training nahi hai. Model badalta hi nahi.
- ❌ RAG magic nahi hai. Agar retrieval galat documents laaya, jawab galat aayega. **"Garbage in, garbage out" RAG mein bahut strong hai.**
- ❌ RAG counting nahi kar sakta. 10 documents retrieve karke LLM se "kitne percent" poochna = galat jawab.

**Aur yahin se aapka project shuru hota hai.** Standard RAG mein retrieval step sirf cosine similarity dekhta hai. Aapka claim hai ki **ye kaafi nahi hai** — interview data mein time bhi matter karta hai.

## 1.4 Exponential decay kya hai?

**Concept.** Purane records ko kam importance dene ke liye ek smooth function chahiye. Cliff nahi chahiye ("3 saal se purana = 0") kyunki wo arbitrary hai. Chahiye ek curve jo dheere dheere girta hai:

```
recency = e^(-λ × age_in_years)
```

`λ` (lambda) decide karta hai kitni tezi se girega:

| λ | Half-life | 1 saal | 3 saal | 6 saal |
|---|---|---|---|---|
| 0.2 | 3.5 saal | 0.82 | 0.55 | 0.30 |
| 0.5 | 1.4 saal | 0.61 | 0.22 | 0.05 |
| 0.9 | 0.8 saal | 0.41 | 0.07 | 0.005 |

**Half-life** = kitne saal mein score aadha ho jaaye = `ln(2)/λ`. Ye radioactive decay wala hi concept hai.

**Khud try karo:**
```js
const recency = (ageYears, lambda) => Math.exp(-lambda * ageYears);
for (const lam of [0.2, 0.5, 0.9]) {
  console.log(`λ=${lam}  half-life=${(Math.log(2)/lam).toFixed(1)}y`,
    [0,1,3,6].map(a => recency(a, lam).toFixed(2)).join('  '));
}
```

**Samajh gaye?** λ ek knob hai. Zyada λ = purane records tezi se bhoolo.

> 🔑 **Aur yahi aapke research contribution ki jad hai:**
> Sabhi companies ke liye ek hi λ galat hai. Amazon ka process har saal badalta hai (λ zyada hona chahiye), TCS ka 5 saal se same hai (λ kam hona chahiye). **Aap λ ko data se derive karoge, hardcode nahi karoge.** — Stage 6 mein.

---

# PART 2 — Build Stages

---

## STAGE 1 — Data (sabse pehle, code se pehle)

### Kya banana hai
`data/experiences.json` — aapka corpus.

### Concept
Ek RAG system apne data se behtar kabhi nahi ho sakta. Aur aapke case mein ek **specific** requirement hai:

> **Aapke data mein saalon ka spread hona ZAROORI hai.**

Agar saare records 2025 ke huye, toh recency weighting ka koi effect nahi dikhega — baseline aur aapka system same output denge, aur aapka poora project demo mein invisible ho jaayega. **Ye sabse badi galti hai jo aap kar sakte ho.**

### Ab banao

Har record ka shape:

```json
{
  "id": "gfg_amazon_2025_01",
  "company": "Amazon",
  "role": "SDE-1",
  "year": 2025,
  "month": 8,
  "rounds": [
    { "round_number": 1, "round_type": "OA",
      "topics": ["Arrays", "DP"],
      "questions": ["Trapping rain water", "Coin change"],
      "difficulty": "medium" }
  ],
  "total_rounds": 4,
  "topics": ["Arrays", "DP", "Graphs"],
  "questions": ["..."],
  "outcome": "selected",
  "raw_text": "poora original paragraph — citation dikhane ke liye",
  "source": "real",
  "source_url": "https://geeksforgeeks.org/..."
}
```

**Topics ka fixed vocabulary rakho** (ye important hai — warna "DP" aur "Dynamic Programming" alag topics ban jaayenge):

```
DP, Arrays, Strings, Graphs, Trees, LinkedList, Recursion, Greedy,
SlidingWindow, BinarySearch, OOPs, DBMS, OS, Networks, SystemDesign,
Aptitude, Behavioral, Projects
```

**Data collection strategy:**

1. **40 REAL records** — GFG se manually. 1 ghanta lagega. `"source": "real"`.
   Companies: 2 product (Amazon, Google) + 2 service (TCS, Infosys). **Ye contrast Stage 6 ke liye zaroori hai.**
   Years: 2017 se 2026 tak faila kar.
2. **60–100 SYNTHETIC** — LLM se generate karwao volume ke liye. `"source": "synthetic"`.

**Kyun dono?** Kyunki aap **saare reported numbers sirf real subset pe** nikaaloge (isse aapki evaluation circular nahi hogi — ye Risk 2 ka fix hai). Synthetic sirf UI demo aur volume ke liye hai.

### Checkpoint
```js
const data = require('./data/experiences.json');
const byYear = {};
data.forEach(e => byYear[e.year] = (byYear[e.year]||0)+1);
console.log(byYear);
```
- ✅ Kam se kam 6 alag saal dikhne chahiye
- ✅ 2020 se pehle ke bhi records hon
- ❌ Agar 80% records ek hi saal ke hain — **rukо, data theek karo**

### Ab aap ye samajh gaye
Structured data unstructured se kyun better hai; controlled vocabulary kyun chahiye; aur evaluation ke liye data design pehle se sochna padta hai.

---

## STAGE 2 — Embedding Layer

### Kya banana hai
`server/src/services/embedding.service.js` — do functions: `embed(text)` aur `cosine(a, b)`.

### Concept
Aapko **do providers** banane chahiye ek hi interface ke peeche:

- **local** — koi API nहीं, koi key nahi. Words ko hash karke vector banao.
- **gemini** — real semantic embeddings.

**Kyun dono?** Teen wajahein, aur ye teenon viva mein bolne layak hain:
1. Aapka novelty **scoring function** hai, embedding model nahi. Jab tak baseline aur custom dono **same** embeddings use kar rahe hain, comparison valid hai.
2. Local provider se aapki evaluation offline aur reproducible ho jaati hai (koi API randomness nahi).
3. Demo ke din wifi/API fail ho jaaye toh sab kuch phir bhi chalega.

### Ab likho

**`cosine(a, b)`** — Part 1.2 wala formula. 10 lines.

**`embed(text)`** — provider ke hisaab se branch:

*Local version ka logic:*
1. Text ko lowercase karo, punctuation hatao, words mein todo
2. Stopwords hatao (`the`, `and`, `round`, `interview`... — ye har record mein hain isliye information nahi dete)
3. Ek fixed-size array banao (256 slots)
4. Har word ko ek hash function se ek slot number do, us slot mein weight jodo
5. **Normalize karo** — vector ko uski length se divide karo

> **Normalize kyun?** Bina normalize kiye, lamba document har query se "similar" lagne lagega sirf isliye ki uske numbers bade hain. Normalize karne ke baad sirf *direction* matter karta hai, *magnitude* nahi. Ye ek classic IR mistake hai — bachna.

*Gemini version:* `text-embedding-004` endpoint pe POST, `embedding.values` return karo.

### Checkpoint
```js
const a = await embed("dynamic programming and graph questions");
const b = await embed("DP problems and graph traversal");
const c = await embed("HR round about teamwork");
console.log(cosine(a,b), cosine(a,c));
```
✅ Pehla number doosre se **kaafi zyada** hona chahiye.
❌ Agar dono ~same hain, embedding kaam nahi kar rahi — stopwords ya normalization check karo.

### Ab aap ye samajh gaye
Vector space model; normalization kyun matter karta hai; provider abstraction (interface ke peeche implementation chhupana) — ye ek proper software design pattern hai.

---

## STAGE 3 — Baseline Retrieval (pehle baseline, phir improvement)

### Kya banana hai
`retrieval.service.js` mein `mode: "baseline"`.

### Concept
**Baseline pehle banao. Hamesha.**

Ye discipline hai jo student projects ko research projects se alag karta hai. "Maine better retrieval banaya" ek khaali statement hai. "Baseline se staleness 38% se 8% aayi" — ye engineering hai. Aur baseline ke bina aap doosra wala bol hi nahi sakte.

### Ab likho

```
retrieve(queryEmbedding, corpus, { mode, company, k })
  1. company ke hisaab se filter karo (agar diya ho)
  2. har record ke liye: score = cosine(queryEmbedding, record.embedding)
  3. score se descending sort karo
  4. top k return karo
```

**Zaroori:** return karte waqt score ka **breakdown** bhi bhejo, sirf final number nahi:
```js
_scores: { similarity: 0.72, recency: null, outcome: null, final: 0.72 }
```
Ye UI mein dikhega aur aapka demo isi se strong banega.

### Checkpoint
Query chalao: `"Amazon system design rounds"`. Results dekho aur unke **saal** note karo.

Aapko 2018–2020 ke results top-10 mein dikhne chahiye. **Ye bug nahi hai — yahi problem hai jo aap solve kar rahe ho.** Ek screenshot le lo, ye aapke report mein "motivation" ka evidence hai.

### Ab aap ye samajh gaye
Standard RAG kaise kaam karta hai, aur uski time-blindness ko aapne apni aankhon se dekha.

---

## STAGE 4 — Fixed Temporal Scoring (pehla improvement)

### Kya banana hai
`mode: "fixed"` — recency aur outcome add karo, ek global λ ke saath.

### Concept
Ab aap teen signals ko mila rahe ho:

```
final = 0.60 × similarity      (kitna relevant hai)
      + 0.30 × recency         (kitna naya hai)
      + 0.10 × outcome_weight  (kitna bharosemand hai)
```

**Outcome weight kyun?** Aapke data mein selected aur rejected dono candidates ke experiences hain. Jo select hua usne **poora funnel** dekha — saare rounds. Jo round 1 mein hi reject ho gaya wo baaki process ke baare mein kuch nahi bata sakta. Toh dono ko same weight dena galat hai:

```
selected: 1.0    rejected: 0.7    unknown: 0.5
```

**Ye temporal RAG literature mein nahi hai** — ye aapka apna addition hai. Note kar lo, ye contribution list mein jaayega.

**Weights kaise choose kiye?** Abhi ke liye ye starting point hai. Stage 8 mein aap inko justify karoge. Viva mein **kabhi mat bolna "aise hi rakh diye"** — bolna "initial values, validated via ablation".

### Ab likho

`recencyScore(year, month, lambda)`:
```
age = aaj - record ki date (saalon mein, decimal)
return Math.exp(-lambda * age)
```

> **Ek detail jo log miss karte hain:** age nikalte waqt month bhi use karo, sirf year nahi. Warna January 2025 aur December 2025 ke records ka age same nikal jaayega. `year + month/12` use karo.

Phir `mode === "fixed"` branch mein teenon jodo.

### Checkpoint
Wahi query dono modes mein chalao aur compare karo:

| | baseline | fixed |
|---|---|---|
| Top result ka saal | 2019 | 2025 |
| Average age | 3.8 saal | 1.4 saal |

✅ Fixed mode ke results **clearly naye** hone chahiye
❌ Agar dono same aa rahe hain: (a) data mein year spread check karo, (b) `W_REC` 0 toh nahi hai, (c) recencyScore actually 0-1 range mein return kar raha hai?

### Ab aap ye samajh gaye
Hybrid scoring (multiple signals ko weighted combine karna) — ye production search systems ka core hai aur bahut kam students ise samajhte hain. Yahi aapka pehla real technical differentiator hai.

---

## STAGE 5 — CRUD + Backend Skeleton

### Kya banana hai
Express server + experiences pe full CRUD.

### Concept
Ye "boring" part hai par ismein ek **genuinely interesting problem** hai:

> Jab koi naya experience add kare, uska embedding kab banega?

Options:
- (a) Query time pe har baar — bahut slow, har search pe 150 embeddings banenge
- (b) **Save karte waqt, ek baar** — sahi jawab
- (c) Background job se — over-engineering, is scale pe zaroorat nahi

Aur ek aur: agar koi record **edit** kare, toh embedding stale ho gayi. **Re-embed karna padega** — par sirf tab jab semantic content badla ho (raw_text, topics, questions). Agar sirf `source_url` badla, re-embed karna waste hai.

**Ye cache invalidation ka real example hai.** Viva mein ye bolna — ye dikhata hai ki aapne sirf CRUD nahi likha, socha bhi hai.

### Ab likho

```
GET    /api/experiences?company=&year=&topic=&page=
GET    /api/experiences/:id
POST   /api/experiences          → validate → embed → save
PUT    /api/experiences/:id      → validate → (content badla? → re-embed) → save
DELETE /api/experiences/:id
```

**Validation zaroor daalo** — year 2000–2027 ke beech, month 1–12, outcome sirf 3 values mein se, topics array ho. Bina validation ke ek galat record poora scoring bigaad sakta hai.

**Storage:** JSON file se shuru karo. Ek `store/` module banao jo **saara** file access handle kare — baaki code kabhi `fs` ko directly na chhue. Isse baad mein Postgres pe shift karna ek file ka kaam ban jaayega.

### Checkpoint
- ✅ UI/Postman se naya experience add karo → turant `/api/retrieve` results mein aa jaaye
- ✅ Edit karo → naya content search mein reflect ho
- ✅ Galat year (jaise 1850) bhejo → 400 error mile

### Ab aap ye samajh gaye
REST design, validation, aur **cache invalidation** — jo computer science ke do hard problems mein se ek hai.

---

## STAGE 6 — ⭐ Adaptive λ (Aapka Research Contribution)

### Kya banana hai
`drift.service.js` — har company ke liye λ **data se** nikaalo.

### Concept — dhyan se padho, ye project ka dil hai

Jo paper maine bheja tha (arXiv:2509.19376), usne khud likha hai ki fixed recency prior **"parameter-sensitive"** hai — ek corpus pe tuned λ doosre pe fail ho jaata hai.

**Ye ek openly stated open problem hai. Aap ise attack kar rahe ho.**

Aapki insight:

> Ek corpus ke andar bhi alag alag entities alag speed se badalti hain. Amazon apne rounds har saal restructure karta hai. TCS ka aptitude + basic technical pattern 5 saal se same hai. **Ek global λ dono ke liye galat hai.**

Toh λ hardcode karne ke bajaye, **naapo** ki har company kitni tezi se badal rahi hai:

```
Step 1: har company, har saal → us saal ka topic distribution nikaalo
        Amazon 2019: {Arrays: 0.3, Trees: 0.3, OOPs: 0.2, DP: 0.2}
        Amazon 2025: {DP: 0.3, Graphs: 0.3, SystemDesign: 0.25, Behavioral: 0.15}

Step 2: consecutive saalon ke distributions kitne alag hain? → naapo

Step 3: average difference = drift_score  (0 se 1 ke beech)

Step 4: λ = λ_base × (1 + gain × drift_score)
```

**Difference naapne ke liye Jensen-Shannon divergence use karo.** Kyun JS aur kyun nahi simple difference:
- Ye **symmetric** hai (KL divergence nahi hai — KL(P,Q) ≠ KL(Q,P), jo yahan galat hoga)
- Log base 2 ke saath ye **0 se 1 mein bounded** hai — matlab seedha ek score ki tarah use ho sakta hai
- Ye zero probabilities handle karta hai (KL infinity de deta hai jab ek topic ek saal mein hai aur dusre mein nahi — jo yahan har waqt hoga)

Formula:
```
JS(P,Q) = 0.5 × KL(P || M) + 0.5 × KL(Q || M)      jahan M = (P+Q)/2
KL(P || Q) = Σ P(i) × log₂( P(i) / Q(i) )
```

### Ab likho

1. `topicDistribution(records)` → topic ko probability mein badlo (count / total)
2. `klDivergence(p, q, support)` → formula. **Skip karo jab p या q zero ho** (0 × log(0) = 0 hota hai)
3. `jensenShannon(p, q)` → upar wala formula
4. `computeCompanyDrift(records)`:
   - saal ke hisaab se group karo
   - agar 3 se kam saal hain → global default return karo (honest fallback)
   - consecutive saalon ke beech JS nikaalo
   - **saal ke gap se divide karo** — 3 saal ka gap ek saal ke violent change jaisa nahi dikhna chahiye
   - average lo → `drift`
   - `λ = λ_base × (1 + gain × drift)`

5. `buildDriftProfiles(allExperiences)` → saari companies ke liye ek table

### Checkpoint — ye sabse satisfying moment hoga

```
Company     drift    λ       half-life
Amazon      0.31     0.52    1.3 years
Google      0.28     0.50    1.4 years
Microsoft   0.19     0.46    1.5 years
Zoho        0.11     0.41    1.7 years
TCS         0.06     0.38    1.8 years
Infosys     0.04     0.37    1.9 years
```

✅ **Product companies upar, service companies neeche.** Aapne ye order kabhi code mein nahi likha — system ne data se khud nikala.

❌ Agar order random hai: aapke data mein topics saalon ke saath badal hi nahi rahe. Stage 1 pe wapas jao — real GFG data mein ye drift naturally hoti hai.

### Ab aap ye samajh gaye
Information theory basics (KL, JS divergence); parameter tuning vs parameter learning ka difference; aur sabse important — **ek published open problem ko kaise attack karte hain.**

> **Ye aapka demo highlight hai.** Table dikhao aur bolo: *"Maine kahin nahi likha ki Amazon fast badalta hai. System ne 25 records se khud measure kiya."*

---

## STAGE 7 — Aggregation + Gap Analysis

### Kya banana hai
`aggregation.service.js` — statistics aur gaps.

### Concept
Yahan wo cheez hai jo **RAG kar hi nahi sakta**: `"DP appeared in 31 of 40 recent interviews (77%)"`.

RAG 10 documents laa sakta hai. Wo poore corpus pe count nahi kar sakta. Ye number sirf tab possible hai jab (a) aapne text ko structured fields banaya, aur (b) aap ek counting pass chala rahe ho.

**Iron rule: ye saare numbers plain JavaScript se aayenge. Ek bhi LLM call nahi.**

### Ab likho

**`computeStats(records, { monthsBack })`:**
- recent window filter karo
- har topic count karo → percentage nikaalo
- average rounds, difficulty mix, outcome mix

> **Ek honest-engineering detail:** agar recent window mein 5 se kam records hain, toh percentage bekaar hai (1/2 = "50%" bolna misleading hai). Aise case mein poore history pe fall back karo **aur output mein bata do**. Ek `confidence: "low"` field rakho. Ye chhoti si cheez examiner ko dikhati hai ki aap apne data ki limitations samajhte ho — bahut strong signal hai.

**`computeGaps(resumeSkills, stats)`:**
```
gaps = wo topics jo stats mein hain (>15%) par resume mein nahi
covered = wo topics jo dono mein hain
readinessScore = covered topics ka weighted % (weight = askedPct)
priority: >=50% → critical, >=30% → high, warna medium
```

Ye ek **Set difference** hai. Bas. LLM se mat karwana — wo aise topics nikaal dega jo stats mein hain hi nahi.

### Checkpoint
- ✅ Ek resume jisme sirf `["Arrays", "OOPs"]` hai → Amazon ke liye DP aur Graphs critical gaps mein aane chahiye
- ✅ Har gap ke saath actual count dikhna chahiye ("19/25"), sirf percentage nahi
- ✅ Kam data wali company pe `confidence: "low"` aana chahiye

### Ab aap ye samajh gaye
Deterministic computation vs generative computation ka farak — aur **ye distinction hi junior ko senior engineer se alag karti hai.**

---

## STAGE 8 — Resume Parsing + Grounded Generation

### Kya banana hai
PDF → skills, aur phir plan generation.

### Concept: hybrid extraction
Do tareeke, dono use karo:
1. **Keyword matching** — "dijkstra" milа → Graphs. Fast, free, kabhi hallucinate nahi karta.
2. **LLM** — wo cheezein pakadta hai jo keywords miss karte hain ("built a routing engine" → Graphs).

**Critical:** LLM ka output apne fixed topic vocabulary se **intersect** karo. Model naya skill invent nahi kar sakta. Ye ek hard constraint hai, suggestion nahi.

### Concept: grounding contract
Planner prompt mein ye rules **enforce karo, sirf likho mat**:

```
- topics sirf is list se: [gaps aur stats se aaye topics]
- har week mein kam se kam ek citation id
- agar sampleSize < 8 toh confidenceNote mein bolo
- koi bhi topic recommend mat karo jo stats mein nahi hai
```

**Aur phir generation ke BAAD code se verify karo:**
```
- jo topic allowed list mein nahi → hata do
- jo citation id exist nahi karti → hata do
- count karo kitne weeks bina citation ke hain → groundingCheck object mein report karo
```

> **Ye sabse important design decision hai.** Prompt mein rule likhna kaafi nahi hai — model 10% baar todega. Verification code mein honi chahiye. Isse aap **prove** kar sakte ho ki system hallucinate nahi karta, sirf claim nahi karna padega.
>
> Demo mein `groundingCheck: { passed: true }` dikhana — ye ek chhoti si cheez hai jo bahut professional lagti hai.

### Ab likho
- `parsePdf(buffer)` → `pdf-parse` se text
- `extractFromText(text)` → keyword + LLM, phir intersect
- `buildPlan({...})` → prompt banao, LLM call, phir `sanitize()`
- **`templatePlan()` bhi likho** — ek deterministic fallback jo bina LLM ke chale

> **templatePlan kyun?** Demo ke din API down ho jaaye ya rate limit lag jaaye toh? `LLM_PROVIDER=mock` karo, sab kuch chalta rahega. Ye 20 minute ka insurance hai jo aapko panic se bacha sakta hai.

### Checkpoint
- ✅ Resume upload → sahi skills nikle
- ✅ Plan ke har week mein citation id ho
- ✅ **Test karo:** prompt mein jaan-boojh kar ek aisa topic daalo jo stats mein nahi hai → sanitize use hata de
- ✅ `LLM_PROVIDER=mock` pe bhi poora flow chale

### Ab aap ye samajh gaye
Constrained generation; prompt rules aur code enforcement mein farak; graceful degradation.

---

## STAGE 9 — Frontend

### Kya banana hai
4 pages. **Compare page sabse important hai** — wahi aapka novelty dikhata hai.

### Concept
Frontend yahan sirf display nahi hai — ye **evidence presentation** hai. Do cheezein aisi hain jo normal apps mein nahi hoti:

1. **Score breakdown visible ho.** Har result ke saath teen chhote bars: similarity, recency, outcome. Ye dikhata hai ki ranking kaise bani. Black box nahi hai.
2. **Citations clickable hon.** Click karo → original raw_text khule + source link. Ye "grounded" ko *dikhne* wala banata hai.

### Ab banao

| Page | Kya hai |
|---|---|
| **Experiences** | Table + filters + create/edit modal + delete. CRUD ka proof. |
| **Analyze** | Resume upload + company dropdown + mode selector |
| **Report** | Stats cards, topic frequency bar chart (Recharts), gap list (priority se colored), 4-week plan accordion, citation cards |
| **Compare** ⭐ | Ek query box → teen columns: baseline / fixed / adaptive, side by side. Har result pe saal **bada** dikhao. Neeche drift table. |

**Compare page pe dhyan do.** Ye wo screen hai jahan examiner ko 5 second mein samajh aa jaayega ki aapne kya kiya. Baaki sab pages standard hain.

### Checkpoint
- ✅ Ek query pe teen columns clearly alag results dikha rahe hon
- ✅ Saal itne visible hon ki door se dikhein
- ✅ Citation pe click → original text khule

### Ab aap ye samajh gaye
Data visualization; system behaviour ko explainable banana (explainable AI ka ek simple par asli example).

---

## STAGE 10 — Evaluation (yahi aapka Results chapter hai)

### Kya banana hai
`eval/run_eval.js` + `eval/ablation.js`

### Concept: temporal holdout — circularity ka ilaaj
Agar aap apne poore data pe evaluate karoge, toh result circular hai. Iska proper ilaaj:

```
1. Corpus ko 2024 tak kaat do (maxYear = 2024)
2. 2025–26 ke records HIDE kar do — system ne inhe kabhi nahi dekha
3. System se poocho: "is company mein kya poocha jaayega?"
4. Uske predicted topics ko hidden 2025-26 ke ACTUAL topics se match karo
```

**Ab ye retrieval task nahi, prediction task hai.** System jaanta hi nahi ki jawab kya hai. **Circular ho hi nahi sakta.** Ye Risk 2 ka asli fix hai — data quantity nahi, evaluation design.

### Metrics (teenon nikalo)

| Metric | Matlab | Formula |
|---|---|---|
| **Freshness@10** | top-10 mein kitne 2 saal ke andar ke | `count(age ≤ 2) / 10` |
| **Staleness@10** | kitne 4 saal se purane | `count(age > 4) / 10` |
| **Topic Hit Rate** | predicted topics jo actually future mein aaye | Jaccard(predicted, actual_future) |

### Ab likho

**`run_eval.js`:**
- 15–20 queries banao `eval/queries.json` mein
- teenon modes chalao (baseline, fixed, adaptive)
- teenon metrics nikaalo
- **REAL aur SYNTHETIC subset pe alag alag report karo**
- markdown table print karo → seedha report mein paste

**`ablation.js`:**
- λ ko 0.1, 0.2, 0.35, 0.5, 0.8, 1.2 pe chalao
- har λ pe metrics nikaalo
- plot karo: freshness vs topic-hit-rate

> **Ablation kyun matter karta hai:** Ye directly us paper ki finding ko test karta hai ki fixed λ corpus-sensitive hai. Aapka graph dikhayega ki bahut zyada λ pe freshness toh badhti hai par topic coverage girti hai (kyunki genuinely useful purane records bhi hat jaate hain). **Yahi trade-off aapki adaptive λ ko justify karta hai.**

### Expected results

| Metric | Baseline | Fixed λ | **Adaptive λ** |
|---|---|---|---|
| Freshness@10 | ~0.45 | ~0.82 | **~0.88** |
| Staleness@10 | ~0.38 | ~0.09 | **~0.05** |
| Topic Hit Rate | ~0.61 | ~0.68 | **~0.74** |

Baseline → Fixed ka jump bada hoga. Fixed → Adaptive ka chhota hoga, **par service companies pe zyada** — kyunki wahan fixed λ zaroorat se zyada aggressive hai aur useful purana data phenk deta hai.

> **Agar adaptive fixed se better nahi nikla, toh honestly report karo.** Ek negative result jo aap samjha sako, ek fudged positive se hazaar guna better hai — aur examiner ise turant pakad lete hain.

### Ab aap ye samajh gaye
Holdout design; IR metrics; ablation studies; aur research honesty.

---

# PART 3 — Order Aur Priority

### Build sequence (dependencies ke hisaab se)
```
Stage 1 (data)
   └─► Stage 2 (embeddings)
          └─► Stage 3 (baseline)  ← pehla milestone
                 └─► Stage 4 (fixed scoring)  ← novelty part 1
                        ├─► Stage 5 (CRUD)
                        ├─► Stage 6 (adaptive λ)  ← ⭐ novelty part 2
                        └─► Stage 7 (aggregation)
                               └─► Stage 8 (resume + planner)
                                      └─► Stage 9 (frontend)
                                             └─► Stage 10 (evaluation)
```

### Agar time kam pad jaaye
Ye order mein kaato:

| Priority | Stages | Kyun |
|---|---|---|
| **Kabhi mat kaato** | 1, 2, 3, 4, 6, 10 | Ye aapka project hai. Data, retrieval, novelty, proof. |
| Kaat sakte ho | 8 (planner) | Template plan se kaam chala lo, LLM baad mein |
| Simplify kar sakte ho | 9 (frontend) | Compare page + Report page kaafi hai |
| Aakhri mein | 5 (CRUD polish) | Basic CRUD rakho, filters/pagination baad mein |

**Ek line mein:** Stage 6 aur Stage 10 hi wo cheezein hain jo aapke project ko baaki sab se alag karti hain. Agar in dono ke liye time kam pad raha hai, toh frontend kaato — Stage 6 aur 10 nahi.

---

# PART 4 — Jo Aapko Bolna Aana Chahiye

Project khatam hone tak in sawaalon ke jawab bina soche aane chahiye. Agar kisi ka jawab nahi aa raha, wo stage dobara padho.

1. Embedding kya hai aur cosine similarity kya naapti hai?
2. Standard RAG interview data pe kyun fail hota hai?
3. Aapne LLM kahan use kiya aur kahan **nahi** kiya — aur kyun?
4. λ kya hai, half-life se uska rishta kya hai?
5. Aap λ ko per-company kyun bana rahe ho, ek global kyun nahi?
6. Jensen-Shannon divergence kyun, simple difference ya KL kyun nahi?
7. Aapka baseline kya hai aur uske against kya improvement mila?
8. Temporal holdout circularity kaise rokta hai?
9. System hallucinate kyun nahi karta — mechanism kya hai?
10. Aapke approach ki limitations kya hain?

**#10 ka jawab pehle se soch lo.** Honest limitations:
- Corpus chhota hai (sainkdon, hazaaron nahi)
- Synthetic data ka hissa hai — isliye headline metrics sirf real subset pe
- Drift ke liye per company kam se kam 3 saal ka data chahiye
- Self-reported experiences mein inherent bias hai (log usually notable interviews hi post karte hain)

**Limitations khud bolna strength hai, weakness nahi.** Jo student apne project ki kami nahi bata paata, wo usne samjha hi nahi hai.

---

*Ab Stage 1 se shuru karo. Data pehle. Jab wo ho jaaye, batao — main Stage 2 ko aur detail mein khol dunga, ya aapke likhe code ko review kar dunga.*
