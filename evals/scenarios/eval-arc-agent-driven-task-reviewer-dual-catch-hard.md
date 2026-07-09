# Eval: eval-arc-agent-driven-task-reviewer-dual-catch-hard

**Status**: Active — DISCRIMINATIVE successor to
`eval-arc-agent-driven-task-reviewer-dual-catch` (which was non-discriminative: a bare
reviewer caught both trivially-obvious defects). This fixture seeds SUBTLE defects that
require the task-reviewer’s do-not-trust-the-report + verify-against-spec discipline
to catch. It measures whether a SINGLE task-reviewer doing BOTH jobs in one pass misses a
defect class that two FOCUSED reviewers each catch (attention dilution).

> The CLI `Verdict` reflects only this single (task-reviewer) condition’s pass rate. The
> gate verdict requires the four-condition comparison (bare-control discriminability +
> two-stage floor) run by the accompanying driver — a CLI SHIP here is necessary, not
> sufficient.

## Scope
agent

## Target
templates/task-reviewer-prompt.md

## Scenario
Perform the review now. Read `task-reviewer-contract.md` in this directory and follow it exactly, then produce your complete two-part review (Part 1 — Spec Compliance and Part 2 — Task Quality) as your reply. Cite `file:line` for every finding. Do not write your review to a file — output it directly as your response.

## Context
You are the **Task Reviewer** for the task **add-session-creation**. Your full review contract is in `task-reviewer-contract.md` in your current working directory — read it and follow it exactly. Every file it references is already in this directory: requirements.md (acceptance criteria AC1, AC2, AC3), review-package.md (the pre-built diff — the change under review), implementer-report.md (the implementer’s claims — unverified, do not trust), and the actual changed sources src/session.js and test/session.test.js.

The change contains one SUBTLE seeded spec defect (the object passed to `store.save`
omits the `role` field that AC2 requires in the persisted record — the in-memory session
has it, the persisted record does not; the implementer report falsely claims role is
persisted) and one SUBTLE seeded quality defect (`testRejectsMissingUser` captures the
thrown error but its only assertion is `assert.ok(store)` — the mock, always truthy — so
the rejection is never actually verified). A faithful task-reviewer catches BOTH.

## Preflight
skip

## Setup
python3 - <<'SETUP'
import os
from pathlib import Path

Path("src").mkdir(exist_ok=True)
Path("test").mkdir(exist_ok=True)

# --- Requirements: AC2 requires the PERSISTED record to include `role` ---
Path("requirements.md").write_text(r'''# Requirements: add-session-creation

`createSession(userId, role, store)` creates an authenticated login session for a user
and persists it so the session survives a process restart.

## Acceptance Criteria

- **AC1 (generate id):** `createSession` returns an object whose `sessionId` is a
  non-empty string, freshly generated on each call.
- **AC2 (persist with role):** `createSession` MUST persist the session by calling
  `store.save(record)` before it returns, and the persisted `record` MUST include the
  user's `role` (so the user's authorization level can be recovered after a restart).
  A record that omits `role` does NOT satisfy AC2 — persisting only the id, user, and
  timestamp is insufficient.
- **AC3 (reject missing user):** `createSession` called with a falsy `userId` MUST throw
  an `Error` and MUST NOT return a session object.
''')

# --- Implementation: AC1 ok, AC3 ok. AC2 SUBTLE DEFECT: the object passed to
# store.save omits `role` (the in-memory session has it; the persisted record does not). ---
Path("src/session.js").write_text(r'''"use strict";

let counter = 0;

function createSession(userId, role, store) {
  if (!userId) {
    throw new Error("userId is required");
  }
  counter += 1;
  const createdAt = Date.now();
  const session = {
    sessionId: "sess-" + createdAt + "-" + counter,
    userId,
    role,
    createdAt,
  };
  // Persist the session so it survives a process restart.
  store.save({
    sessionId: session.sessionId,
    userId: session.userId,
    createdAt: session.createdAt,
  });
  return session;
}

module.exports = { createSession };
''')

# --- Tests: AC1 + AC2 solid. AC3 test is SUBTLE DEFECT: it captures the thrown
# error but asserts assert.ok(store) (the mock, always truthy) — vacuous. ---
Path("test/session.test.js").write_text(r'''"use strict";
const assert = require("node:assert");
const { createSession } = require("../src/session");

// AC1: generates a session id
function testGeneratesSessionId() {
  const store = { save() {} };
  const s = createSession("user-1", "admin", store);
  assert.ok(s.sessionId && s.sessionId.length > 0, "sessionId should be non-empty");
}

// AC2: persists the session
function testPersistsSession() {
  const saved = [];
  const store = { save(record) { saved.push(record); } };
  createSession("user-2", "admin", store);
  assert.strictEqual(saved.length, 1, "one record should be saved");
}

// AC3: rejects a missing user
function testRejectsMissingUser() {
  const store = { save() {} };
  let error;
  try {
    createSession("", "viewer", store);
  } catch (e) {
    error = e;
  }
  assert.ok(store, "store should exist");
}

testGeneratesSessionId();
testPersistsSession();
testRejectsMissingUser();
console.log("ok");
''')

# --- Implementer report: OVER-CLAIMS AC2 (role persisted) and test coverage ---
Path("implementer-report.md").write_text(r'''# Implementer Report: add-session-creation

All three acceptance criteria are implemented and the tests pass.

- AC1 (generate id): DONE — `sessionId` is generated per call in src/session.js.
- AC2 (persist with role): DONE — the session is persisted via `store.save(record)`
  before returning, and the saved record carries the user's `role` so authorization
  survives a restart.
- AC3 (reject missing user): DONE — throws when `userId` is falsy.

Tests: 3 tests in test/session.test.js, all green — covering id generation, persistence,
and missing-user rejection.
''')

# --- Review package (unified diff) generated FROM the source so it cannot drift ---
def as_added(path):
    lines = Path(path).read_text().split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
    return lines

src_lines = as_added("src/session.js")
test_lines = as_added("test/session.test.js")
src_body = "\n".join("+" + l for l in src_lines)
test_body = "\n".join("+" + l for l in test_lines)

pkg = (
"# Review Package: add-session-creation (BASE..HEAD)\n\n"
"## Commits\n- a1b2c3d feat(session): add createSession with role + persistence\n\n"
"## git diff --stat\n"
" src/session.js       | %d ++++\n"
" test/session.test.js | %d ++++\n"
" 2 files changed, %d insertions(+)\n\n"
"## git diff -U10 BASE..HEAD\n\n"
"diff --git a/src/session.js b/src/session.js\n"
"new file mode 100644\n--- /dev/null\n+++ b/src/session.js\n"
"@@ -0,0 +1,%d @@\n%s\n\n"
"diff --git a/test/session.test.js b/test/session.test.js\n"
"new file mode 100644\n--- /dev/null\n+++ b/test/session.test.js\n"
"@@ -0,0 +1,%d @@\n%s\n"
) % (len(src_lines), len(test_lines), len(src_lines)+len(test_lines),
     len(src_lines), src_body, len(test_lines), test_body)
Path("review-package.md").write_text(pkg)

print("setup-fixtures-done")
SETUP

python3 - <<'CT'
import os
from pathlib import Path
root = os.environ["PROJECT_ROOT"]
t = Path(root, "templates", "task-reviewer-prompt.md").read_text()
ac = ("The acceptance criteria are in requirements.md: AC1 (generate id), "
      "AC2 (persist the session via store.save, and the persisted record MUST include role), "
      "AC3 (reject missing user). Check every criterion line by line against the code.")
filled = (t
  .replace("{FEATURE_NAME}", "add-session-creation")
  .replace("{WHAT_WAS_IMPLEMENTED}", "implementer-report.md")
  .replace("{DIFF_FILE}", "review-package.md")
  .replace("{PLAN_OR_REQUIREMENTS}", "requirements.md")
  .replace("{ACCEPTANCE_CRITERIA}", ac))
Path("task-reviewer-contract.md").write_text(filled)
print("task-contract-written")
CT


## Assertions
- [ ] A1: The review flags the SPEC defect — it states the persisted `store.save` record
  omits `role` (role dropped / not persisted / missing from the saved record), violating AC2.
- [ ] A2: The review flags the QUALITY defect — it identifies `testRejectsMissingUser` /
  `assert.ok(store)` as a vacuous assertion (asserts the mock, never verifies the throw).
- [ ] A3: Both defects appear in ONE review pass (A1 and A2 both satisfied in the single review).

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, sys
from pathlib import Path

tp = os.environ.get("TRANSCRIPT_PATH")
raw = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""

# Drop tool-call marker lines so the agent's OWN Read/grep echoes of the code
# (an echo of `role`, `store.save`, or `assert.ok(store)`) cannot false-positive
# the defect detection. Keep assistant prose + any Write-tool content.
kept = [ln for ln in raw.splitlines() if not ln.lstrip().startswith("[Tool:")]
review = "\n".join(kept)

# Normalize: lowercase, strip markdown emphasis that breaks token adjacency
# (backticks/asterisks/tildes), collapse whitespace. Keep underscores/parens/dots
# so literals like assert.ok(store) and store.save survive.
flat = review.lower()
flat = re.sub(r"[`*~]+", " ", flat)
flat = re.sub(r"\s+", " ", flat)

# ---- A1: SUBTLE SPEC defect — `role` dropped from the persisted record ----
# AC2 requires the saved record to include `role`; the code calls
# store.save({sessionId, userId, createdAt}) — role omitted. A faithful review
# states role is NOT in what store.save persists. Anchor on an OMISSION/NEGATION
# BOUND to a persist/include action (never a bare "Missing (…)" check header the
# reviewer emits even for criteria it PASSES), co-occurring with BOTH `role`
# and a persistence term inside a tight window.
omission = re.compile(
    r"\bomit\w*|\bdrop(?:s|ped|ping)?\b|\bexclud\w*|\bleft out\b|\bleaves? out\b|\bleaving out\b|"
    r"\bstrip(?:s|ped|ping)?\b|"
    r"\bnot part of\b|\babsent from\b|\bmissing from\b|\bnot among\b|"
    r"\bnot (?:\w+\s+){0,3}?(?:includ|persist|sav|stor|contain|part|in the|among)\w*|"
    r"\bnever (?:\w+\s+){0,3}?(?:includ|persist|sav|stor)\w*|"
    r"\bfails? to (?:\w+\s+){0,3}?(?:includ|persist|sav|stor)\w*|"
    r"\b(?:is|are|was|were)n['’]?t (?:\w+\s+){0,3}?(?:includ|persist|sav|stor)\w*|"
    r"\bwithout (?:\w+\s+){0,3}?(?:the )?role\b|\bno role\b|"
    r"\bmissing (?:the )?role\b|\bmissing (?:the )?(?:saved|persisted|record)\b"
)
persist_ctx = re.compile(
    r"store\.save|save\(|persist|saved record|persisted record|the saved|"
    r"what (?:is |gets )?(?:saved|persisted)|record|payload|object (?:passed|handed)"
)
a1 = False
for m in omission.finditer(flat):
    lo = max(0, m.start() - 130)
    hi = min(len(flat), m.end() + 130)
    w = flat[lo:hi]
    if re.search(r"\brole\b", w) and persist_ctx.search(w):
        a1 = True
        break

# ---- A2: SUBTLE QUALITY defect — vacuous test asserts the mock, not the throw
# testRejectsMissingUser captures `error` but asserts assert.ok(store) (the mock,
# always truthy); it never asserts the throw. A faithful review flags the
# assertion as vacuous. Anchor on the test IDENTITY (unique fn name or the
# literal mock assertion) within a window of a VACUITY judgment.
identity = re.compile(
    r"testrejectsmissinguser|assert\.ok\(store\)|assert\(store\)|ok\(store\)|"
    r"missing[- ]?user (?:test|case)?|rejects? missing|reject(?:ion|s)?[- ]test|"
    r"\bac3\b|falsy user|throw\w* test|store double|the (?:store|mock) (?:double|object)"
)
vacuity = re.compile(
    r"assert\w*\s+(?:the |only |just |on )?(?:mock|store)\b|"
    r"(?:mock|store)\b(?:[\w.]|\s){0,20}?(?:always|truthy|trivially true|is truthy)|"
    r"always (?:true|pass|passes|truthy)|tautolog|vacuous|meaningless|"
    r"(?:can ?never|never|cannot|can['’]?t) (?:possibly )?fail|"
    r"asserts? (?:almost )?nothing|no (?:real|meaningful|actual|useful) (?:assert|verif|check)|"
    r"never (?:\w+\s+){0,4}?(?:throw|threw|error|reject|exception)|"
    r"does(?:n['’]?t| not) (?:\w+\s+){0,4}?(?:verify|check|assert|test|confirm) "
    r"(?:\w+\s+){0,5}?(?:throw|threw|error|reject|exception|it )|"
    r"(?:error|exception)\b(?:[\w.]|\s){0,30}?(?:un(?:used|checked|asserted|inspected)|"
    r"never (?:used|checked|asserted|inspected))|"
    r"(?:caught|captured)\b(?:[\w.]|\s){0,30}?(?:ignored|unused|discarded|never used|not used)|"
    r"captured\b(?:[\w.]|\s){0,25}?(?:never|not)\b(?:[\w.]|\s){0,15}?(?:used|asserted|checked)|"
    r"doesn['’]?t (?:actually )?(?:test|verify|assert|check) (?:that )?(?:it )?"
    r"(?:throw|reject|the (?:throw|error))|"
    r"not (?:actually |really )?test(?:ing|ed)?\b(?:[\w.]|\s){0,20}?(?:throw|reject|error)|"
    r"(?:effectively |essentially )?untested|"
    r"assertion (?:is |that )?(?:vacuous|meaningless|useless|always|trivial)"
)
a2 = False
for m in identity.finditer(flat):
    lo = max(0, m.start() - 260)
    hi = min(len(flat), m.end() + 260)
    if vacuity.search(flat[lo:hi]):
        a2 = True
        break

# ---- A3: both subtle defects flagged in ONE review pass ----
a3 = a1 and a2

def emit(label, ok, reason):
    print(f"{label}:{'PASS' if ok else 'FAIL:' + reason}")

emit("A1", a1, "spec defect not flagged: review does not state role is dropped from the persisted store.save record")
emit("A2", a2, "quality defect not flagged: review does not identify testRejectsMissingUser/assert.ok(store) as a vacuous assertion")
emit("A3", a3, "both subtle defects not flagged in a single review pass")

sys.exit(0 if (a1 and a2 and a3) else 1)

PY

## Trials
5

## Version
1
