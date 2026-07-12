# Design — Merge the per-task spec-reviewer + quality-reviewer into a single `task-reviewer` (SP6 Recommendation 2)

> **Status: PROPOSAL — awaiting owner ratification + arc-evaluating gate. No execution until approved.**
> This is the reason the SP6 borrowing loop did **not** auto-apply this change: it has
> cross-consumer blast radius (`agents/spec-reviewer.md` is used standalone by
> `arc-dispatching-parallel` and `arc-dispatching-teammates`), and the containment
> decision (§4, Decision 1) determines whether two *other* shipped skills get touched —
> a cross-consumer architecture call no in-loop refactor may make unilaterally.
> Read-only planning output. Consumer facts verified by whole-repo grep against HEAD
> `0b1b226` (branch `feat/superpowers6-borrowings`).

---

## 1. Goal & scope

Port Superpowers 6's single-reviewer contract into arcforge's per-task review loop:
collapse `arc-agent-driven`'s **two sequential per-task reviewers** (spec-reviewer, then
quality-reviewer) into **one `task-reviewer`** that reads the task's change once and
returns **both** a Spec Compliance verdict and a Task Quality verdict, plus SP6's
anti-gaming, cannot-verify, plan-mandated-defect, and single-batch-fix rules. SP6
measured this collapse at ≈ 2× faster / ≈ 50% fewer tokens per per-task review (its
single largest efficiency win, ~15%).

**In scope:** the per-task review gate of `arc-agent-driven` and its supporting
`agents/` + `templates/` surface.

**Explicitly out of scope** (adjacent SP6 recommendations — cross-referenced, not folded
in here):
- **Rec 3** — `review-package` / `task-brief` pre-baked file handoff scripts. `task-reviewer`
  ships with SP6's built-in *"fetch the diff yourself"* fallback; the `[DIFF_FILE]`
  handoff is a later layer.
- **Rec 6** — durable per-task progress ledger.
- **Rec 7** — model-selection ladder / explicit-model-per-dispatch.
- The `arc-requesting-review` `HEAD~1` base bug (independent small fix).

This design changes shipped skill behavior, so it is gated behind `arc-evaluating`
(§8). It is a **design for ratification**, not an implementation.

---

## 2. Current review flow (as-is)

`arc-agent-driven` runs, per task: implementer → **spec-reviewer subagent** (must PASS)
→ **quality-reviewer subagent** (must PASS) → mark complete. Max 3 cycles per reviewer
(up to 6 reviewer dispatches per task). Two agents, two templates, two report formats:

| Role | Agent | Template | Tools | Verdict vocabulary |
|---|---|---|---|---|
| Spec compliance | `agents/spec-reviewer.md` | `templates/spec-reviewer-prompt.md` | Read, Grep, Glob | `PASS` / `FAIL` (Missing / Extra / Misunderstand) |
| Code quality | `agents/quality-reviewer.md` | `templates/quality-reviewer-prompt.md` | Read, Grep, Glob, Bash | "Ready to proceed? Yes / No / With fixes" (Critical / Important / Minor) |

Both templates already carry the arcforge **"Do Not Trust the Implementer Report"**
core. Neither has SP6's ⚠️ cannot-verify verdict, anti-gaming rules, plan-mandated-defect
escalation, or single-batch-fix rule.

---

## 3. Blast-radius findings (verbatim consumer list)

Whole-repo sweep (`grep -rn "spec-reviewer\|quality-reviewer\|spec-reviewer-prompt\|quality-reviewer-prompt"`
across `.md .js .json .sh .py .txt`, excluding `.git/`, `node_modules/`, and harness log
captures). The load-bearing fact is the **consumer asymmetry**:

> **`quality-reviewer` has exactly ONE functional consumer** (the `arc-agent-driven`
> per-task loop). **`spec-reviewer` has THREE functional consumers** — `arc-agent-driven`
> (per-task) *plus* `arc-dispatching-parallel` and `arc-dispatching-teammates`, which
> dispatch it **standalone** for epic-acceptance, paired with `verifier`, at
> **whole-merged-branch granularity**.

### 3a. `arc-agent-driven` — per-task two-stage loop (the ONLY consumer of both reviewers)
- `skills/arc-agent-driven/SKILL.md:8` — "two-stage review after each: spec compliance review first, then code quality review"
- `skills/arc-agent-driven/SKILL.md:10` — core principle: "two-stage review (spec then quality)"
- `skills/arc-agent-driven/SKILL.md:51-82` — process digraph nodes: "Dispatch spec reviewer subagent" → "Dispatch code quality reviewer subagent"
- `skills/arc-agent-driven/SKILL.md:90` — "Max review cycles: 3 per reviewer"
- `skills/arc-agent-driven/SKILL.md:99` — pre-built agent `spec-reviewer` — "Spec compliance verification (read-only)"
- `skills/arc-agent-driven/SKILL.md:100` — pre-built agent `quality-reviewer` — "Code quality assessment (read-only + test runner)"
- `skills/arc-agent-driven/SKILL.md:105` — template `./spec-reviewer-prompt.md`
- `skills/arc-agent-driven/SKILL.md:106` — template `./code-quality-reviewer-prompt.md` *(see §3f — filename inconsistency)*
- `skills/arc-agent-driven/SKILL.md:167-168` — Available Agents table rows for spec-reviewer + quality-reviewer
- `skills/arc-agent-driven/SKILL.md:198,208` — Red Flags: "Skip reviews (spec compliance OR code quality)", "Start code quality review before spec compliance"

### 3b. `arc-dispatching-parallel` — **standalone spec-reviewer** (conditional, spec-gated; paired with `verifier`)
- `skills/arc-dispatching-parallel/SKILL.md:109` — "When a spec exists, also the `spec-reviewer` agent with the relevant `specs/<spec-id>/.../*.md` attached — it confirms every acceptance criterion in the integrated branch"
- `skills/arc-dispatching-parallel/SKILL.md:112` — "Integrate all changes only after the verifier (and spec-reviewer, if run) PASS"
- `skills/arc-dispatching-parallel/SKILL.md:212` — verification gate: "the `verifier` agent, plus the `spec-reviewer` agent when a spec exists"
- `skills/arc-dispatching-parallel/SKILL.md:312` — Cross-Platform Dispatch: "The `verifier` and `spec-reviewer` agents in the verification gate…"
- **Uses `spec-reviewer` for spec-compliance ONLY. Does NOT use `quality-reviewer` at all.** Quality is not part of this gate; `verifier` runs the suite.

### 3c. `arc-dispatching-teammates` — **standalone spec-reviewer** (epic acceptance; paired with `verifier`)
- `skills/arc-dispatching-teammates/SKILL.md:58` — Step 6 Spec compliance: `Agent(subagent_type='arcforge:spec-reviewer')` with `epic.md` + `features/*.md`, "returns PASS/FAIL with file:line evidence"
- `skills/arc-dispatching-teammates/SKILL.md:100` — Red Flag: "Always dispatch `arcforge:spec-reviewer` per Step 6; it has fresh context and cannot rationalize"
- `skills/arc-dispatching-teammates/SKILL.md:124` — "Each accepted epic MUST show subagent evidence (spec-reviewer + verifier PASS)"
- `skills/arc-dispatching-teammates/SKILL.md:138` — After This Skill: "dispatches `arcforge:spec-reviewer` + `arcforge:verifier` per Step 6"
- `skills/arc-dispatching-teammates/references/acceptance-and-retry.md:39` — prose: "delegates every task to spec-reviewer + quality-reviewer subagents" *(describes arc-agent-driven's pattern as precedent — updated for accuracy if quality-reviewer retires)*
- `skills/arc-dispatching-teammates/references/acceptance-and-retry.md:47-77` — full dispatch template: `subagent_type='arcforge:spec-reviewer'`, invokes the three-check pattern (Missing / Extra / Misunderstand), Spec Compliance Review format
- `skills/arc-dispatching-teammates/references/acceptance-and-retry.md:121,134,142-186` — evidence-log format + spec-defect-vs-impl-defect override protocol built on the spec-reviewer PASS/FAIL verdict
- `skills/arc-dispatching-teammates/references/wrap-up-sequence.md:37,42,46,66` — Final Report evidence format: `spec-reviewer: PASS (<X>/<Y> ACs)`
- **Uses `spec-reviewer` standalone at whole-merged-epic granularity. Does NOT use `quality-reviewer`.** The verdict token `PASS/FAIL` and the three-check pattern are load-bearing for the override-accept protocol.

### 3d. Agent + template definitions (the merge subjects)
- `agents/spec-reviewer.md` — spec-compliance agent (Read, Grep, Glob)
- `agents/quality-reviewer.md` — quality agent (Read, Grep, Glob, Bash)
- `templates/spec-reviewer-prompt.md` — spec-compliance template
- `templates/quality-reviewer-prompt.md` — quality template

### 3e. Descriptive / shipped-doc surface (must be kept accurate, but no dispatch logic)
- `README.md:200-201` — Agents table: `spec-reviewer` / `quality-reviewer` (both attributed to arc-agent-driven) — **shipped**
- `README.md:219-220` — templates list: `templates/spec-reviewer-prompt.md`, `templates/quality-reviewer-prompt.md` — **shipped**
- `website/page/sdd.js:321` — rendered marketing text: "TWO-STAGE REVIEW — spec-reviewer → quality-reviewer" — **shipped website** (arc-releasing bumps the website; this string encodes the two-stage shape)
- `docs/README.md:33` — "both spec-reviewer and verifier must PASS" (teammates path; spec-reviewer standalone — unaffected by the merge under Option A)
- `docs/guide/skills-reference.md:302,311` — teammates acceptance: `spec-reviewer` + `verifier` (unaffected under Option A)

### 3f. Tests pinning the two-reviewer structure
- `tests/skills/test_skill_arc_agent_driven.py:46` — `assert "spec-reviewer-prompt.md" in text`
- `tests/skills/test_skill_arc_agent_driven.py:47` — `assert "code-quality-reviewer-prompt.md" in text` — **pins a string that does not name a real file** (the actual template is `templates/quality-reviewer-prompt.md`; there is no `code-quality-reviewer-prompt.md` anywhere). This is a **filename inconsistency** the migration must reconcile (SKILL.md:106 + this pin both carry the stale `code-` prefix; `./`-prefix also implies skill-local while templates live in `templates/`). CHANGELOG:689 shows this exact filename churned before.
- `tests/skills/test_skill_arc_agent_driven.py:53-54` — `assert "spec compliance" in text.lower()` and `assert "code quality" in text.lower()` (structural pins on the two-stage vocabulary)
- `tests/integration/sdd-v2-pipeline/test-arc-agent-driven.sh:71` — live-eval prompt: "run spec-reviewer and quality-reviewer after each task completes"
- Harness capture logs under `tests/integration/claude-code/.claude/logs/…` describe the two-stage flow narratively — **not structural pins** (regenerated artifacts, not asserted).

### 3g. Contributor-only / historical (NOT shipped — no migration action beyond accuracy)
- `.claude/rules/templates-commands-agents.md:24`, `CONTRIBUTING.md:272` — cite `quality-reviewer-prompt.md` as an example template (contributor docs)
- `SP6-PROGRESS.md:59` — the SP6 borrowing tracker **explicitly pre-flags this exact change as a likely BLOCKED-DECISION**: *"cross-consumer blast radius … treat the actual reviewer merge as a likely BLOCKED-DECISION: author the design, stop, let the maintainer ratify. Do not force an unverified cross-consumer refactor."* — corroborates the ratification gate.
- `CHANGELOG.md:55,439,524,689` and `docs/plans/*` — historical record, not live consumers.

---

## 4. Proposed design

### 4.1 Why a literal three-into-one merge is wrong

SP6's `task-reviewer` reviews **one task's diff** (`BASE..HEAD`), and its verdict set
includes **⚠️ Cannot verify from diff** — a verdict that only makes sense when the unit of
review is a diff. Epic-acceptance (`arc-dispatching-parallel` / `arc-dispatching-teammates`)
reviews a **whole merged branch against many acceptance-criteria files**, returns
**PASS/FAIL**, and delegates the run-the-suite / quality concern to `verifier`. These are
**different granularities and different verdict shapes**. Folding all three roles into one
prompt is a category error.

Therefore the port is: **retire `quality-reviewer`, introduce `task-reviewer` for the
per-task loop, and keep `spec-reviewer` standalone and byte-unchanged for epic acceptance.**
Under this framing the "merge" collapses the *two per-task reviewers* — it does not touch
the epic-acceptance path at all.

### 4.2 Containment options (Decision 1 — needs sign-off)

| Option | Shape | Touches parallel/teammates? | Recommendation |
|---|---|---|---|
| **A (recommended)** | New `task-reviewer` (per-task, dual verdict) + retire `quality-reviewer`; `spec-reviewer` stays as the standalone epic-acceptance agent, unchanged | **No** (zero diff to those skills) | **Recommended** — smallest blast radius; preserves the ⚠️ cannot-verify verdict only where it applies |
| B | One parameterized reviewer with `[REVIEW_SCOPE] = spec-only \| full`; epic consumers pass `spec-only` | Yes — both consumers rewire to pass the mode + bridge the diff-vs-spec-files granularity gap | Not recommended — must suppress ⚠️ cannot-verify in whole-branch mode; larger blast radius |
| C | `task-reviewer` (per-task) + rename `spec-reviewer` → `spec-verifier` for clarity | Yes — rename ripples through parallel/teammates + references + evidence strings | Not recommended — pure churn; the name `spec-reviewer` is already load-bearing in the override-accept protocol |

**Recommended: Option A.** Cost: the spec-compliance three-check pattern (Missing / Extra /
Misunderstand) then lives in **both** `spec-reviewer` (whole-branch) and `task-reviewer`
Part 1 (diff-scoped). See Decision 2 for how to handle that overlap.

### 4.3 The merged `task-reviewer` contract (per-task, Option A)

New `agents/task-reviewer.md` + `templates/task-reviewer-prompt.md`. One dispatch, read
the task's change once, return **both** verdicts. Contract elements (ported from SP6's
`task-reviewer-prompt.md`, preserving arcforge's existing "Do Not Trust the Report" core):

1. **Dual verdict in one pass.** Part 1 Spec Compliance (`✅` / `❌` with file:line) and
   Part 2 Task Quality (`Approved` / `Needs fixes`, with Critical / Important / Minor).
2. **Third verdict: ⚠️ Cannot verify from diff.** Report requirements that live in
   unchanged code or span tasks as ⚠️, alongside the ✅/❌ for everything verifiable.
   **The controller must resolve ⚠️ items itself — it must NOT tell the reviewer to
   broaden its search**, and must not delegate the resolution back.
3. **Do Not Trust the Report (strengthened).** Keep arcforge's core; add SP6's sharpening:
   design rationales in the report ("left it per YAGNI", "kept it simple deliberately")
   are claims too — a stated rationale never downgrades a finding's severity.
4. **Anti-gaming rules (controller-side, land in arc-agent-driven).** The controller must
   **NOT** instruct the reviewer to ignore specific issues, and must **NOT** pre-assign
   severity. The reviewer categorizes by actual severity independently.
5. **Plan-mandated defects escalate to the human.** If the plan/brief explicitly mandates
   something the quality rubric calls a defect (a test that asserts nothing, verbatim
   duplication), that IS a finding — reported as Important, labeled **plan-mandated**. The
   plan's authorship does not grade its own work; the human decides.
6. **Tests already ran.** The implementer ran tests with TDD evidence; the reviewer does
   not re-run the suite to confirm — only a focused test when reading raises a specific
   doubt. (This trims quality-reviewer's current unconditional `npm test` + `npm run lint`.)
7. **Read the change once; don't crawl.** Inspect outside the change only to evaluate a
   named, concrete risk. Absent the Rec-3 `[DIFF_FILE]` package, use SP6's fallback:
   `git diff --stat BASE..HEAD` + `git diff BASE..HEAD` (never `HEAD~1` — truncates
   multi-commit tasks).

**Verdict-vocabulary reconciliation (part of Decision 2).** Three token sets exist today
(spec-reviewer `PASS/FAIL`; quality-reviewer "Ready to proceed? Yes/No/With fixes"; SP6
`✅/❌/⚠️` + `Approved/Needs fixes`). The merged contract adopts **one** set — proposed:
Spec `✅ / ❌ / ⚠️`, Quality `Approved / Needs fixes`. Note `spec-reviewer` keeps its
existing `PASS/FAIL` because the teammates override-accept protocol and Final-Report
evidence strings (`spec-reviewer: PASS (X/Y ACs)`) are pinned to those tokens.

### 4.4 Preserving the standalone spec-verification path (the load-bearing guarantee)

Under Option A, `agents/spec-reviewer.md`, `templates/spec-reviewer-prompt.md`,
`arc-dispatching-parallel/SKILL.md`, and all of `arc-dispatching-teammates/` (SKILL +
`references/`) are **not modified** — except the single accuracy fix at
`acceptance-and-retry.md:39` (drop "+ quality-reviewer" from the descriptive precedent
sentence, since arc-agent-driven no longer runs quality-reviewer separately). This is
**verifiable**: see Acceptance Criterion 5 (zero functional diff to those two skills).

### 4.5 Final whole-branch review — single batch-fix (Decision 3)

SP6 routes final whole-branch review findings to **one** batch-fix subagent. arc-agent-driven
today routes "Multiple independent issues? → `arc-dispatching-parallel` for fixes"
(SKILL.md:77-81, digraph) — a fan-out. These are two different shapes; the migration must
pick one (see Decision 3). Recommendation: **keep arcforge's fan-out** (it predates and
composes with `arc-dispatching-parallel`) and document the SP6 single-batch-fix as the
default when issues are not independent — but flag for owner call.

---

## 5. Sequenced migration tasks

Dependency spine: **T1 → T2 → T3** land together in one PR (JOINT-GREEN: rewiring the skill
while tests pin the old structure is RED, and vice-versa). **T4** is the eval, gating the
merge. **T5** (docs/website) rides the same PR. Format mirrors the reference plan
(`docs/plans/2026-06-26-sdd6-skill-migration-completion-plan.md`).

### T1 — Author `task-reviewer` agent + template (additive)
- **變更:** Add `agents/task-reviewer.md` (Read, Grep, Glob, Bash; `model: sonnet` to match
  existing — see Decision 6) and `templates/task-reviewer-prompt.md` carrying the §4.3
  contract. Keep `agents/spec-reviewer.md` + `templates/spec-reviewer-prompt.md` untouched.
- **驗收條件:** Both new files exist; `task-reviewer-prompt.md` contains all six §4.3
  elements (dual verdict, ⚠️ cannot-verify, strengthened do-not-trust, anti-gaming,
  plan-mandated, tests-already-ran) + the `HEAD~1`-forbidden diff fallback. New
  `tests/skills/` or agent-frontmatter assertions pass. `npm run lint` clean.
- **停止條件:** The dual-verdict format cannot express a verdict the two current templates
  produce without loss (e.g., quality-reviewer's Strengths section has no home) — stop and
  surface the contract gap.
- **Eval re-run:** No (additive; eval at T4).

### T2 — Rewire arc-agent-driven per-task loop to the single `task-reviewer`
- **變更:** Replace the two-stage per-task loop with one `task-reviewer` dispatch returning
  both verdicts (keep max-3-cycles → now 3 per task, not 6). Update the digraph, the
  "Agents & Templates" list (drop quality-reviewer; point template ref at
  `task-reviewer-prompt.md`), the Available Agents table, and the Red Flags (replace
  "Start code quality review before spec compliance" with the anti-gaming rules from §4.3
  #4). Retire `agents/quality-reviewer.md` + `templates/quality-reviewer-prompt.md`.
- **驗收條件:** `arc-agent-driven/SKILL.md` references `task-reviewer` and no longer
  dispatches two sequential reviewers; `grep -rn quality-reviewer skills/arc-agent-driven`
  = 0; anti-gaming + plan-mandated + ⚠️ cannot-verify rules present. The controller-side
  anti-gaming instruction (do not coach the reviewer / do not pre-assign severity) is in
  the SKILL.
- **停止條件:** Collapsing to one gate removes a checkpoint the eval (T4) shows is
  load-bearing (quality defects slip that the two-stage caught) — stop; do not ship the
  collapse.
- **Eval re-run:** Yes (folds into T4).

### T3 — Reconcile tests + descriptive surface pinning the two-reviewer structure
- **變更:** `tests/skills/test_skill_arc_agent_driven.py`: retarget the template-name pins
  (46/47) to `task-reviewer-prompt.md` (and drop the stale `code-quality-reviewer-prompt.md`
  string — §3f); retarget the two-stage-vocabulary pins (53/54) to the dual-verdict
  contract. `tests/integration/sdd-v2-pipeline/test-arc-agent-driven.sh:71`: reword to
  "run task-reviewer after each task completes". `README.md:200-201,219-220` and
  `website/page/sdd.js:321`: update the Agents table, templates list, and the "TWO-STAGE
  REVIEW — spec-reviewer → quality-reviewer" string to the single-reviewer shape.
  `acceptance-and-retry.md:39`: drop "+ quality-reviewer" (accuracy only).
- **驗收條件:** `npm run test:skills` green; no assertion deleted to pass — each retargeted
  to a string genuinely in the migrated skill. README + website describe one per-task
  reviewer. `arc-dispatching-parallel/SKILL.md` and `arc-dispatching-teammates/` (SKILL +
  references) show **zero functional diff** (only the one accuracy word at :39).
- **停止條件:** A retargeted assertion can only pass by weakening what it guards — stop and
  surface (mirror the reference plan's M3 highest-judgment gate).
- **Eval re-run:** No (structure/doc; behavior proven at T4).

### T4 — Behavioral A/B eval (arc-evaluating) — the firm ship gate
- **變更:** Author a behavioral scenario (per `arc-evaluating`) comparing two-stage (baseline)
  vs single `task-reviewer` (variant) on a task with a **seeded spec defect AND a seeded
  quality defect**. Grader: deterministic code grader on catch-rate (did the variant flag
  BOTH seeded defects?) + record token/turn deltas.
- **驗收條件:** Variant catches both seeded defects (no catch-rate regression vs two-stage);
  token/turn delta recorded against SP6's ≈ 2× faster / ≈ 50% fewer-tokens claim. Preflight
  discriminative (a no-reviewer baseline misses the defects).
- **停止條件:** Catch-rate regresses (single gate misses a class the two-stage caught) —
  hard halt; the collapse is not safe. Efficiency win without catch-rate parity is NOT a
  pass.
- **Eval re-run:** Yes — this task **is** the eval.

### T5 — Full-suite verification + CHANGELOG (rides the PR)
- **變更:** `npm run lint:fix`; `npm test` (5 runners); `npm run check:docs`; `npm run
  check:versions`. Additive CHANGELOG entry recording the merge + the SP6 provenance.
- **驗收條件:** `npm test` exits 0; `check:docs` + `check:versions` clean; diff confined to
  arc-agent-driven SKILL, the agent/template add+retire, the pinned tests, README, website,
  and the one accuracy word in acceptance-and-retry.md.
- **停止條件:** A non-skills runner goes RED — engine coupling not predicted by this
  prose-level analysis. Stop and diagnose.
- **Eval re-run:** No (T4 is the evidence).

---

## 6. Overall acceptance criteria (whole change)

1. `arc-agent-driven` runs **one** `task-reviewer` per task returning both a Spec Compliance
   verdict and a Task Quality verdict (no two sequential reviewers).
2. The `task-reviewer` contract contains all six §4.3 elements + the controller-side
   anti-gaming rules in the SKILL.
3. `agents/quality-reviewer.md` + `templates/quality-reviewer-prompt.md` retired; no live
   consumer references them (`grep -rn quality-reviewer skills/ templates/ agents/ README.md
   website/ docs/guide/` limited to historical/CHANGELOG).
4. `task-reviewer` template forbids `HEAD~1` and uses `BASE..HEAD` (SP6 fallback).
5. **Standalone spec path preserved:** `arc-dispatching-parallel/SKILL.md` and
   `arc-dispatching-teammates/` (SKILL + `references/`) have **zero functional diff**; the
   only edit is the one accuracy word at `acceptance-and-retry.md:39`.
6. `npm test` green (5 runners); `check:docs` + `check:versions` clean; retargeted
   assertions each name a string genuinely in the migrated skill; none weakened.
7. README + website + skills-reference describe the single-reviewer per-task shape and stay
   accurate on the (unchanged) teammates spec-reviewer+verifier path.
8. **T4 eval GREEN**: no seeded-defect catch-rate regression; token/turn delta recorded.

---

## 7. Overall stop conditions (halt for owner decision)

- **T4 catch-rate regresses** — the single gate misses a defect class the two-stage caught.
  Hard halt; do not ship the collapse on efficiency alone.
- **Any consumer of `spec-reviewer` at epic granularity would be forced to change** under the
  chosen containment option — re-open Decision 1.
- **A retargeted test can only pass by weakening the contract** (T3).
- **The dual-verdict format loses a verdict the current templates produce** (T1).
- **A non-skills runner goes RED** (T5).
- **The final-review shape (Decision 3) is unresolved** — do not silently pick fan-out vs
  single-batch-fix.

---

## 8. Decision points needing maintainer sign-off (the ratification gate)

1. **Containment: Option A vs B vs C (§4.2).** Recommend **A** — retire quality-reviewer,
   introduce task-reviewer, keep spec-reviewer standalone/unchanged. This is THE gate: it
   decides whether `arc-dispatching-parallel` / `arc-dispatching-teammates` get touched.
2. **Spec-compliance duplication (§4.2 cost).** Under A, the three-check pattern lives in
   both `spec-reviewer` (whole-branch) and `task-reviewer` Part 1 (diff-scoped). Accept the
   documented overlap, or extract a shared reference snippet? (canonical-source-rule tension)
   — includes the **verdict-vocabulary reconciliation** (§4.3): confirm the one token set.
3. **Final whole-branch review shape (§4.5).** SP6 single batch-fix subagent vs arcforge's
   existing "multiple independent issues → arc-dispatching-parallel" fan-out. Which ships?
4. **Ship boundary vs Rec 3.** Confirm `task-reviewer` ships standalone with the SP6
   fetch-the-diff fallback, and `[DIFF_FILE]` / `review-package` lands later (Rec 3).
5. **Filename cleanup (§3f).** Reconcile the stale `code-quality-reviewer-prompt.md` string
   (SKILL.md:106 + test:47) and the `./`-prefixed template refs (templates live in
   `templates/`, not skill-local) during the migration, or leave as-is?
6. **Model pin for `task-reviewer`.** `model: sonnet` (match existing) now, or adopt SP6's
   explicit-model-per-dispatch (couples to Rec 7)? Recommend sonnet now; defer the ladder.
7. **Eval gate design (§8/T4).** Confirm the deterministic seeded-defect catch-rate grader
   (+ token/turn efficiency signal) is the ship gate, sidestepping the unfrozen #117
   model-grader variance protocol — mirroring the reference plan's E1b.

---

## 9. Eval plan

**Method:** `arc-evaluating` behavioral A/B (T4). **Baseline** = current two-stage
(spec-reviewer → quality-reviewer). **Variant** = single `task-reviewer`.

**What it measures:**
- **Correctness (the gate):** on a task carrying a **seeded spec defect** (a missed/extra
  acceptance criterion) **and a seeded quality defect** (e.g., a swallowed error or a test
  that asserts nothing), does the single `task-reviewer` flag **both**? A deterministic code
  grader reads the reviewer's report for both findings — **RED-on-regression** if the
  collapse drops either class the two-stage caught. This is the firm ship gate and is
  chosen deterministic specifically so it does **not** depend on the unfrozen #117
  model-grader variance protocol (same rationale as the reference plan's E1b, §4).
- **Efficiency (the claim):** token and turn deltas per per-task review, variant vs
  baseline, checked against SP6's reported ≈ 2× faster / ≈ 50% fewer tokens. Recorded as
  the efficiency signal — an efficiency win **without** catch-rate parity is not a pass.

**Preflight:** discriminative — a no-reviewer control must fail to surface the seeded
defects, confirming the scenario actually exercises the reviewer.

---

## 10. Recommendation on auto-apply (honest assessment)

**Nothing here is safe to auto-apply now; the whole change is genuinely ratification-gated.**
Reasons:
- **T2 changes a shipped skill's behavior**, which per `arc-evaluating` requires the eval
  (T4) to pass before ship — an in-loop refactor cannot self-certify that.
- **Decision 1 is a cross-consumer architecture call.** Whether `arc-dispatching-parallel`
  and `arc-dispatching-teammates` get touched depends on the containment option, and those
  are two *other* shipped skills whose epic-acceptance gate is load-bearing. No in-loop
  refactor may make that call unilaterally.
- **Even the additive T1** (authoring the agent + template) produces **dead shipped surface**
  until the design is ratified — it means nothing without the T2 rewire it serves, and
  shipping an unwired reviewer would confuse users.

This matches why the SP6 borrowing loop stopped here rather than applying: `SP6-PROGRESS.md:59`
pre-registered this as a likely **BLOCKED-DECISION** — *"author the design, stop, let the
maintainer ratify."* This document is that stop.

---

**No execution performed — design for owner ratification + arc-evaluating gate.**
Verified read-only (whole-repo grep) against HEAD `0b1b226` (`feat/superpowers6-borrowings`).
