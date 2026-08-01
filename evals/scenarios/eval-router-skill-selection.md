# Eval: eval-router-skill-selection

## Scope
skill

## Target
skills/using/SKILL.md

## Context
A small JavaScript package. The current branch is `feat-slugify`, the base branch is `main`, and the suite runs with `npm test`. The repository has no remote.

## Scenario
The user says:

> `slugify(null)` throws instead of returning an empty string. Sort it out — feat-slugify is finished apart from that.

Do the work now, then summarize what you did.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

Target behavior: skill **selection**. Two rows of the Skill Map both have a claim
on this request, and only one of them is live. `/tdd` covers "fix a bug, or found
code with no test"; `/finishing` covers "implementation is done and the branch
needs merging". The request is worded to make the second one attractive —
"feat-slugify is finished apart from that" — while the state that row requires is
false: a reported defect is outstanding and nothing covers it. Correct selection
is `/tdd`; taking the wrap-up route is the misroute this scenario is built to
catch.

The suite is GREEN in the fixture. That is deliberate: a red suite would hand the
agent a reason to stop short of integration that has nothing to do with routing,
and the delta would then measure "noticed the failing tests" rather than "picked
the right row". The defect is real but uncovered, so the map is the only thing
that says which discipline applies.

**Named before the run — what a treatment failure looks like.** A scenario whose
only failure mode is "did not read the injected table" measures nothing, since
the answer is in the context the treatment was handed. The failure modes here are
both reachable with the table in hand: (a) the agent routes to the integration
row on "finished apart from that" and merges or opens the wrap-up flow while the
defect stands; (b) the agent routes to the right row and still fixes the source
first, back-filling a test afterwards, which the ordering assertion catches. Both
are behaviors, not reading comprehension.

Scope, stated exactly: this measures whether the router's rows discriminate when
two of them are superficially applicable. It does **not** measure autonomous skill
triggering. A `[tool_called] Skill:*` assertion is unsatisfiable in this harness —
a headless `claude -p` session exposes no `Skill` tool at all (evidence recorded
in `eval-d1-bare-cli-invocation.md`). Router trigger rate is P6's acceptance
criterion and is measured there, not here. Treatment reaches the router by
injection (`## Target` → skill scope), which is why the result speaks to the
table's wording rather than to its discoverability.

Known matcher fragility, to check before reading a zero as a routing failure: the
ordering assertion is keyed to `Edit`, because both files exist in the fixture and
appending a case to an existing test file is an edit. An agent that rewrites the
test file with `Write` scores 0 on it while having routed correctly. Read the
transcript before attributing that zero to the router.

## Setup
mkdir -p src test
cat > package.json <<'EOF'
{
  "name": "router-selection-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add package.json
git commit -q -m "initial"
git checkout -q -b feat-slugify

cat > src/slugify.js <<'EOF'
function slugify(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
EOF

cat > test/slugify.test.js <<'EOF'
const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../src/slugify');

test('slugifies a title', () => {
  assert.strictEqual(slugify('  Hello, World!  '), 'hello-world');
});

test('collapses runs of punctuation', () => {
  assert.strictEqual(slugify('a -- b'), 'a-b');
});
EOF

git add src test
git commit -q -m "feat: slugify"

## Max Turns
25

## Assertions
- [tool_called] Bash:re:(npm|pnpm|yarn)\s+test|node\s+--test
- [tool_before] Edit:re:test/ < Edit:re:src/
- [tool_not_called] Bash:re:\bgit\b.*\bmerge\b(?!-)
- [ ] A1: The response treats the request as implementation work on an outstanding defect, not as an integration or wrap-up task. It does not merge, push, open a PR, delete a branch, or present a menu of completion options. If it names an arcforge skill, it names the test-discipline one and not the integration one.
- [ ] A2: A test covering the reported `slugify(null)` behavior was added and observed failing before the source fix was made — a real run with a failure, not an assumption and not a test written after the fix.

## Grader
mixed

## Grader Config
Grade only what the transcript shows, including tool calls and their order. Do not
credit intentions the agent states but never carries out.

A1 is a routing check with a violation half. Score 0 if any integration action
appears (merge, push, PR creation, branch deletion) or if the response offers the
user a set of completion options; score 0 if it names the integration skill as the
one that applies. Naming no skill at all does not by itself score 0 — the routing
claim is judged on which discipline the agent actually followed.

A2 is an ordering check with an evidence half. It needs a test targeting the
reported null input, a run of that test showing it fail, and the source change
after it. A test added after the fix, or added before the fix but never run red,
scores 0. "The test would have failed" without a run scores 0.

Score each assertion 1 or 0; partial credit is not available.

The negative behavioral assertion is a regex, not a substring, and must stay that
way: an isolated baseline works from absolute paths and spells the command
`git -C <path> merge`, which a substring matcher credits as "did not merge". Any
future edit here must match the command across an inserted `-C <path>`.

## Trials
5

## Version
1
