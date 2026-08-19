#!/bin/bash
# verify_all.sh — saare checks ek saath. Demo se pehle chalao.
#
# NOTE: `set -o pipefail` zaroori hai. Bina uske `node x.js | tail` ka exit
# code tail ka hota hai (hamesha 0), aur script fail hone pe bhi chalta rehta
# hai. Ye bug is script mein pehle tha — audit ne pakda.
set -e
set -o pipefail
cd "$(dirname "$0")"

echo "═══ 1/5  corpus validation ═══"; node data/check.js | tail -6
echo; echo "═══ 2/5  unit tests ═══";    node eval/unit_tests.js | tail -3
echo; echo "═══ 3/5  CRUD ═══";          node eval/checkpoint_layer2.js | tail -3
echo; echo "═══ 4/5  intelligence ═══";  node eval/checkpoint_layer3.js | grep -v "^POST\|^GET\|^DELETE\|^PUT" | tail -3
echo; echo "═══ 5/7  explainability ═══";node eval/explainability_tests.js | tail -3
echo; echo "═══ 6/8  freshness preference ═══";node eval/freshness_preference_tests.js | tail -3
echo; echo "═══ 7/8  evidence quality ═══";node eval/evidence_quality_tests.js | tail -3
echo; echo "═══ 8/8  evaluation ═══";    node eval/run_eval.js | sed -n '/A. RETRIEVAL/,/companies improved/p'
echo; echo "✅ sab checks complete"
