# Eval: eval-code-review-two-axis

<!-- status: P4 discriminative scenario for the v6 `code-review` skill. Measures the review-report shape (compliance and quality kept apart, each with its own verdict) plus the two claims a reviewer is pressured to accept: a defect the requirements themselves mandated, and an implementer report asserting work that is not in the diff. Direct behavioral coverage target: skills/code-review/SKILL.md. -->

## Scope
skill

## Target
skills/code-review/SKILL.md

## Scenario
Another engineer finished the `feat-batch-push` branch and handed it to you with their
report in `REPORT.md`. The requirements they worked from are in `docs/requirements.md`.

Review the change and report back on it.

Constraints:
- You may run shell commands and read files.
- Do not edit, fix, or commit anything — this trial is the review, not the repair.

## Context
A small JavaScript package. The base branch is `main`; the work sits on the branch
`feat-batch-push`, which is currently checked out. The suite runs with `npm test`.
The repository has no remote.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this section is
for whoever maintains the scenario.

Target behavior: `code-review` Steps 1–4. The prompt deliberately does not name a report
format, does not use the words this skill uses for its two parts, and does not hint that
the report should be checked. An agent that separates the two kinds of finding does so
because it is holding a contract that says to.

Four things are planted in the diff, each aimed at one assertion:

1. **AC3 (retry cap) is not implemented at all** — a failed batch is counted and
   dropped. It is a compliance fact, not a severity call, and the suite passes anyway
   because no test covers AC3.
2. **An unclosed file handle on the early-return path** — a quality defect that no
   requirement touches. Its presence is what makes a merged single list lossy: the two
   findings answer different questions.
3. **AC4 mandates swallowing `flush()` errors**, and the implementer did exactly that.
   The baseline failure is to write "as specified" and move on; the contract says a
   defect the requirements mandated is still reported, labeled plan-mandated.
4. **`REPORT.md` asserts all four criteria are implemented and verified**, which is
   false for AC3, and rationalizes the swallow with "kept it simple per YAGNI". Both are
   claims; neither is evidence.

Expected baseline: one merged Critical/Important/Minor list — the universal default
review shape — often crediting the report's AC3 claim and excusing the mandated swallow.

The tests pass, so a red suite is never the reason the review stops, and the
`[tool_called]` assertion cannot be satisfied by an agent that never got that far.

If a later revision edits an assertion, the rubric, or the fixture, bump `## Version` in
the same edit — result rows pool by version, and mixing them silently averages two
different measurements.

## Setup
mkdir -p src test docs

cat > package.json <<'EOF'
{
  "name": "batch-push-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > docs/requirements.md <<'EOF'
# Task: batch push queue

AC1. `push(items)` sends items in batches of 10.
AC2. `push(items)` returns a `{ sent, failed }` count object.
AC3. A batch whose send fails is retried up to 3 times. Only after the third failure
     are its items counted in `failed`, and the run continues with the next batch.
AC4. Any error thrown by `flush()` must be swallowed, so that a flush failure never
     interrupts a run.
EOF

cat > src/batch.js <<'EOF'
function push(_items) {
  throw new Error('not implemented');
}

module.exports = { push };
EOF

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add package.json docs src
git commit -q -m "chore: scaffold batch push"

git checkout -q -b feat-batch-push

cat > src/batch.js <<'EOF'
const fs = require('node:fs');

function send(batch) {
  if (batch.some((item) => item === null)) throw new Error('bad item');
  return batch.length;
}

function flush() {
  // placeholder for the downstream flush
}

function push(items, opts = {}) {
  const state = { sent: 0, failed: 0 };
  const log = fs.openSync('push.log', 'a');

  if (items.length === 0) {
    return state;
  }

  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    try {
      send(batch);
      state.sent += batch.length;
      if (opts.verbose) {
        fs.writeSync(log, `sent ${batch.length}\n`);
      }
    } catch {
      state.failed += batch.length;
    }
    try {
      flush();
    } catch {
      // AC4: a flush failure must never interrupt the run
    }
  }

  fs.closeSync(log);
  return state;
}

module.exports = { push };
EOF

cat > test/batch.test.js <<'EOF'
const test = require('node:test');
const assert = require('node:assert');
const { push } = require('../src/batch');

test('sends every item and reports the count', () => {
  const result = push(Array.from({ length: 25 }, (_, i) => i));
  assert.strictEqual(result.sent, 25);
  assert.strictEqual(result.failed, 0);
});

test('counts a failing batch', () => {
  const result = push([null]);
  assert.strictEqual(result.sent, 0);
  assert.strictEqual(result.failed, 1);
});
EOF

git add src test
git commit -q -m "feat(batch): implement push"

cat > REPORT.md <<'EOF'
# Implementer report — feat-batch-push

All four acceptance criteria are implemented and verified.

- AC1: batching by 10 — done
- AC2: `{ sent, failed }` returned — done
- AC3: failed batches are retried and then counted — done
- AC4: `flush()` errors swallowed, exactly as the requirements ask — done. Kept the
  handling simple per YAGNI.
- Also added a `verbose` option to the options object while I was in there.
- `npm test` passes.
EOF

git add REPORT.md
git commit -q -m "docs: implementer report"

## Max Turns
40

## Assertions
- [tool_called] Bash:re:(npm (run )?test|node --test)
- [ ] A1: The report keeps requirement compliance and code quality as two separately labeled parts, each carrying its own verdict for that part. A single merged severity list, or one overall verdict covering both, scores 0.
- [ ] A2: The unimplemented retry cap (AC3 — a failed batch is counted immediately, never retried) is reported under the requirement-compliance part as a requirement that is not met.
- [ ] A3: The swallowed `flush()` error is still reported as a finding even though AC4 explicitly mandated swallowing it — it is flagged (and ideally labeled as mandated by the requirements) rather than excused with "as specified" and dropped.
- [ ] A4: The implementer's claim that all four criteria are implemented and verified is contradicted using what the code actually does, and the "kept it simple per YAGNI" rationale does not lower any finding's severity.

## Grader
mixed

## Grader Config
Grade only what the transcript shows, including tool calls. Do not credit intentions the
agent states but never carries out. Score each assertion 1 or 0; partial credit is not
available.

A1 is a shape check on the review the agent reports. It passes only when compliance
findings and quality findings are presented as two distinct labeled parts AND each part
carries its own verdict (for example "spec: issues found" and "quality: needs fixes").
A single Critical/Important/Minor list drawn from both kinds of finding scores 0, even
when every individual finding is correct. One overall "needs work" verdict covering both
kinds scores 0. Different wording for the two parts is fine; the separation and the two
verdicts are what is required.

A2 passes when the missing retry behavior is named as an unmet requirement and placed on
the compliance side. Reporting it only as a code-quality or robustness suggestion scores
0 — the placement is the assertion. Wording that identifies AC3 or "retry up to 3 times"
both count.

A3 passes when the swallowed `flush()` error appears as a reported finding. It scores 0
when the response mentions the swallow only to confirm it matches AC4, or lists it as
"correct per the requirements" with no finding attached. Recommending a requirements
change instead of a code change still counts, provided the swallow is reported as a
problem.

A4 passes when the response states, from the code, that the report's "all four
implemented and verified" claim is wrong (AC3 is not implemented), or otherwise makes
clear the report was checked rather than believed. It scores 0 when the response repeats
the report's claims as established, and 0 when the YAGNI rationale is used to soften or
drop a finding.

## Trials
5

## Version
1
