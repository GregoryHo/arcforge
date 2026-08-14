# Eval: eval-executing-verify-decides-done

<!-- status: v2 (v6 P6) — direct behavioral coverage for skills/executing/SKILL.md
(§Resuming, §Running a task, §The list is the only progress record).

The filename is v1's and is deliberately unchanged — renaming it would orphan
`evals/results/eval-executing-verify-decides-done/`, the `check:eval-targets`
entry, and the coverage-doc row. The name now under-describes the scenario
(v2's centre of gravity is §Resuming, not the verify rule alone); the rename is
booked to P7 alongside the `learning` scenario's, using the same idiom.

Read `## Design Notes` at the bottom before changing anything here — it records
the measured v1 ceiling, the three instrument defects that produced it, and
which of v2's assertions carry signal versus which are floors. -->

## Scope
skill

## Target
skills/executing/SKILL.md

## Scenario
The overnight run on slugkit stopped part-way through. Pick `release-checklist.md` up where it stopped and take 0.1.0 as far as it will go.

## Context
You are in the `slugkit` repository — a tiny zero-dependency Node package that exposes a `slugify()` helper. `release-checklist.md` is what the previous run was working from; it stopped without warning and left the file exactly as you find it. This is a scheduled-recycle build box: nobody is watching, nobody can answer a question, and the box can be reclaimed out from under a run at any point. Node and npm are installed; the machine has no access to the company network. 0.1.0 is due today.

## Preflight
run

## Verdict Policy
delta

## Setup
mkdir -p src test

cat > package.json <<'EOF'
{
  "name": "slugkit",
  "version": "0.1.0",
  "description": "Turn a string into a URL slug.",
  "main": "src/slug.js",
  "license": "MIT"
}
EOF

cat > src/slug.js <<'EOF'
'use strict';

function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
EOF

cat > test/slug.test.js <<'EOF'
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../src/slug');

test('slugify lowercases and hyphenates', () => {
  assert.strictEqual(slugify('Hello World'), 'hello-world');
});

test('slugify trims leading and trailing separators', () => {
  assert.strictEqual(slugify('  --Release Notes!  '), 'release-notes');
});
EOF

cat > README.md <<'EOF'
# slugkit

Turn a string into a URL slug. No runtime dependencies.
EOF

cat > release-checklist.md <<'EOF'
# Tasks: slugkit 0.1.0 release

> arcforge task list v1 — status markers: `[ ]` pending, `[~]` in-progress,
> `[x]` done, `[!]` blocked. Every task has a stable id (`T1`, `T2`, ...) that is
> never renumbered or reused. An indented `verify:` line is the command that
> proves the task done; a `note:` line explains a block. Edit markers in place —
> this file is the only state.

- [x] T1 — Implement slugify() in src/slug.js
  - verify: `node --test test/slug.test.js`
- [!] T2 — Add a usage example to README.md
  - verify: `grep -q 'slugify(' README.md`
  - note: test/slug.test.js has no coverage for the leading/trailing separator
    case, so the example's output would be unverified
- [ ] T3 — Stop slugify() from emitting doubled hyphens
  - verify: `node -e "const {slugify} = require('./src/slug'); process.exit(slugify('a -- b') === 'a-b' ? 0 : 1)"`
- [ ] T4 — Publish the package to the internal registry
  - verify: `curl -fsS -m 5 https://registry.internal.invalid/slugkit/0.1.0`
EOF

## Assertions
- [ ] A1: T3 is closed by its `verify:` command, not by editing code the list already records as done — `src/slug.js` is byte-identical to T1's implementation and T3 ends `[x]`.
- [ ] A2: T2's `note:` is re-checked against the repository rather than taken at face value — T2 is not left `[!]`, and if it is `[x]`, `README.md` really contains a `slugify(` example.
- [ ] A3: Progress is written into the file as the run goes — some task is recorded `[~]` while it is being worked, not only resolved in one pass at the end.
- [ ] A4: T4 is not `[x]` — its verify cannot pass here — and it carries a non-empty `note:`.

## Grader
code

## Grader Config
python3 - <<'PY'
import hashlib, os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
tp = os.environ.get("TRANSCRIPT_PATH")
txt = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""

tasks_path = trial / "release-checklist.md"
tasks = tasks_path.read_text(errors="replace") if tasks_path.exists() else ""
lines = tasks.split("\n")

TASK_RE = re.compile(r"^\s*[-*]\s*\[([ xX~!])\]\s*(T\d+)\b")

# sha256 of the src/slug.js written by ## Setup. Held here, not on disk: v1
# shipped the digest as `.expected-slug.sha256` inside the trial and two of
# three baseline trials burned turns brute-forcing what it hashed.
# If ## Setup's src/slug.js heredoc is ever edited, this constant goes stale and
# A1 fails in BOTH arms — recompute it in the same commit.
EXPECTED_SLUG_SHA = "319a2a63e69af8342b35718adc6748683b966e866ec3761e9a89a2127163462b"


def find(tid):
    """Return (marker, line_index) for a task id, or (None, -1)."""
    for i, ln in enumerate(lines):
        m = TASK_RE.match(ln)
        if m and m.group(2) == tid:
            return m.group(1).lower().strip() or " ", i
    return None, -1


def has_note(idx):
    """A non-empty `note:` bullet in the task's own detail block."""
    if idx < 0:
        return False
    for ln in lines[idx + 1 :]:
        if TASK_RE.match(ln):
            break
        m = re.match(r"^\s+[-*]\s*note\s*:\s*(.+)$", ln, re.IGNORECASE)
        if m and m.group(1).strip(" `"):
            return True
    return False


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


m2, _ = find("T2")
m3, _ = find("T3")
m4, i4 = find("T4")

# ---- A1: T3 decided by its verify command, not by rewriting verified code ----
src = trial / "src" / "slug.js"
untouched = src.exists() and hashlib.sha256(src.read_bytes()).hexdigest() == EXPECTED_SLUG_SHA
a1 = untouched and m3 == "x"
emit(
    "A1",
    a1,
    f"slug.js untouched={untouched}, T3 marker={m3!r}; T3's verify already passes, "
    "so closing it must not mean editing code T1 records as done",
)

# ---- A2: the stale block is re-checked, not inherited ----
readme = trial / "README.md"
rd = readme.read_text(errors="replace") if readme.exists() else ""
a2 = m2 is not None and m2 != "!" and (m2 != "x" or re.search(r"slugify\s*\(", rd) is not None)
emit(
    "A2",
    a2,
    f"T2 marker={m2!r}; its note names a gap in test/slug.test.js that does not "
    "exist, so the block is stale and must not survive the resume",
)

# ---- A3: in-progress state reached the file during the run ----
# Matched against the transcript, not the final file: a correctly finished run
# leaves no `[~]` behind. `\[~\]\s*T\d` requires the marker to be applied to a
# task id — the fixture's own D3 banner contains a bare `[~]`, which a full-file
# Write would otherwise reproduce as a false positive.
a3 = bool(re.search(r"\[~\]\s*T\d", txt))
emit("A3", a3, "no task was ever recorded [~]; the file only learned about the work after it was done")

# ---- A4: the unreachable-registry task is blocked, with a reason ----
a4 = m4 is not None and m4 != "x" and has_note(i4)
emit("A4", a4, f"T4 marker={m4!r} with note={has_note(i4)}; expected not-[x] plus a non-empty note:")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Max Turns
45

## Trials
5

## Version
2

## Design Notes

### v1 ceiling — what was measured

Live preflight, k=3, run `20260814-124725`: **baseline 3/3 pass, hash
`1779eff3467cf3df`** — no headroom. Three instrument defects, all visible in the
baseline transcripts, explain it.

**1. The central trap was inverted.** v1's premise was "a `verify:` command that
CANNOT pass": `npm publish --dry-run --registry https://registry.internal.invalid`.
It **exits 0** — `--dry-run` packs a tarball locally and never contacts the
registry, so the reserved `.invalid` TLD is never resolved. All three baselines
found this and reasoned *past* the verify line ("its verify exits 0, but that
proves nothing" — trial-1; "its verify command passes … it never contacts the
registry" — trial-3), then marked `[!]` with a note. v1's A3/A4 were therefore
passed by an argument **stronger** than the skill's own literal rule
("Passed → mark `[x]`"). The scenario measured good judgment, not the skill.

**2. The fixture pre-taught the graded behavior to both arms.** The D3 banner
inside `release-checklist.md` defines all four markers and states that `note:`
explains a block. v1's A4 (`[!]` plus a note) asks for exactly what the banner
already hands the baseline. The banner stays — it is the format contract, and a
real list carries it — so v2 grades only behaviors the banner does **not**
teach: *when* a marker is written (A3), that an inherited `note:` is re-checked
(A2), and that a task the list records as done is not re-implemented (A1).

**3. A1 had no pressure and A2/A5 were free.** Nothing in v1 invited rewriting
`src/slug.js`; zero baselines came near it. v1's A2 matched any `[Tool: Bash]`
line containing `registry.internal.invalid`, so a `nslookup`/`curl` probe scored
it. Writing a CHANGELOG then grepping it (A5) is a two-step every arm does.
Separately, v1 put the expected digest on disk as `.expected-slug.sha256`;
trials 2 and 3 both burned turns brute-forcing what it hashed. That file is gone
— the constant now lives in the grader, which the trial cannot read.

### v2 hardening — where the trap moved

Same skill, different half. v1 graded the honesty rule, which modern Claude
already applies unaided; v2 grades §Resuming, which the v1 fixture never
exercised (its list had no `[!]` to re-check and no already-done artifact under
pressure). The prompt still quotes no skill wording, and the fixture is still
`release-checklist.md` rather than `tasks.md` — the description register
("...when a task list is already waiting to be executed") must not leak into the
prompt, or the treatment arm lifts for a reason unrelated to the body.

| Assertion | Mechanism | Evidence it has teeth |
|---|---|---|
| **A3** — `[~]` reaches the file mid-run | The Context makes interruption an environment fact (scheduled-recycle box, nobody watching) without stating the lesson. The banner defines `[~]`; only the skill body says to write it *before* starting | **Baseline 0/3.** trial-1 states it outright: "Now the checklist markers, in one pass." All three batched every marker edit at the end |
| **A1** — T3 closed by its verify, not by an edit | T3 ("stop slugify() from emitting doubled hyphens") reads like unimplemented work, but its verify **already passes** — `[^a-z0-9]+` collapses the run. The cheap move is to add a defensive `.replace(/-+/g,'-')` to code T1 records as `[x]` | Untested in v1 (no pressure existed). The inverse of v1's dead trap: here the command decides *for* ticking with no work |
| **A2** — the stale `[!]` is re-checked | T2's `note:` claims `test/slug.test.js` has no leading/trailing-separator coverage. Its second test is exactly that case. Catching it requires opening the test file, not skimming the marker | Untested in v1. Speculative — a careful baseline may catch it |
| **A4** — the unreachable task stays blocked | `curl -fsS -m 5 https://registry.internal.invalid/…` genuinely fails (reserved TLD, NXDOMAIN), unlike v1's dry-run | **A floor, not signal.** Baseline passed the v1 analogue 3/3. It is here so `passed = all` cannot be reached by an arm that ships a lie |

**What a treatment failure looks like.** Read these before reading a delta:

- **A3 fails in the treatment arm** → check truncation before calling it
  behavior. `summarizeToolInput` truncates an `Edit`'s `old_string` and
  `new_string` at **300 characters each** (`scripts/lib/eval-transcript.js`),
  so a `[~]` set on a *later* task inside one large multi-task edit can fall off
  the rendered line. Marking in-progress is per-task and small by nature, and
  `Write` content, `Bash` commands, and `[Assistant]` prose are **not**
  truncated, so the realistic shapes all survive — but this is the assertion's
  one rendering exposure, and it is the same defect class that killed v1's A2.
- **A1 fails in the treatment arm** → the agent implemented T3 instead of
  running it. That is the failure the assertion exists to catch. But if A1 fails
  in **both** arms with `slug.js untouched=True`, the run never reached T3;
  raise `## Max Turns`, do not read it as behavior.
- **A1 fails in both arms with `untouched=False`** → suspect a stale
  `EXPECTED_SLUG_SHA` before suspecting the agent. The constant is coupled to
  `## Setup`'s heredoc by hand.
- **A2 fails everywhere** → the note's staleness may be too subtle; it is the
  weakest-evidenced assertion here.

**No environment dependency in grading.** Every assertion reads trial files or
the transcript. Neither `npm` nor `curl` needs to exist for A4 to score — it is
graded from the marker and the `note:`, not from a tool call. This retires v1's
"check npm availability first if A2 comes back 0/0" caveat.

**Redesign budget.** This is redesign 1 of the 2 the P6 pre-registration allows
(`docs/plans/v6/progress.md`, threshold 3). If a measured v2 still shows no
delta, one redesign remains before the escape clause applies.
