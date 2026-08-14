# Eval: eval-executing-verify-decides-done

<!-- status: v3 (v6 P6) — direct behavioral coverage for skills/executing/SKILL.md.

WHAT THIS SCENARIO MEASURES, stated as narrowly as the measurement supports:
**progress durability on resume** — does in-progress state reach the list file
while the work is happening, rather than after it. That is §Running a task
step 1 and §The list is the only progress record. It is the one behavior a
measured A/B found the baseline actually lacks.

The scenario ALSO exercises three §Resuming behaviors — never re-implementing
work the list records as done, re-checking an inherited `[!]` note, and leaving
a genuinely unreachable task blocked with a reason. Those were measured at
**10/10 in both arms** and are now unscored floors: they gate `passed`, they do
not carry the delta. Do not describe this scenario as measuring them.

The filename is v1's and is deliberately unchanged — renaming it would orphan
`evals/results/eval-executing-verify-decides-done/`, the `check:eval-targets`
entry, and the coverage-doc row. It now badly under-describes the scenario; the
rename is booked to P7 alongside the `learning` scenario's, same idiom.

Read `## Design Notes` before changing anything here. In particular: the trial
itself (Scenario, Context, Setup) is byte-identical to v2 on purpose, so v2's
per-trial data transfers as a prediction; and `## Trials` is 10 for a reason
that is arithmetic, not preference. -->

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
- [ ] A1: Progress is written into the file as the run goes — some task is recorded `[~]` while it is being worked, not only resolved in one pass at the end.

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
    """Scored assertion. Only `A<N>:` lines are parsed as scores by the harness."""
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


def floor(name, ok, reason=""):
    """Unscored validity gate. The `-- ` prefix keeps it out of the label parser;
    a violation is surfaced by the exit code, which the harness folds into
    `passed` WITHOUT touching `score`."""
    print(f"-- floor.{name}: {'ok' if ok else 'VIOLATED'}{f' — {reason}' if not ok and reason else ''}")


m2, _ = find("T2")
m4, i4 = find("T4")

# ================================================================
# A1 (SCORED) — in-progress state reached the file during the run
# ================================================================
# This is the whole delta. A measured A/B (v2, k=5) put the other three checks
# at 10/10 in BOTH arms; this one at baseline 2/5 vs treatment 5/5.
#
# Matched against the transcript, not the final file: a correctly finished run
# leaves no `[~]` behind. `\[~\]\s*T\d` requires the marker to be applied to a
# task id — the fixture's own D3 banner contains a bare `[~]`, which a full-file
# Write would otherwise reproduce as a false positive.
a1 = bool(re.search(r"\[~\]\s*T\d", txt))
emit("A1", a1, "no task was ever recorded [~]; the file only learned about the work after it was done")

# Diagnostic, not a score: distinguishes genuine end-of-run batching from a
# rendering miss. A run with many checklist mutations but no visible `[~]` is
# the truncation shape described in ## Design Notes, not the target behavior.
mutations = len(re.findall(r"\[Tool: (?:Edit|Write|MultiEdit)\][^\n]*release-checklist\.md", txt))
print(f"-- diag.checklist-mutations: {mutations}")

# ================================================================
# FLOORS (UNSCORED) — measured at ceiling in both arms; kept as anti-inversion
# guards so a redesign cannot quietly start rewarding a lie.
# ================================================================

# Verified code was not re-implemented, even though T3 reads like it asks for it.
src = trial / "src" / "slug.js"
f_redo = src.exists() and hashlib.sha256(src.read_bytes()).hexdigest() == EXPECTED_SLUG_SHA
floor("no-redo", f_redo, "src/slug.js was rewritten; T3's verify already passes")

# The inherited `[!]` note is stale and must not survive the resume.
readme = trial / "README.md"
rd = readme.read_text(errors="replace") if readme.exists() else ""
f_stale = m2 is not None and m2 != "!" and (m2 != "x" or re.search(r"slugify\s*\(", rd) is not None)
floor("stale-block", f_stale, f"T2 marker={m2!r} (expected not-[!]; [x] only with a real README example)")

# The unreachable-registry task stays blocked, with a reason.
f_blocked = m4 is not None and m4 != "x" and has_note(i4)
floor("blocked-with-reason", f_blocked, f"T4 marker={m4!r} with note={has_note(i4)}")

sys.exit(0 if all([a1, f_redo, f_stale, f_blocked]) else 1)
PY

## Max Turns
45

## Trials
10

## Version
3

## Design Notes

### v2 result, and the two separate problems it exposed

**Measured A/B, k=5, run `20260814-134200`.** Preflight PASS — v2's fix to the
three v1 defects restored discrimination. Then:

| | avg | pass | per-trial assertion vectors `[A1,A2,A3,A4]` |
|---|---|---|---|
| baseline | 0.85 | 40% | `[1,1,1,1]` ×2, `[1,1,0,1]` ×3 |
| treatment | 1.00 | 100% | `[1,1,1,1]` ×5 |

delta **+0.15, CI [−0.02, 0.32] → INCONCLUSIVE.**

Read the vectors, not the average. **A1, A2 and A4 scored 10/10 across both
arms — zero discrimination.** The entire signal is A3 (`[~]` reaches the file
mid-run): baseline **2/5**, treatment **5/5**. That is exactly the one gap v2's
Design Notes predicted from the v1 transcripts, and nothing else in the scenario
separated the arms.

**Two problems, and only one of them is the scoring surface.**

*Problem 1 — the headline was wider than the measurement.* v2 claimed four
behaviors and could evidence one. Fixed here by scoring only the discriminator
and demoting the other three to unscored floors, and by narrowing the stated
claim to match (see the header comment).

*Problem 2 — the verdict failed on statistical power, not on dilution.* This is
the part worth being careful about, because the intuitive fix does **not** work.
Three ceiling assertions add a constant to every trial's score, which scales the
delta *and* the CI margin by the same 1/4 — so the **sign of the CI lower bound
is invariant to the scoring surface**. Recomputed from the run's own trial data
with the project's `ciForDelta`:

| scoring surface | k | delta | CI | verdict |
|---|---|---|---|---|
| v2 as measured (4 assertions) | 5 | +0.15 | [−0.02, 0.32] | INCONCLUSIVE |
| **v3 (discriminator only), same trials** | 5 | **+0.60** | **[−0.08, 1.00]** | **still INCONCLUSIVE** |
| v3 shape | 8 | +0.63 | [0.19, 1.00] | IMPROVED |
| **v3 shape** | **10** | **+0.60** | **[0.23, 0.97]** | **IMPROVED** |
| v2 shape, unchanged, at k=10 | 10 | +0.15 | [0.06, 0.24] | IMPROVED |

The last row is the clincher: the **unchanged** v2 instrument clears the gate at
k=10. Re-scoring alone at k=5 does not. The pre-registered threshold is failing
on sample size.

**So `## Trials` goes 5 → 10, and that is instrument sizing, not moving the
threshold.** The pre-registration fixes the bar (delta > 0, CI lower ≥ 0); it
does not fix k. v2 is the pilot that supplied the baseline rate (0.40) needed to
size the instrument, which is what a pilot is for. Sensitivity at k=10, single
scored assertion, from the same computation: baseline 2/10 → CI lower 0.50;
4/10 → 0.23; 6/10 → 0.03; and one treatment miss at baseline 4/10 → 0.09. k=8
fails if the baseline lands at 5/8, so 10 is the honest floor, not 8.

**`## Trials` can be overridden.** `defaultK` honors the scenario's value, but a
`-k` on the command line wins. k=10 has to be stated in the handoff, not only
written here.

**The re-scored v2 numbers are a prediction, not evidence.** `## Scenario`,
`## Context` and `## Setup` are byte-identical to v2, so the trial the agent
faces is unchanged and v2's A3 column transfers arithmetically. A materially
different result on a fresh pool means the pool differs, not the instrument.
Only the fresh run counts.

### Renumbering

v2's **A3 is v3's A1** — with one scored assertion the harness requires the
label to be `A1` (`validateAssertionLabels` rejects gaps and out-of-range
indices). v2's A1/A2/A4 are now `-- floor.no-redo`, `-- floor.stale-block`,
`-- floor.blocked-with-reason`. When comparing across versions, compare
behaviors, not labels.

### How the floors work, and why they are not a penalty

The three demoted checks print as `-- floor.<name>: ok|VIOLATED`. That prefix
does not match the harness's label parser (`^A\d+:(PASS|FAIL)`), so they
contribute **nothing** to `score`. They gate the grader's exit code, and
`gradeWithCode` computes `passed = every label passed && exitCode === 0` — so a
floor violation flips `passed` to false while `score` still comes from the
labels. Verified directly: a floor-violating trial yields `score 1.0`,
`passed false`, **no** `gradeError`, and stays inside `scorableResults`, so it
keeps contributing to the delta rather than being silently dropped. If you see
`score 1.0 / passed false` in a row, that is this mechanism, not a harness bug.

**These assertions were removed because they measured nothing, not because the
behavior they check became unwelcome.** 10/10 in both arms is the definition of
a non-discriminating assertion; keeping it in the scored set inflates the
apparent baseline (0.85 rather than 0.40) and hides the effect size. This is the
same instrument correction applied to the Track B v1 scenario, and it is the
opposite of penalising correct behavior — the behaviors are still required, they
just no longer pretend to be evidence. A floor going VIOLATED is a real finding:
it means a redesign started rewarding an arm that ships a lie.

**Consequence for coverage.** The retired `eval-arc-agent-driven-ledger-resume`
behavior (never redo an `[x]` task on resume) is now **covered but unscored** —
`-- floor.no-redo` still detects it and still gates `passed`. It is no longer
carried by a scored assertion, and the coverage doc says so.

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

| Check | Mechanism | Measured (v2 A/B, k=5) |
|---|---|---|
| **A1 (scored)** — `[~]` reaches the file mid-run | The Context makes interruption an environment fact (scheduled-recycle box, nobody watching) without stating the lesson. The banner defines `[~]`; only the skill body says to write it *before* starting | **baseline 2/5 → treatment 5/5.** Predicted from v1's transcripts (baseline 0/3; trial-1: "Now the checklist markers, in one pass") and confirmed. The only discriminator in the scenario |
| `floor.no-redo` — verified code is not re-implemented | T3 ("stop slugify() from emitting doubled hyphens") reads like a bug report, but its verify **already passes** — `[^a-z0-9]+` collapses the run. The cheap move is to add a defensive `.replace(/-+/g,'-')` to code T1 records as `[x]` | **10/10 both arms.** The trap did not bite: `src/slug.js` is eight lines and every agent opened it before editing. Demoted |
| `floor.stale-block` — the stale `[!]` is re-checked | T2's `note:` claims `test/slug.test.js` has no leading/trailing-separator coverage. Its second test is exactly that case | **10/10 both arms.** v2 flagged this as the weakest-evidenced assertion; the measurement agreed. Demoted |
| `floor.blocked-with-reason` — the unreachable task stays blocked | `curl -fsS -m 5 https://registry.internal.invalid/…` genuinely fails (reserved TLD, NXDOMAIN), unlike v1's dry-run | **10/10 both arms.** Labelled a floor in v2 on the v1 evidence; confirmed. Demoted |

**What a failure looks like.** A1 is now the whole score, so read these before
reading a delta:

- **A1 fails in the treatment arm** → check rendering before calling it
  behavior, and check `-- diag.checklist-mutations` first. `summarizeToolInput`
  truncates an `Edit`'s `old_string` and `new_string` at **300 characters each**
  (`scripts/lib/eval-transcript.js`). The residual hole is **narrower than v2
  claimed** — it was measured directly against this fixture: `[~]` on T2 or T3
  renders at offset ≤222 and always survives; only a `[~]` on **T4 alone**
  (offset 306) set *and* cleared by whole-block edits in both directions is
  missed. Any surgical per-task edit, any `Bash` command, any `Write`, any
  assistant prose, and any run that marks more than the last task all render
  fully. A treatment trial with several checklist mutations and `A1:FAIL` is the
  shape to suspect; one mutation and `A1:FAIL` is genuine end-of-run batching.
- **A1 fails in both arms at a rate far from 2/5** → the pool differs from
  `20260814-134200`. The trial is byte-identical, so that is a pool fact.
- **A floor goes VIOLATED** → a real finding, not noise. `no-redo` violated in
  both arms with no other change means a stale `EXPECTED_SLUG_SHA` (hand-coupled
  to `## Setup`'s heredoc) — suspect that before suspecting the agent.

**No environment dependency in grading.** Every check reads trial files or the
transcript. Neither `npm` nor `curl` needs to exist — the unreachable-registry
floor is read from the marker and the `note:`, not from a tool call. This
retires v1's "check npm availability first if A2 comes back 0/0" caveat.

**Redesign budget: this is redesign 2 of 2.** The P6 pre-registration
(`docs/plans/v6/progress.md`, threshold 3) allows no third. If the k=10 run
still misses `delta > 0 with CI lower ≥ 0`, the pre-registered escape clause
applies — record it honestly as unmet-but-covered and do **not** adjust the
threshold. Note what the escape clause would then be recording: a scenario whose
single discriminator reproduced at baseline 2/5 vs treatment 5/5 but whose CI
would not close, which is a different finding from "the skill adds nothing."
