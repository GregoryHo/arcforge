# Eval: eval-arc-agent-driven-task-reviewer-dilution-volume

> **Result (2026-07-09): RED (narrow), volume hypothesis NULL.** 7/8 seeded defects caught at ceiling by all conditions incl. a bare reviewer, so defect count does not broadly dilute the merged reviewer. On ONE non-AC quality defect (fd-leak) the single task-reviewer dropped it — task 1/5 vs quality-only 2/3 vs bare 4/5 → merging would lose that coverage. Cause: the task-reviewer contract is AC-checklist-heavy and under-weights non-AC quality defects (resource leaks). NOT inherent single-pass dilution (bare single pass catches it 4/5) — a FIXABLE prompt weakness. Magnitude coarse (k=3, not Fisher-significant); direction robust.

**Status**: Active — VOLUME successor to the reviewer-merge dilution gates
(`...dual-catch` and `...dual-catch-hard`, both single-defect-pair and NON-discriminative:
a bare reviewer catches a lone spec+quality defect regardless of methodology). This fixture
seeds a LARGE multi-file change (module + CLI + tests, 8 acceptance criteria, ~112-line
diff) with MANY defects — four SPEC (AC4/AC5/AC6/AC7) and four QUALITY (assertion-less test,
swallowed CLI error, fd leak, vacuous assertion) — to test whether VOLUME stresses a single
merged task-reviewer's attention vs two focused reviewers. The implementer report over-claims
every criterion done.

> The CLI `Verdict` reflects only this single (task-reviewer) condition’s pass rate. The gate
> verdict requires the four-condition comparison (bare-control discriminability + the
> two-stage floor from focused spec-only / quality-only reviewers) run by the accompanying
> driver — a CLI SHIP here is necessary, not sufficient. Per-defect catch is graded (A1–A4
> spec, A5–A8 quality), not just a binary.

## Scope
agent

## Target
templates/task-reviewer-prompt.md

## Scenario
Perform the review now. Read `task-reviewer-contract.md` in this directory and follow it exactly, then produce your complete two-part review (Part 1 — Spec Compliance and Part 2 — Task Quality) as your reply. Cite `file:line` for every finding. Do not write your review to a file — output it directly as your response. Complete the entire review yourself in this session and finish within a few minutes — do NOT spawn subagents, delegate, or request a second opinion; produce the finished review as your reply.

## Context
You are the **Task Reviewer** for the task **todo-service**. Your full review contract is in `task-reviewer-contract.md` in your current working directory — read it and follow it exactly. Every file it references is already in this directory: requirements.md (the 8 acceptance criteria), review-package.md (the pre-built diff — the change under review), implementer-report.md (the implementer’s claims — unverified, do not trust), and the changed sources src/todo.js, src/todo-cli.js, and test/todo.test.js.

The change seeds eight defects, each nameable by a robust marker. SPEC: SP1 `priority` is not
defaulted to "normal" when omitted (AC5); SP2 `listActive` filter is inverted, returning done
todos instead of active (AC6); SP3 `completeTodo` mutates `done` but never calls `store.save`
(AC4); SP4 `loadTodos` saves the whole parsed array as one record instead of each todo (AC7).
QUALITY: Q1 `testMarkDone` asserts nothing; Q2 the CLI try/catch swallows every error and
returns 0; Q3 `exportTodos` opens a file descriptor with `openSync` and never closes it; Q4
`testRejectEmpty` asserts `assert.ok(store)` (the always-truthy mock), never verifying the
throw. A faithful task-reviewer catches all eight in one pass.

## Preflight
skip

## Setup
python3 - <<'SETUP'
import os
from pathlib import Path

Path("src").mkdir(exist_ok=True)
Path("test").mkdir(exist_ok=True)

# --- Requirements: 8 acceptance criteria, stated plainly (defects NOT telegraphed). ---
Path("requirements.md").write_text(r'''# Requirements: todo-service

A small todo-list service backed by an injected `store` (an object with
`save(todo)`, `get(id)`, and `all()`), plus a thin CLI wrapper.

## Acceptance Criteria

- **AC1 (generate id):** `addTodo(text, store, priority)` returns a todo object whose
  `id` is a non-empty string, freshly generated on each call.
- **AC2 (persist on add):** `addTodo` MUST call `store.save(todo)` before it returns so
  the todo survives a process restart.
- **AC3 (reject empty text):** `addTodo` called with falsy/empty `text` MUST throw an
  `Error` and MUST NOT return a todo.
- **AC4 (complete persists):** `completeTodo(id, store)` MUST set the todo's `done` to
  `true` AND persist the updated todo by calling `store.save` before returning. A
  version that mutates the todo without calling `store.save` does NOT satisfy AC4.
- **AC5 (priority default):** `priority` is optional. When it is omitted, `addTodo` MUST
  default it to the string `"normal"`. Storing an omitted priority as `undefined` does
  NOT satisfy AC5.
- **AC6 (list active):** `listActive(store)` MUST return only the todos whose `done` is
  `false` (the still-active todos). It MUST NOT return completed todos.
- **AC7 (load each):** `loadTodos(store, path)` reads a JSON array of todos from `path`
  and MUST persist EACH todo individually via `store.save(todo)`. Saving the whole array
  as a single record does NOT satisfy AC7.
- **AC8 (CLI add prints id):** the CLI `add <text>` subcommand MUST call `addTodo` and
  print the newly created todo's `id` to stdout.
''')

# --- Implementation: src/todo.js. Correct: AC1, AC2, AC3. Seeded SPEC defects:
#   SP1 (AC5): priority is stored as `priority` with no default -> undefined when omitted.
#   SP2 (AC6): listActive filters `t.done` (returns COMPLETED) -> inverted.
#   SP3 (AC4): completeTodo sets done but never calls store.save -> not persisted.
#   SP4 (AC7): loadTodos calls store.save(items) ONCE on the whole array (not each todo).
# Seeded QUALITY defect:
#   Q3: exportTodos opens a file descriptor with openSync and never closes it (leak). ---
Path("src/todo.js").write_text(r'''"use strict";
const fs = require("node:fs");

let counter = 0;

function addTodo(text, store, priority) {
  if (!text) {
    throw new Error("text is required");
  }
  counter += 1;
  const todo = {
    id: "todo-" + Date.now() + "-" + counter,
    text: text,
    priority: priority,
    done: false,
  };
  store.save(todo);
  return todo;
}

function completeTodo(id, store) {
  const todo = store.get(id);
  todo.done = true;
  return todo;
}

function listActive(store) {
  return store.all().filter((t) => t.done);
}

function exportTodos(store, path) {
  const fd = fs.openSync(path, "w");
  fs.writeSync(fd, JSON.stringify(store.all()));
  return path;
}

function loadTodos(store, path) {
  const items = JSON.parse(fs.readFileSync(path, "utf8"));
  store.save(items);
  return items.length;
}

module.exports = { addTodo, completeTodo, listActive, exportTodos, loadTodos };
''')

# --- Tests: test/todo.test.js. Good: testAddPersists. Seeded QUALITY defects:
#   Q4: testRejectEmpty captures `error` but asserts assert.ok(store) (the mock,
#       always truthy) -> vacuous; never verifies the throw.
#   Q1: testMarkDone calls completeTodo but asserts NOTHING. ---
Path("test/todo.test.js").write_text(r'''"use strict";
const assert = require("node:assert");
const { addTodo, completeTodo } = require("../src/todo");

function makeStore() {
  const map = new Map();
  return {
    save(todo) { map.set(todo.id, todo); },
    get(id) { return map.get(id); },
    all() { return Array.from(map.values()); },
  };
}

// AC1 + AC2: add returns an id and persists it
function testAddPersists() {
  const store = makeStore();
  const t = addTodo("buy milk", store, "high");
  assert.ok(t.id && t.id.length > 0, "id should be non-empty");
  assert.strictEqual(store.all().length, 1, "todo should be persisted");
}

// AC3: reject empty text
function testRejectEmpty() {
  const store = makeStore();
  let error = null;
  try {
    addTodo("", store, "normal");
  } catch (e) {
    error = e;
  }
  assert.ok(store, "store should exist");
}

// AC4: completing a todo marks it done
function testMarkDone() {
  const store = makeStore();
  const t = addTodo("write report", store, "normal");
  completeTodo(t.id, store);
}

testAddPersists();
testRejectEmpty();
testMarkDone();
console.log("ok");
''')

# --- CLI: src/todo-cli.js. Correct: AC8 (add prints todo.id). Seeded QUALITY defect:
#   Q2: the try/catch swallows every error and returns 0 -> a failed add exits 0. ---
Path("src/todo-cli.js").write_text(r'''"use strict";
const { addTodo, exportTodos } = require("./todo");

function main(argv, store) {
  const cmd = argv[0];
  const rest = argv.slice(1);
  try {
    if (cmd === "add") {
      const todo = addTodo(rest.join(" "), store);
      console.log(todo.id);
      return 0;
    }
    if (cmd === "export") {
      const out = exportTodos(store, rest[0]);
      console.log(out);
      return 0;
    }
    console.error("unknown command: " + cmd);
    return 1;
  } catch (e) {
    return 0;
  }
}

module.exports = { main };
''')

# --- Implementer report: OVER-CLAIMS every AC done + tests solid (unverified). ---
Path("implementer-report.md").write_text(r'''# Implementer Report: todo-service

All eight acceptance criteria are implemented and every test passes.

- AC1 (generate id): DONE — `id` generated per call in src/todo.js.
- AC2 (persist on add): DONE — `store.save(todo)` is called before returning.
- AC3 (reject empty text): DONE — throws when `text` is falsy.
- AC4 (complete persists): DONE — `completeTodo` marks the todo done and the change is
  persisted through the store before returning.
- AC5 (priority default): DONE — an omitted `priority` defaults to `"normal"`.
- AC6 (list active): DONE — `listActive` returns the still-active todos.
- AC7 (load each): DONE — `loadTodos` reads the file and saves each todo to the store.
- AC8 (CLI add prints id): DONE — the CLI `add` command prints the new todo's id.

Tests: 3 tests in test/todo.test.js (add/persist, empty-text rejection, mark-done), all
green. exportTodos/loadTodos exercised manually. No leaks; error handling is clean.
''')

# --- Review package (unified diff) generated FROM the sources so it cannot drift ---
def as_added(path):
    lines = Path(path).read_text().split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
    return lines

files = ["src/todo.js", "src/todo-cli.js", "test/todo.test.js"]
diffs = []
stat = []
total = 0
for f in files:
    body_lines = as_added(f)
    total += len(body_lines)
    stat.append((f, len(body_lines)))
    body = "\n".join("+" + l for l in body_lines)
    diffs.append(
        "diff --git a/%s b/%s\n"
        "new file mode 100644\n--- /dev/null\n+++ b/%s\n"
        "@@ -0,0 +1,%d @@\n%s\n" % (f, f, f, len(body_lines), body)
    )

stat_block = "".join(" %-20s | %d ++++\n" % (f, n) for f, n in stat)
pkg = (
    "# Review Package: todo-service (BASE..HEAD)\n\n"
    "## Commits\n- a1b2c3d feat(todo): add todo-service (module + cli + tests)\n\n"
    "## git diff --stat\n" + stat_block +
    " %d files changed, %d insertions(+)\n\n" % (len(files), total) +
    "## git diff -U10 BASE..HEAD\n\n" + "\n".join(diffs)
)
Path("review-package.md").write_text(pkg)

print("setup-fixtures-done")
SETUP

python3 - <<'CT'
import os
from pathlib import Path
root = os.environ["PROJECT_ROOT"]
t = Path(root, "templates", "task-reviewer-prompt.md").read_text()
ac = ("The acceptance criteria are in requirements.md: AC1 (generate id), AC2 (persist on add), "
      "AC3 (reject empty text), AC4 (complete persists via store.save), AC5 (priority defaults "
      "to \"normal\" when omitted), AC6 (listActive returns only active todos, done === false), "
      "AC7 (loadTodos persists each todo individually), AC8 (CLI add prints the new todo id). "
      "Check every criterion line by line against the code.")
filled = (t
  .replace("{FEATURE_NAME}", "todo-service")
  .replace("{WHAT_WAS_IMPLEMENTED}", "implementer-report.md")
  .replace("{DIFF_FILE}", "review-package.md")
  .replace("{PLAN_OR_REQUIREMENTS}", "requirements.md")
  .replace("{ACCEPTANCE_CRITERIA}", ac))
Path("task-reviewer-contract.md").write_text(filled)
print("task-contract-written")
CT


## Assertions
- [ ] A1: SP1 (AC5) — the review flags that `priority` is not defaulted to `"normal"` when
  omitted (stored as `undefined`).
- [ ] A2: SP2 (AC6) — the review flags that `listActive` is inverted (returns done/completed
  todos instead of the active `done === false` todos).
- [ ] A3: SP3 (AC4) — the review flags that `completeTodo` never calls `store.save` (the
  completion is not persisted).
- [ ] A4: SP4 (AC7) — the review flags that `loadTodos` saves the whole array as one record
  instead of persisting each todo individually.
- [ ] A5: Q1 — the review flags that `testMarkDone` asserts nothing (assertion-less test).
- [ ] A6: Q2 — the review flags that the CLI `main` try/catch swallows every error and
  returns 0 (failures are hidden).
- [ ] A7: Q3 — the review flags that `exportTodos` leaks a file descriptor (`openSync` with no
  `closeSync`).
- [ ] A8: Q4 — the review flags that `testRejectEmpty` asserts the always-truthy mock
  (`assert.ok(store)`), a vacuous assertion that never verifies the throw.

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, sys
from pathlib import Path

tp = os.environ.get("TRANSCRIPT_PATH")
raw = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""

# ---- Extraction: keep [Assistant] block prose + [Tool: Write] block bodies; drop
# every other tool block (Read/Bash/Grep/Glob) so the agent's OWN tool-call args
# (a grep of `role`, a Read of test/todo.js) cannot false-positive a finding. The
# review is emitted directly per the scenario; Write bodies are retained as a hedge
# in case an agent writes its review to a file anyway. ----
blocks = re.split(r"(?=^\[(?:Tool:|Assistant))", raw, flags=re.M)
kept = []
for b in blocks:
    s = b.lstrip()
    if s.startswith("[Assistant]"):
        kept.append(b.split("]", 1)[1] if "]" in b else b)
    elif s.startswith("[Tool: Write]"):
        # drop the "[Tool: Write] <path>" marker line, keep the written body
        kept.append("\n".join(b.split("\n")[1:]))
review = "\n".join(kept)

# Normalize: lowercase, strip markdown emphasis that breaks token adjacency
# (backticks/asterisks/tildes), collapse whitespace. Keep underscores/dots/parens
# so literals like assert.ok(store), store.save, todo-cli survive.
flat = review.lower()
flat = re.sub(r"[`*~]+", " ", flat)
flat = re.sub(r"\s+", " ", flat)


def near(anchor_re, finding_re, window):
    """True iff some finding match falls within `window` chars of some anchor."""
    finds = [(m.start(), m.end()) for m in finding_re.finditer(flat)]
    if not finds:
        return False
    for a in anchor_re.finditer(flat):
        for fs_, fe in finds:
            if fs_ <= a.end() + window and fe >= a.start() - window:
                return True
    return False


# ============================ SPEC DEFECTS ============================

# SP1 (AC5) — priority is not defaulted to "normal"; omitted -> undefined.
sp1 = near(
    re.compile(r"\bpriority\b"),
    re.compile(
        r"\bundefined\b"
        r"|(?:no|not|never|missing|isn['’]?t|does(?:n['’]?t| not)|won['’]?t|should|must|fail\w* to|without|lacks?)\s+(?:\w+\s+){0,4}?default"
        r"|default\w*\s+(?:value )?(?:is |was )?(?:missing|absent|not set|never)"
        r"|(?:not|never|isn['’]?t)\s+(?:\w+\s+){0,3}?(?:set to |defaulted to )?[\"']?normal[\"']?"
        r"|no default"
    ),
    120,
)

# SP2 (AC6) — listActive filter inverted: returns done/completed instead of active.
sp2 = near(
    re.compile(r"listactive"),
    re.compile(
        r"invert\w*|backwards|reversed|opposite|negat\w*"
        r"|instead of (?:the )?(?:active|not[- ]?done|incomplete|undone|unfinished|pending)"
        r"|returns? (?:only )?(?:the )?(?:done|completed|finished)"
        r"|filters? (?:for |on |by |to )?(?:the )?(?:done|completed)"
        r"|keeps? (?:only )?(?:the )?(?:done|completed)"
        r"|(?:only )?(?:the )?(?:done|completed)(?:\s+\w+){0,2}?\s+(?:are|is) returned"
        r"|should (?:return|keep|filter|show|list)(?:\s+\w+){0,3}?(?:active|incomplete|not[- ]?done|undone|unfinished|pending)"
        r"|wrong (?:filter|condition|boolean|logic|predicate)"
        r"|filter (?:condition )?(?:is )?(?:wrong|reversed|inverted|backwards)"
        r"|t\.done(?:\s|\))"
        r"|=== ?true"
    ),
    150,
)

# SP3 (AC4) — completeTodo mutates done but never persists via store.save.
sp3 = near(
    re.compile(r"completetodo"),
    re.compile(
        r"(?:never|not|no|without|fails? to|does(?:n['’]?t| not)|is ?n['’]?t|omit\w*)\s+(?:\w+\s+){0,4}?(?:call\w*\s+)?(?:store\.save|save|persist\w*)"
        r"|(?:store\.save|save|persist\w*)\s+(?:is |was )?(?:never|not)\s+(?:\w+\s+){0,2}?call\w*"
        r"|no (?:call to )?store\.save"
        r"|missing (?:a )?(?:store\.save|save|persist\w*)"
        r"|not persisted|never persisted|isn['’]?t persisted|doesn['’]?t persist"
        r"|change (?:is )?(?:not|never) (?:saved|persisted|stored)"
    ),
    130,
)

# SP4 (AC7) — loadTodos saves the whole array as ONE record instead of each todo.
# The signal is a WRONG-AGGREGATION signature (a whole-array save, or an explicit
# contrast against per-todo saving), NOT bare "each" — the AC7 label "(load each)"
# puts "each" next to loadTodos even in reviews that (wrongly) PASS AC7.
_sp4_defect = re.compile(
    r"(?:whole|entire|full)\s+(?:parsed\s+)?array"
    r"|(?:single|one)\s+record"
    r"|(?:single|one)\s+call"
    r"|save(?:s|d)?\s+(?:the\s+)?(?:whole|entire|full)\s+array"
    r"|all at once"
    r"|store\.save\(items\)"
    r"|the items array"
    r"|instead of (?:saving |persisting )?(?:each|per|individually|iterating|looping|every todo)"
    r"|rather than (?:saving |persisting )?(?:each|per|individually|iterating|looping|every todo)"
    r"|not (?:\w+\s+){0,2}?(?:iterat\w*|loop\w*|per[- ]?todo|individually|each todo|every todo)"
    r"|should (?:\w+\s+){0,2}?(?:iterat\w*|loop\w*|save each|persist each|per[- ]?todo)"
    r"|does(?:n['’]?t| not) (?:\w+\s+){0,2}?(?:iterat\w*|loop\w*|save each|persist each)"
    r"|once (?:on|instead|rather|for the)"
)
sp4 = near(re.compile(r"loadtodos"), _sp4_defect, 160)

# ============================ QUALITY DEFECTS ============================

# Q1 — testMarkDone asserts nothing (no assertion at all).
q1 = near(
    re.compile(r"testmarkdone"),
    re.compile(
        r"no (?:real |meaningful )?assert|without (?:an? )?assert|asserts? nothing"
        r"|lacks? (?:an? )?assert|missing (?:an? )?assert|does(?: not|n['’]?t) assert"
        r"|empty test|no verification|verif(?:y|ies) nothing|tests? nothing|assertion-?less"
        r"|has no assert|contains? no assert|nothing (?:is )?asserted|no expectation"
        r"|checks? nothing|does(?: not|n['’]?t) (?:verify|check)|makes no assert"
        r"|no meaningful (?:assert|check|test)|no assertions?|never asserts?"
        r"|(?:zero|0)\s+(?:real |meaningful )?assertions?"
        r"|contains? (?:zero|no) assert|without any (?:real |meaningful )?assert"
        r"|(?:has|with|carries) (?:zero|no) (?:real |meaningful )?assert|devoid of assert"
    ),
    220,
)

# Q2 — the CLI try/catch swallows every error and returns 0.
_q2_ctx = re.compile(r"todo-cli|\bcli\b|\bmain\b|catch|command")
_q2_swallow = re.compile(
    r"swallow\w*|silently (?:ignor|catch|swallow|discard)|empty catch"
    r"|catch(?:es)?(?:\s+\w+){0,3}?\s+(?:and )?(?:ignor|swallow|hid|discard|suppress)"
    r"|hides? (?:the |all |any )?(?:error|failure|exception)"
    r"|masks? (?:the |all |any )?(?:error|failure|exception)"
    r"|returns? 0 (?:on|even|despite|when|after|for|regardless)"
    r"|exit\w* (?:code )?0 (?:on|even|despite|when|regardless)"
    r"|(?:error|exception|failure) (?:is |are )?(?:swallowed|ignored|discarded|hidden|suppressed|not (?:re-?)?thrown|not (?:re-?)?propagat\w*)"
    r"|catch\s*\(\s*e?\s*\)\s*\{?\s*return 0"
    r"|does(?:n['’]?t| not) (?:re-?)?(?:throw|propagat\w*|report|surface)"
    r"|never (?:re-?)?(?:throws?|propagat\w*|reports?|surfaces?)"
    r"|suppress\w* (?:the |all |any )?(?:error|exception|failure)"
    r"|no error (?:handling|reporting|propagation)"
)
q2 = near(_q2_ctx, _q2_swallow, 160)

# Q3 — exportTodos leaks a file descriptor (openSync, never closed).
q3 = near(
    re.compile(r"exporttodos"),
    re.compile(
        r"leak\w*|not clos\w*|never clos\w*|un-?clos\w*|does(?:n['’]?t| not) clos\w*"
        r"|fails? to clos\w*|missing (?:a )?(?:fs\.)?close|no (?:fs\.)?close|closesync"
        r"|(?:file )?(?:descriptor|handle|fd)(?:\s+\w+){0,3}?\s+(?:is |are )?(?:leak|not (?:being )?clos|never (?:being )?clos)"
        r"|opensync(?:\s+\w+){0,4}?\s+(?:without|but (?:never|not))"
        r"|resource leak|descriptor leak|handle leak|fd leak"
    ),
    160,
)

# Q4 — testRejectEmpty asserts the mock (assert.ok(store)); never verifies the throw.
# Match the vacuous assertion whether quoted bare `assert.ok(store)` or with its
# real args `assert.ok(store, "store should exist")` — reviewers quote the latter.
_q4_id = re.compile(r"testrejectempty|assert\.ok\(store|assert\(store|\bok\(store")
_q4_vac = re.compile(
    r"assert\w*\s+(?:the |only |just |on )?(?:mock|store)\b"
    r"|(?:mock|store)\b(?:[\w.]|\s){0,20}?(?:always|truthy|trivially true|is truthy)"
    r"|always (?:true|pass|passes|truthy)|tautolog|vacuous|meaningless"
    r"|(?:can ?never|never|cannot|can['’]?t) (?:possibly )?fail"
    r"|asserts? (?:almost )?nothing|no (?:real|meaningful|actual|useful) (?:assert|verif|check)"
    r"|never (?:\w+\s+){0,4}?(?:throw|threw|error|reject|exception)"
    r"|does(?:n['’]?t| not) (?:\w+\s+){0,4}?(?:verify|check|assert|test|confirm) (?:\w+\s+){0,5}?(?:throw|threw|error|reject|exception|it )"
    r"|(?:error|exception)\b(?:[\w.]|\s){0,30}?(?:un(?:used|checked|asserted|inspected)|never (?:used|checked|asserted|inspected))"
    r"|(?:caught|captured)\b(?:[\w.]|\s){0,30}?(?:ignored|unused|discarded|never used|not used)"
    r"|captured\b(?:[\w.]|\s){0,25}?(?:never|not)\b(?:[\w.]|\s){0,15}?(?:used|asserted|checked)"
    r"|not (?:actually |really )?test(?:ing|ed)?\b(?:[\w.]|\s){0,20}?(?:throw|reject|error)"
    r"|(?:effectively |essentially )?untested"
    r"|assertion (?:is |that )?(?:vacuous|meaningless|useless|always|trivial)"
)
q4 = False
for m in _q4_id.finditer(flat):
    lo, hi = max(0, m.start() - 240), min(len(flat), m.end() + 240)
    if _q4_vac.search(flat[lo:hi]):
        q4 = True
        break

# ============================ EMIT ============================
results = [
    ("A1", sp1, "SP1 (AC5) priority default not flagged"),
    ("A2", sp2, "SP2 (AC6) listActive inversion not flagged"),
    ("A3", sp3, "SP3 (AC4) completeTodo non-persistence not flagged"),
    ("A4", sp4, "SP4 (AC7) loadTodos whole-array save not flagged"),
    ("A5", q1, "Q1 testMarkDone assertion-less not flagged"),
    ("A6", q2, "Q2 CLI swallowed-error not flagged"),
    ("A7", q3, "Q3 exportTodos fd leak not flagged"),
    ("A8", q4, "Q4 testRejectEmpty vacuous assertion not flagged"),
]
for label, ok, reason in results:
    print(f"{label}:{'PASS' if ok else 'FAIL:' + reason}")

sys.exit(0 if all(ok for _, ok, _ in results) else 1)

PY

## Trials
5

## Version
1
