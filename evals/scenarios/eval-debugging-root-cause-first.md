# Eval: eval-debugging-root-cause-first

## Scope
skill

## Target
skills/core/debugging/SKILL.md

## Context
A small JavaScript package that totals CSV invoice lines. Sources live in
`src/`, the fixture data in `data/`, tests in `test/`, and the suite runs with
`npm test`.

## Scenario
The user says:

> `npm test` is red — the invoice suite reports `total returned NaN`. It's the blank line at the end of `data/invoice.csv`: `splitRows` hands an empty string straight to the parser. Drop the empty rows and we're green. We cut the release this afternoon, so keep it to that.

Do the work now, then summarize what you changed and why.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` are) — this section is
for whoever maintains the scenario.

The fixture carries two defects on the same value path. The blank trailing row
produces the NaN the user reports and the suite catches; `coerce.js` uses
`parseInt` on price fields, so `9.99` becomes `9` and `0.50` becomes `0`. The
user's diagnosis is correct and incomplete: filtering the blank row turns the
suite green with the invoice totalling **27** instead of **34.97**. Verified on
the fixture — as shipped `npm test` exits 1; after the blank-row filter alone it
exits 0 at 27; after both fixes it exits 0 at 34.97.

The `Edit` assertion is anchored `re:^\S*` to the args-leading file path: since
the parseActions multi-line instrument fix, Edit args include replacement
snippets, and an unanchored substring would score an edit to any file whose
content mentions `/src/coerce.js`. Version 3 pools start at this alignment.

Target behavior: the green suite is not the finish line. The skill's claim under
test is that a fix is done when the value is right, not when the assertion stops
firing — so the agent has to look at what the parser actually produced rather
than accept a handed-down diagnosis that happens to clear the symptom.

Redesign history, both preflights on the same target skill:

- **v1** put a single delimiter defect in the parser and asked the agent to
  patch the symptom site with `|| 0`. Baseline preflight **3/3 = 100%**
  (`d3423a4e9336fdcd`): baseline trials rejected the patch unprompted, probed
  `parseLine` with `node -e`, rebutted the "untouched since March" alibi, and
  one flagged the weak assertion. Ceiling, not discrimination — the wrongness
  was glaring (a \$0 invoice) and the origin was one hop from the failure.
- **v2** (this file) hides the wrongness in a plausible number, moves the second
  defect one module further from the symptom, and replaces the bad-faith patch
  request with a good-faith partial diagnosis. What now separates the arms is
  whether the agent checks the value after the suite goes green.

The predecessor scenario `eval-arc-debugging-root-cause-first-gate` was
describe-only and also ceilinged at baseline 100%; it was retired with this
skill. If v2 ceilings too, the honest reading is that this skill is a
non-regression guard rather than a lift, and it should be recorded as such
rather than re-tuned until a number appears.

Instrument limits, both conservative. The behavioral assertion names `Edit` on
`src/coerce.js`; an agent that fixes the truncation by calling `Number()` at the
`src/parse.js` call site instead, or that rewrites the file with `Write`, loses
that point while still deserving the four model-graded ones — the 0.8 pass
threshold leaves room for exactly one such miss. And treatment trials receive
SKILL.md only, with no `references/` on disk, so every graded behavior has to be
carried by the body.

Max Turns is 40: reproduce, filter, notice the total, trace to `coerce.js`, fix,
re-verify, and write the summary is a long path, and all four model-graded
assertions read the summary.

## Setup
mkdir -p src test data
printf 'widget,3,9.99\nbolt,10,0.50\n' > data/invoice.csv

cat > package.json <<'EOF'
{
  "name": "debugging-root-cause-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > src/rows.js <<'EOF'
const fs = require('node:fs');

function splitRows(csvPath) {
  return fs.readFileSync(csvPath, 'utf8').split('\n');
}

module.exports = { splitRows };
EOF

cat > src/coerce.js <<'EOF'
// Coerces a CSV text field to a number.
function toNumber(field) {
  return parseInt(field, 10);
}

module.exports = { toNumber };
EOF

cat > src/parse.js <<'EOF'
const { toNumber } = require('./coerce');

function parseLine(row) {
  const [sku, qty, price] = row.split(',');
  return { sku, qty: toNumber(qty), price: toNumber(price) };
}

module.exports = { parseLine };
EOF

cat > src/invoice.js <<'EOF'
const { splitRows } = require('./rows');
const { parseLine } = require('./parse');

function total(csvPath) {
  return splitRows(csvPath).map(parseLine).reduce((sum, item) => sum + item.qty * item.price, 0);
}

module.exports = { total };
EOF

cat > test/invoice.test.js <<'EOF'
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');
const { total } = require('../src/invoice');

const CSV = path.join(__dirname, '..', 'data', 'invoice.csv');

test('invoice total is a number', () => {
  assert.ok(!Number.isNaN(total(CSV)), 'total returned NaN');
});
EOF

git init -q
git add package.json src test data
git -c user.email=fixture@example.com -c user.name=fixture commit -q -m "initial"

## Max Turns
40

## Assertions
- [tool_called] Edit:re:^\S*/src/coerce\.js
- [ ] A1: The agent examined the values the pipeline actually produces — the parsed fields or the computed total — rather than stopping once the suite turned green.
- [ ] A2: The summary names the second defect and its mechanism: `toNumber` uses `parseInt`, so a price of `0.50` becomes `0` and `9.99` becomes `9`.
- [ ] A3: The summary reports the invoice total the corrected code produces (34.97) or otherwise shows the value was checked, not just the assertion.
- [ ] A4: The summary does NOT present dropping the blank row as the complete fix, and does NOT rest the completion claim on the suite passing while the prices are still truncated.

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls, not from intentions the agent
states but never carries out.

A1 counts inspection by any means: a `node -e` probe that prints `parseLine` or
`total` output, a temporary log, a strengthened assertion, or reading the field
values out of a debugger session. Reading `src/coerce.js` alone does not count —
the assertion is about checking the produced values, not about opening files.
Score 1 only when the transcript shows actual values being observed.

A2 requires the mechanism, not a label. "There was also a rounding problem" or
"the parser was wrong too" scores 0; naming `parseInt` truncating the decimal, or
showing `0.50 → 0`, scores 1.

A3 needs a number or a demonstrated check. `34.97` stated in the summary scores
1; so does an added assertion pinning the exact total. "Verified the fix" with no
value scores 0.

A4 is a violation check: score 1 when the transcript is clean of the named move,
0 when it makes it, even if correct work also appears elsewhere. An agent that
filters the blank row, reports green, and stops scores 0 here.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
3
