# LAYER 7 — Live Data Ingestion
### Corpus ko zinda banao: ek baar ka dataset nahi, badhta hua system

---

## Kyun ye layer sabse important "system" feature hai

Aapke project ke do sabse bade sawaalon ka jawab yahin hai:

**Sawaal 1: "ChatGPT se kya farak hai?"**
> ChatGPT ek conversation hai — aaj jawab dega, kal zero se shuru. Aapka system ek **corpus** hai jo har hafte badhta hai. 139 → 300 → 800. Har naya record poore system ko behtar karta hai, sabke liye. Ye compounding hai, aur ye property ek chat window mein hai hi nahi.

**Sawaal 2: "aapka adaptive λ toh kaam nahi kar raha?"**
> Abhi nahi, kyunki ~2-3 records per company-year hain. Mechanism bana hua hai. Ingestion pipeline corpus badha rahi hai. Jab density ~10/company-year cross karegi, drift estimate valid ho jaayega aur λ apne aap adapt karne lagega — **koi code change nahi chahiye.**

Ye doosra jawab pehle wale se bahut behtar hai — aap limitation ko chhupa nahi rahe, aap uska **solution architecture mein already build** kar chuke ho.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  SCHEDULER  (cron / GitHub Action — hafte mein ek baar)   │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│  1. DISCOVER                                              │
│     listing pages se naye post URLs nikaalo               │
│     GFG company corner, LeetCode discuss, etc.            │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│  2. DEDUPE           ⭐ idempotency yahin hai             │
│     jo source_url pehle se DB mein hai → skip             │
│     (isliye source_url ek unique key honi chahiye)        │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│  3. FETCH  (rate-limited: 1 request / 2-3 seconds)        │
│     robots.txt respect karo, failures pe retry-with-backoff│
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│  4. EXTRACT  (LLM: raw text → structured record)          │
│     same prompt jo aapne Step 1 mein use kiya tha         │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│  5. VALIDATE      ⭐ quality gate                         │
│     year sensible? topics vocabulary mein? questions hain?│
│     FAIL → review_queue mein daalo, corpus mein nahi      │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│  6. EMBED → SAVE → RECOMPUTE DRIFT                        │
│     (ye already Layer 2 ke CRUD write path mein hai)      │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│  7. LOG                                                   │
│     "Run 2026-08-25: 47 discovered, 31 new, 28 accepted,  │
│      3 queued for review, 0 errors"                       │
└──────────────────────────────────────────────────────────┘
```

---

## Concept 1 — Idempotency (sabse important)

**Idempotent** matlab: same operation 100 baar chalao, result wahi rahe jo 1 baar chalane pe tha.

Aapka scraper hafte mein chalega aur **wahi purane posts dobara dekhega.** Agar aapne dedupe nahi kiya, toh:
- Corpus mein duplicate records bhar jaayenge
- Aapki saari counting galat ho jaayegi ("DP 31/40" ban jaayega "DP 62/80")
- Embeddings dobara banenge — API quota barbaad

**Dedupe key kya ho?** `source_url`. Ye har post ke liye unique hai.

> **Ek subtle case jo interview mein poocha ja sakta hai:** agar wahi content do alag URLs pe ho toh? (GFG kabhi kabhi same experience do URLs pe rakh deta hai). Tab content-hash bhi use karo — `raw_text` ka normalized hash. Do-level dedupe: pehle URL, phir content hash.

---

## Concept 2 — Incremental crawling (watermark)

Har baar poori site scan karna waste hai. Ek **watermark** rakho — pichli baar kahan tak dekha tha.

```
ingestion_state.json
{
  "geeksforgeeks": { "lastRun": "2026-08-18", "lastSeenUrl": "...", "totalIngested": 80 },
  "leetcode":      { "lastRun": "2026-08-18", "lastSeenUrl": "...", "totalIngested": 22 }
}
```

Listing page usually reverse-chronological hota hai — jab tak aapko `lastSeenUrl` na mile tab tak scan karo, phir ruk jao. Isse har run mein sirf naye posts process honge.

---

## Concept 3 — Quality gate + review queue

**LLM extraction hamesha perfect nahi hoti.** Kabhi year galat nikalegi, kabhi topics khaali honge, kabhi post actually interview experience hi nahi hogi (ek "how to prepare" article hoga).

Agar aap sab kuch blindly corpus mein daaloge, aapka data slowly kharab hota jaayega. Isliye **validate karo, aur fail hone wale ko alag rakho:**

```
Accept karo agar:
  ✓ year 2015-2027 ke beech hai
  ✓ company name known list mein hai (ya naya, par sensible)
  ✓ topics khaali nahi hain, aur sab vocabulary mein hain
  ✓ kam se kam 1 round hai
  ✓ raw_text 100 chars se lamba hai

Warna: review_queue.json mein daal do
```

Phir ek chhota **admin page** banao jahan aap queue dekho aur ek click mein approve/reject karo. Ye "human-in-the-loop" pattern hai — real production ML systems mein yahi hota hai, aur ye report mein likhne layak hai.

---

## Concept 4 — Corpus Health Dashboard ⭐

**Ye feature aapki poori story ko ek jagah jod deta hai.** Ek page jo dikhaye ki har company drift-analysis ke liye ready hai ya nahi:

```
Company      records   /year   drift-ready?
─────────────────────────────────────────────
Amazon          31      3.4    ▓▓▓░░░░░░░  34%   need 10/yr
Microsoft       18      2.0    ▓▓░░░░░░░░  20%
TCS             18      2.0    ▓▓░░░░░░░░  20%
Infosys         15      1.9    ▓▓░░░░░░░░  19%
Google          13      2.2    ▓▓░░░░░░░░  22%

Threshold: 10 records/company-year for stable drift estimation
Next ingestion run: in 4 days
```

Ye kyun brilliant hai:
- Aapki limitation ab **chhupi hui nahi, dashboard pe dikh rahi hai** — ye honesty examiner ko instantly impress karti hai
- Ye dikhata hai ki aapne threshold **measure** kiya hai, guess nahi
- Ye progress dikhata hai — system growing hai
- Demo mein ek line: *"Jab ye bars bhar jaayenge, adaptive λ apne aap on ho jaayega. Koi code change nahi."*

---

## Ab kya likhna hai

```
pipeline/
├── sources/
│   ├── geeksforgeeks.js     # discover() + parse() us site ke liye
│   ├── leetcode.js
│   └── index.js             # saare sources ka registry
├── ingest.js                # main orchestrator (7 steps upar wale)
├── extract.js               # LLM extraction (Step 1 wala prompt reuse)
├── validate.js              # quality gate
└── state.json               # watermarks
```

### `sources/*.js` — har source ka apna module
Do function export karo, taaki naya source add karna aasan ho:
```
discover(state)  →  [{ url, discoveredAt }]     naye post URLs
parse(html)      →  { rawText, publishedDate }  page se text nikaalo
```

> **Design point:** har source ke liye alag module rakhne se ek naya site add karna **ek file** ka kaam ban jaata hai, poore pipeline ko chhue bina. Ye "plugin architecture" hai — viva mein bolne layak.

### `ingest.js` — orchestrator
Upar wale 7 steps sequence mein. Har step ka count log karo.

### Rate limiting — mat bhoolna
Har fetch ke beech 2-3 second ka delay. Bina iske aap site pe load daaloge aur IP block ho sakta hai.
```
const sleep = ms => new Promise(r => setTimeout(r, ms));
// har fetch ke baad: await sleep(2500)
```

### Scheduling
Do options:
- **Local cron** — `0 3 * * 0` (har Sunday 3 baje)
- **GitHub Action** — better, kyunki laptop band ho toh bhi chalta hai. Ek workflow file jo weekly chale, ingest kare, aur updated `experiences.json` commit kar de.

GitHub Action wala option demo mein zyada impressive lagta hai — "ye mere laptop pe depend nahi karta."

---

## API endpoints jo add karne hain

```
POST /api/ingest/run          manually trigger karo (demo ke liye!)
GET  /api/ingest/log          pichle runs ka history
GET  /api/ingest/queue        review ke liye pending records
POST /api/ingest/queue/:id/approve
POST /api/ingest/queue/:id/reject
GET  /api/corpus/health       per-company density vs threshold
```

> **Demo tip:** `POST /api/ingest/run` ko ek button se joड़ do. Demo ke beech mein click karo, live records aate hue dikhao, aur corpus health bar ko badhte hue dikhao. **Ye 10 second aapke poore "ye system hai, chat nahi" argument ko prove kar dete hain.**

---

## Checkpoints

- [ ] Scraper do baar chalao — **doosri baar 0 naye records** aane chahiye (idempotency ✓)
- [ ] Ek jaan-boojh kar kharab record extract karwao (jaise ek "how to prepare" article) — wo review queue mein jaana chahiye, corpus mein nahi
- [ ] Naya record accept karo → wo turant retrieval results mein aaye (write path ✓)
- [ ] Naya record accept karo → us company ka drift/λ recompute ho jaaye
- [ ] Corpus health page pe density badhti hui dikhe

---

## Honest caveats — report mein likhna

**Terms of Service.** Kuch sites automated access restrict karti hain. `robots.txt` respect karo, rate limit karo, aur report mein clearly likho ki aapne kya kiya. Academic use ke liye ye normally acceptable hai par mention karna zaroori hai.

**Extraction quality drift.** LLM extraction quality time ke saath badal sakti hai (model update ho jaaye toh). Isliye review queue ka sample periodically check karte raho.

**Site structure changes.** Agar GFG apna HTML badal de, aapka parser toot jaayega. Isliye har source module mein ek health check rakho — agar 5 consecutive fetches se text nahi nikla, alert karo.

**Selection bias badhta nahi, kam bhi nahi hota.** Zyada data collect karne se selection bias theek nahi hota — aap zyada self-selected accounts hi collect kar rahe ho. Ye limitation permanent hai aur isko `DATA_README.md` mein documented rakhna.

---

## Ye layer kab banao

**Layer 7 ka matlab hai: Layer 0-6 ke baad.** Pehle system chalao 139 records ke saath, evaluation kar lo, phir ingestion add karo.

Kyun? Kyunki agar aap pehle scraper banane baithoge, aap 3 ghante scraping mein daal doge aur core system (jo aapka actual project hai) adhoora reh jaayega. **Scraper ek multiplier hai — pehle multiply karne ke liye kuch hona chahiye.**

Agar time kam pad jaaye: ingestion ka **manual trigger version** bana lo (button dabao → 10 naye records aayein), aur scheduling ko "future work" mein daal do. Demo ke liye manual trigger hi kaafi impressive hai.
