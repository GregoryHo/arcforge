# Eval: eval-arc-agent-driven-task-reviewer-dual-catch

**Status**: Active — measures whether a single `task-reviewer` flags BOTH a spec
defect and a quality defect in one pass (vs the two-stage `spec-reviewer` +
`quality-reviewer`).

> **Discriminability caveat — read before citing a verdict.** The CLI prints
> `Verdict: SHIP` from the single-condition pass rate alone; it does NOT encode
> the baseline comparison. On the 2026-07-09 run a BARE reviewer with NO
> task-reviewer methodology also scored 5/5 on both defects, so this fixture is
> **non-discriminative**: `eval run` SHIP here proves the defects are trivially
> catchable, not that the single-reviewer design avoids attention dilution.
> A CLI SHIP on this scenario is NOT gate-GREEN. To turn this into a real gate,
> raise the load (several subtle spec criteria + subtle quality issues) until a
> bare baseline misses ≥1.

## Scope
agent

## Target
templates/task-reviewer-prompt.md

## Scenario
Perform the review now. Read `task-reviewer-contract.md` in this directory and
follow it exactly, then produce your complete two-part review (Part 1 — Spec
Compliance and Part 2 — Task Quality) as your reply. Cite `file:line` for every
finding. Do not write your review to a file — output it directly as your response.

## Context
You are the **Task Reviewer** for the task **add-session-creation**. Your full
review contract is in `task-reviewer-contract.md` in your current working
directory — read it and follow it exactly. Every file it references is already in
this directory:

- `requirements.md` — the acceptance criteria (AC1, AC2, AC3).
- `review-package.md` — the pre-built diff (the change under review; primary input).
- `implementer-report.md` — the implementer's claims (unverified — do not trust).
- `src/session.js`, `test/session.test.js` — the actual changed source files.

The change under review contains one seeded spec gap and one seeded quality
problem; a faithful task-reviewer catches BOTH from a single read of the change.

## Preflight
skip

## Setup
python3 - <<'SETUP'
import os
from pathlib import Path

root = os.environ["PROJECT_ROOT"]
Path("src").mkdir(exist_ok=True)
Path("test").mkdir(exist_ok=True)

# --- Requirements: AC2 (persist the session) is the seeded SPEC defect ---
Path("requirements.md").write_text('''# Requirements: add-session-creation

`createSession(userId, store)` creates a login session for a user.

## Acceptance Criteria

- **AC1 (generate id):** `createSession` returns an object whose `sessionId` is a
  non-empty string, freshly generated on each call.
- **AC2 (persist the session):** `createSession` MUST persist the created session
  by calling `store.save(session)` before it returns, so the session survives a
  process restart. Returning the session without saving it does NOT satisfy AC2.
- **AC3 (reject missing user):** `createSession` called with a falsy `userId` MUST
  throw an `Error` and MUST NOT return a session object.
''')

# --- Implementation: AC1 ok, AC3 ok, AC2 UNIMPLEMENTED (store param unused) ---
session_js = '''\'use strict\';

let counter = 0;

function createSession(userId, store) {
  if (!userId) {
    throw new Error(\'userId is required\');
  }
  counter += 1;
  const session = {
    sessionId: `sess-${Date.now()}-${counter}`,
    userId,
    createdAt: Date.now(),
  };
  return session;
}

module.exports = { createSession };
'''
Path("src/session.js").write_text(session_js)

# --- Tests: test_nothing asserts nothing = seeded QUALITY defect ---
test_js = '''\'use strict\';
const assert = require(\'node:assert\');
const { createSession } = require(\'../src/session\');

// AC1: generated id
function testGeneratesSessionId() {
  const s = createSession(\'user-1\', { save() {} });
  assert.ok(s.sessionId && s.sessionId.length > 0, \'sessionId should be non-empty\');
}

// AC3: rejects missing user
function testRejectsMissingUser() {
  let threw = false;
  try {
    createSession(\'\', { save() {} });
  } catch {
    threw = true;
  }
  assert.ok(threw, \'should throw on falsy userId\');
}

// AC2: persistence
function test_nothing() {
  const store = { save() {} };
  createSession(\'user-2\', store);
}

testGeneratesSessionId();
testRejectsMissingUser();
test_nothing();
console.log(\'ok\');
'''
Path("test/session.test.js").write_text(test_js)

# --- Implementer report: OVER-CLAIMS AC2 done via store.save (a lie to verify) ---
Path("implementer-report.md").write_text('''# Implementer Report: add-session-creation

All three acceptance criteria are implemented and the tests pass.

- AC1 (generate id): DONE — `sessionId` is generated per call in src/session.js.
- AC2 (persist the session): DONE — the session is persisted via `store.save(session)`
  before returning.
- AC3 (reject missing user): DONE — throws when `userId` is falsy.

Tests: 3 tests in test/session.test.js, all green — covering generation,
rejection, and persistence.
''')

# --- Pre-built review package (unified diff) = the change under review ---
Path("review-package.md").write_text('''# Review Package: add-session-creation (BASE..HEAD)

## Commits
- a1b2c3d feat(session): add createSession

## git diff --stat
 src/session.js       | 18 ++++++++++++++++++
 test/session.test.js | 33 +++++++++++++++++++++++++++++++++
 2 files changed, 51 insertions(+)

## git diff -U10 BASE..HEAD

diff --git a/src/session.js b/src/session.js
new file mode 100644
--- /dev/null
+++ b/src/session.js
@@ -0,0 +1,18 @@
+\'use strict\';
+
+let counter = 0;
+
+function createSession(userId, store) {
+  if (!userId) {
+    throw new Error(\'userId is required\');
+  }
+  counter += 1;
+  const session = {
+    sessionId: `sess-${Date.now()}-${counter}`,
+    userId,
+    createdAt: Date.now(),
+  };
+  return session;
+}
+
+module.exports = { createSession };

diff --git a/test/session.test.js b/test/session.test.js
new file mode 100644
--- /dev/null
+++ b/test/session.test.js
@@ -0,0 +1,33 @@
+\'use strict\';
+const assert = require(\'node:assert\');
+const { createSession } = require(\'../src/session\');
+
+// AC1: generated id
+function testGeneratesSessionId() {
+  const s = createSession(\'user-1\', { save() {} });
+  assert.ok(s.sessionId && s.sessionId.length > 0, \'sessionId should be non-empty\');
+}
+
+// AC3: rejects missing user
+function testRejectsMissingUser() {
+  let threw = false;
+  try {
+    createSession(\'\', { save() {} });
+  } catch {
+    threw = true;
+  }
+  assert.ok(threw, \'should throw on falsy userId\');
+}
+
+// AC2: persistence
+function test_nothing() {
+  const store = { save() {} };
+  createSession(\'user-2\', store);
+}
+
+testGeneratesSessionId();
+testRejectsMissingUser();
+test_nothing();
+console.log(\'ok\');
''')

# --- Copy the REAL task-reviewer template and fill placeholders ---
template = Path(root, "templates", "task-reviewer-prompt.md").read_text()
filled = (template
    .replace("{FEATURE_NAME}", "add-session-creation")
    .replace("{WHAT_WAS_IMPLEMENTED}", "implementer-report.md")
    .replace("{DIFF_FILE}", "review-package.md")
    .replace("{PLAN_OR_REQUIREMENTS}", "requirements.md")
    .replace("{ACCEPTANCE_CRITERIA}",
             "The acceptance criteria are in requirements.md: "
             "AC1 (generate id), AC2 (persist the session via store.save), "
             "AC3 (reject missing user). Check every criterion line by line."))
Path("task-reviewer-contract.md").write_text(filled)

print("setup complete")
SETUP

## Assertions
- [ ] A1: The review flags the SPEC defect — it states persistence (AC2 / `store.save`) is NOT implemented (never called / session not persisted / injected `store` unused).
- [ ] A2: The review flags the QUALITY defect — it identifies `test_nothing` as asserting nothing (no assertions / verifies nothing).
- [ ] A3: Both defects appear in ONE review pass (A1 and A2 both satisfied in the single review).

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, sys
from pathlib import Path

tp = os.environ.get("TRANSCRIPT_PATH")
raw = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""

# Keep assistant text + any Write-tool content; drop single-line tool-call
# marker lines (Read/Bash/Grep/Glob echoes) so the agent's OWN search args
# (e.g. `grep test_nothing`) cannot false-positive the defect detection.
kept = []
for line in raw.splitlines():
    if line.lstrip().startswith("[Tool:"):
        continue
    kept.append(line)
review = "\n".join(kept)

# Strip markdown emphasis that can break token adjacency (backticks / asterisks
# / tildes) — reviewers write "`store.save` is **never called**", and a closing
# backtick or bold marker would otherwise sit between tokens. Do NOT strip
# underscores: the literal test name `test_nothing` depends on its underscore.
# Then collapse whitespace runs (incl. newlines) to single spaces.
flat = review.lower()
flat = re.sub(r"[`*~]+", " ", flat)
flat = re.sub(r"\s+", " ", flat)

# ---- A1: SPEC defect — persistence (AC2 / store.save) left unimplemented ----
# A persistence ANCHOR co-occurring (within ~70 chars, either order) with a
# NEGATED-ACTION phrase: a negation bound to a persistence action VERB
# (call / invoke / reference / persist / save / store / use). Anchoring on the
# action verb — NEVER on bare "missing"/"cross-mark" — is what stops the
# contract's per-criterion "Missing (Requirements not implemented)" check header
# (which the agent emits even for criteria it wrongly PASSES) from rubber-
# stamping a review that concluded persistence IS present. "not implemented" /
# "not missing" carry no action verb, so they do not match.
anchor = re.compile(r"store\.save|\.save\(|save\(session|\bpersist\w*|\bstore\b|\bsession\b")
negact = re.compile(
    r"(?:never|not|n['’]t|without|fails? to|no|cannot|could ?n['’]t|"
    r"do(?:es)? ?n['’]t|is ?n['’]t|are ?n['’]t|was ?n['’]t)"
    r"\s+(?:\w+\s+){0,2}?(?:call|invok|referenc|persist|sav|stor|use)\w*"
    r"|\bunused\b|\buncalled\b|\bunreferenced\b|\bignored\b"
)
a1 = False
for m in negact.finditer(flat):
    lo = max(0, m.start() - 70)
    hi = min(len(flat), m.end() + 70)
    if anchor.search(flat[lo:hi]):
        a1 = True
        break

# ---- A2: QUALITY defect — test_nothing asserts nothing ----
# Anchor on the literal test name (present only if the agent read & discussed
# it) within a tight window of an assertion-negative JUDGMENT.
assertneg = re.compile(
    r"(?:no (?:real |meaningful )?assert|without (?:an? )?assert|asserts? nothing|"
    r"lacks? (?:an? )?assert|missing (?:an? )?assert|does(?: not|n['’]t) assert|"
    r"empty test|no verification|verif(?:y|ies) nothing|tests? nothing|assertion-?less|"
    r"has no assert|contains? no assert|nothing (?:is )?asserted|no expectation|"
    r"checks? nothing|no ?-?op\b|does(?: not|n['’]t) (?:verify|check|test)|makes no assert|"
    r"no meaningful (?:assert|check|test))"
)
a2 = False
for m in re.finditer(r"test_nothing", flat):
    lo = max(0, m.start() - 240)
    hi = min(len(flat), m.end() + 240)
    if assertneg.search(flat[lo:hi]):
        a2 = True
        break

# ---- A3: both defects flagged in ONE review pass ----
a3 = a1 and a2

def emit(label, ok, reason):
    print(f"{label}:{'PASS' if ok else 'FAIL:' + reason}")

emit("A1", a1, "spec defect not flagged: review does not state persistence/store.save is unimplemented")
emit("A2", a2, "quality defect not flagged: review does not identify test_nothing as asserting nothing")
emit("A3", a3, "both defects not flagged in a single review pass")

sys.exit(0 if (a1 and a2 and a3) else 1)
PY

## Trials
5

## Version
1
