
---

# Extraction Audit — completed

20 records ka random sample liya gaya aur har record ka **original source page
dobara fetch karke** extraction ke against verify kiya gaya. 20/20 pages
successfully fetch huye.

## Results

| Metric | Score |
|---|---|
| Year accuracy | **95.0%** (19/20) |
| Outcome accuracy | **95.0%** (19/20) |
| Rounds accuracy | **95.0%** (19/20) |
| Topic precision | **93.1%** (108/116) |
| Topic recall | **95.6%** |
| **F1** | **94.3%** |

> **Report ke liye:** *"Extraction was validated on a 20-record manual audit against
> the original source pages: year accuracy 95.0%, topic precision 93.1%, topic
> recall 95.6% (F1 94.3%)."*

## Kya galtiyan mili

**Teen hard field errors:**

1. `gfg_amazon_2025_01` — **year**. Title/URL mein "October 2025" tha par page ki
   Last-Updated date 28 Oct 2024 hai. Post apne se ek saal aage ka interview
   describe nahi kar sakta. Extractor ne galat title-year copy kar liya.
   *(Interesting: `gfg_tcs_2024_02` mein extractor ne URL ka "2025" correctly
   ignore kiya kyunki wo graduating batch tha — matlab pipeline title-year vs
   page-date pe consistent nahi hai.)*

2. `prepinsta_pwc_2022_30` — **outcome**. Page kabhi nahi batata ki candidate
   select hua ya nahi, par extraction ne "selected" likh diya. **Ye sabse serious
   error hai — ek fabricated positive outcome.**

3. `gfg_tcs_2026_01` — **rounds**. Post teen rounds label karta hai; extraction ne
   opening introduce-yourself exchange ko alag round gin liya.

**Sabse common error type: topic over-generation** (8 false positives, 6 records mein).
Pattern ye hai ki topic actual question se nahi, context se infer ho gaya:

- "Projects" 3 baar hallucinate hua — ek behavioural "describe your current role"
  ya experience pe based design question ko project walkthrough samajh liya gaya
- "Aptitude" 2 baar infer hua ek OA se jisme quantitative/logical section tha hi nahi
- "OOPs" 2 baar adjacent material se — Java keyword trivia aur HashMap internals

Topic misses (5) kam aur zyada benign the — mostly ek poore round ka subject
chhoot gaya.

## Corrections applied

Saari 15 galtiyan `data/apply_corrections.js` se fix ki gayi hain, har ek ke saath
uska evidence. Audit trail `data/CORRECTIONS.json` mein hai.

```bash
node data/apply_corrections.js   # idempotent — dobara chalane pe kuch nahi badalta
```

## Is audit se ek aur cheez mili

Audit ne `verify_all.sh` mein ek **bug** bhi pakda: `node x.js | tail` ka exit code
`tail` ka hota hai, isliye `set -e` failures pakad nahi raha tha aur corpus
validation silently skip ho rahi thi. `set -o pipefail` add kiya gaya.
