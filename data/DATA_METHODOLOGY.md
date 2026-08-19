# Data Collection Methodology
### Phase 0 — exactly what was done, and how to describe it in your report

---

## Short version

Corpus **traditional scraper se nahi bana.** Ye ek **LLM-mediated retrieval-and-extraction pipeline** hai:

```
search engine se URLs discover
      → har page individually fetch (markdown mein convert)
      → LLM ne page padh kar structured JSON banaya
      → schema + vocabulary validation
      → dedupe + merge
```

Ye distinction report mein likhna zaroori hai — kyunki ye classic web scraping (CSS selectors, HTML parsing) se method-wise alag hai, aur uske apne fayde aur nuksaan hain.

---

## Step-by-step procedure

### Step 1 — Discovery (search-based, not crawl-based)

Search queries **company × year** ke combination pe banayi gayi:

```
site:geeksforgeeks.org amazon interview experience SDE 2019
site:geeksforgeeks.org amazon interview experience SDE 2021
site:geeksforgeeks.org amazon interview experience SDE 2023
site:leetcode.com/discuss adobe india interview experience
site:prepinsta.com accenture interview experience 2022
...
```

**Saal ko explicitly vary karna sabse important design decision tha.** Agar sirf `"amazon interview experience"` search hota, toh search engine sabse popular/recent results dikhata aur corpus mein sirf 2024-26 ke records aate. Us case mein recency weighting ka koi effect measurable hi nahi hota — yaani poora project demo mein invisible ho jaata.

> **Report ke liye:** "Discovery was stratified by year to ensure temporal spread, since search ranking naturally favours recent content."

### Step 2 — Fetch

Har discovered URL ko **individually fetch** kiya gaya. Fetching layer:
- HTTP ko HTTPS mein upgrade karti hai
- `robots.txt` respect karti hai — disallowed paths pe error return karti hai, bypass nahi
- Page ko markdown mein convert karti hai (HTML tags, nav, ads hat jaate hain)
- Cross-host redirects follow nahi karti (blindly)
- 15-minute response cache rakhti hai

**Koi bhi record search snippet se nahi banaya gaya.** Har `source_url` ek page hai jo actually fetch hua.

### Step 3 — Extraction (LLM, not parser)

Fetched markdown ko ek LLM ne padha aur fixed schema ke against structured JSON return kiya.

Prompt mein teen cheezein enforce ki gayi:

**(a) Controlled vocabulary** — topics sirf 18 fixed strings se:
```
DP, Arrays, Strings, Graphs, Trees, LinkedList, Recursion, Greedy,
SlidingWindow, BinarySearch, OOPs, DBMS, OS, Networks, SystemDesign,
Aptitude, Behavioral, Projects
```
Bina iske "DP", "Dynamic Programming", "dp" teen alag topics ban jaate aur saari counting toot jaati.

**(b) Topic mapping hints** — question name se topic tak ka explicit mapping:
```
"Trapping Rain Water"  → Arrays
"Rotten Oranges"       → Graphs
"Coin Change"          → DP
"Explain polymorphism" → OOPs
```
Ye mapping subjective hai (Rotten Oranges ko koi Arrays bhi bol sakta hai) par **consistent** hai — ek hi interpretation poore corpus pe lagi.

**(c) No-fabrication rules** — ye sabse important thi:
```
- Sirf wahi record karo jo page mein actually likha hai
- Year na mile → post discard karo, guess mat karo
- Question titles na mile → likho "2 medium questions, titles not stated"
  (LeetCode ke naam invent mat karo)
- Outcome na mile → "unknown"
- source_url wahi ho jo actually fetch hua
```

**Discard ki gayi posts (honesty ka evidence):**
- ~5 Wipro/Tech Mahindra accounts — year nahi tha
- 3 LeetCode posts (Google SDE-2, Amazon SDE-1, Oracle IC2) — year nahi tha
- Ek "Set 211" GFG post — 2016 ka nikla, window ke bahar
- Ek "Amazon ML Intern" post — publication date title se contradict kar rahi thi
- PrepInsta ka IBM page — explicitly composite/illustrative account tha, real candidate nahi
- InterviewBit ke saare pages — generic question banks the, dated candidate accounts nahi

### Step 4 — Parallelisation

Kaam 5 independent workers mein baanta gaya, har ek ka apna scope:

| Worker | Scope | Records |
|---|---|---|
| 1 | Amazon (GFG) | 27 |
| 2 | Google + Microsoft (GFG) | 26 |
| 3 | TCS + Infosys (GFG) | 27 |
| 4 | LeetCode Discuss + Reddit + Medium | 28 |
| 5 | PrepInsta + AmbitionBox + others | 35 |

Har worker ko same schema, same vocabulary, same rules diye gaye — taaki output consistent rahe.

### Step 5 — Dedupe

`source_url` pe exact-match dedupe. **4 duplicates** mile aur hate gaye.

> Layer 7 ke liye note: production ingestion mein URL ke saath **content-hash** dedupe bhi chahiye, kyunki kabhi kabhi same content do URLs pe hota hai.

### Step 6 — Validation

Har record pe automated checks:
- `year` 2000–2027 ke beech, integer
- `month` 1–12 ya null
- `outcome` teen allowed values mein
- `topics` non-empty aur poori tarah vocabulary ke andar
- round-level topics bhi vocabulary mein
- unique `id`

**Result: 0 schema errors.**

---

## Sources jo nahi mil paaye (aur kyun)

| Source | Reason |
|---|---|
| Glassdoor | Automated fetching block karta hai |
| AmbitionBox | Ek fetch ke baad rate-limit / timeouts |
| Coding Ninjas (Naukri Code360) | JavaScript-rendered SPA — fetch sirf loading shell deta hai |
| Reddit | Search mein r/developersIndia ke interview-experience threads surface nahi hue |
| InterviewBit | Sirf generic question banks, dated candidate accounts nahi |
| `prepinsta.com/feed/*` | robots.txt disallowed (main paths allowed the) |

Kisi bhi blocked source ko bypass karne ki koshish nahi ki gayi.

---

## Is method ke fayde aur nuksaan

### Fayde
- **Layout changes se robust** — CSS selectors nahi hain, toh site ka HTML badle toh bhi kaam karta hai
- **Multi-source aasan** — har naye site ke liye alag parser nahi likhna padta
- **Semantic extraction** — "I was asked to find the shortest path in a grid" se `Graphs` nikal aata hai; regex ye nahi kar sakta

### Nuksaan
- **Mehnga** — har page pe ek LLM call. 139 records = 139+ calls.
- **Dheema** — traditional scraper 139 pages seconds mein kar leta, isme minutes lage
- **Non-deterministic** — same page dobara process karo toh thoda alag output aa sakta hai
- **Verify karna zaroori** — extraction accuracy abhi ground truth ke against measure nahi hui *(ye aapka pending kaam hai, neeche dekho)*

---

## ⚠️ Method ki do limitations jo report mein likhni chahiye

### 1. Discovery search-based hai, exhaustive crawl nahi
Records search engine results se mile, na ki har company ke listing page ko poora crawl karke. Matlab **search ranking ka apna bias** corpus mein aa gaya hai — jo posts search mein upar aate hain (zyada linked, zyada popular) unke aane ke chances zyada the.

Ek exhaustive crawl (GFG ke company corner ke saare pages) alag, aur shayad zyada representative, sample deta. **Layer 7 ka ingestion pipeline yahi karega** — isliye wo sirf volume nahi, *coverage bias* bhi improve karega.

### 2. Extraction accuracy abhi verify nahi hui
LLM ne 139 records banaye. Kitne sahi hain — ye abhi measure nahi hua.

**Ye aapka pending kaam hai, aur ye Layer 6 (Verification) ka hissa hai:**

```
1. Random 20 records chuno
2. Har ek ka source_url kholo, khud padho
3. Compare karo: kya extracted topics/questions/year/outcome sahi hain?
4. Nikaalo:
     field-level accuracy  = sahi fields / total fields
     topic precision       = sahi extracted topics / total extracted topics
     topic recall          = sahi extracted topics / actually present topics
```

**Ye 40 minute ka kaam hai aur ye aapke report mein ek number deta hai** — "extraction accuracy: 87% on a 20-record manual audit". Bina iske aapka corpus unvalidated hai, aur examiner ye zaroor poochega.

---

## Aap khud kaise dohra sakte ho (Layer 7 ke liye)

Jab aap apna scraper likhoge, ye **hybrid** approach best hai:

```
1. DISCOVER  — listing page fetch karo, HTML se <a> links nikaalo
               (cheerio / BeautifulSoup — LLM ki zaroorat nahi)
2. FETCH     — page ka HTML lo, boilerplate hatao
               (@mozilla/readability ya trafilatura — LLM nahi)
3. EXTRACT   — clean text LLM ko do, structured JSON lo
               (yahan LLM zaroori hai)
4. VALIDATE  — schema + vocabulary check (plain code)
```

**Kyun hybrid?** Steps 1-2 mein LLM waste hai — wo mechanical kaam hai jo code sasta aur tez karta hai. LLM sirf step 3 pe chahiye, jahan judgement chahiye.

> Ye wahi principle hai jo poore project mein chalta hai: **LLM sirf wahan jahan judgement chahiye. Baaki sab code.**
