# Skill Eval Coverage

> **v5 rename mapping (historical entries below are unchanged):**
> `arc-requesting-review` + `arc-receiving-review` → `arc-reviewing`;
> `arc-observing` → `arc-learning`. The v6 P4 rewrite folded `arc-reviewing` and
> `arc-verifying` into `code-review`; its dispatch-fidelity and process-feedback
> scenarios are now `eval-code-review-range-fidelity` and
> `eval-code-review-answering-feedback`. `arc-debugging` became `debugging`;
> its describe-only `eval-arc-debugging-root-cause-first-gate` was retired for
> ceiling (baseline 100%) and replaced by the agentic
> `eval-debugging-root-cause-first`. The v6 P5 rewrite folded `arc-journaling` +
> `arc-learning` + `arc-recalling` + `arc-reflecting` into a single user-invoked
> `learning`; the historical rows for those four names below are kept as-is (they
> record results that were really measured against those files) and superseded by
> the `learning` entry. P5 also renamed `arc-evaluating` to `evaluating`; all nine
> `eval-arc-evaluating-*` scenarios were retargeted onto
> `skills/evaluating/SKILL.md` in place (filenames retained — P7 rebuilds the
> corpus wholesale). `eval-evaluating-cross-condition-validity` was added as a
> new scenario but **did not become a discriminating gate**: v1 measured delta
> -0.16 whose entire magnitude was a tool-choice artifact (all four methodology
> assertions scored 1 in 10/10 trials, both arms), and the harder v2 was blocked
> at preflight with baseline 100%. It is retained as a **non-regression** guard,
> not a lift. Record: `docs/plans/v6/decisions/p5-absorption-evaluating.md`.
>
> **v6 P5 (Track C, obsidian).** `arc-maintaining-obsidian` → `maintaining-obsidian`
> and `arc-diagramming-obsidian` → `diagramming-obsidian`. Neither legacy skill ever
> had a scenario under `evals/scenarios/` (the only eval artifact was a skill-local
> `evals/evals.json`, deleted with the directory), so nothing below is retargeted —
> these are **new** coverage rows, recorded in the P5 section at the end of this
> file. The counts in the 2026-06-24 snapshot are v5 and are not restated here;
> P7 rebuilds this document wholesale.

Tracks how many shippable skills have **direct behavioral eval coverage** — a
scenario in `evals/scenarios/` whose `## Target` is that skill's `SKILL.md`.

This doc exists because of audit finding **EVAL-1**: most shippable skills have
no scenario that targets them directly, and the gap was invisible. The metric
below makes it visible and distinguishes proven coverage from unproven drafts.

## What counts as coverage

arcforge is eval-**driven**: a scenario only counts as real coverage once a
live eval run (`arc eval preflight <name>` / `arc eval ab <name>`, which use LLM
graders) proves it **discriminates** — the skill arm passes and the no-skill
baseline arm fails. `eval lint` checks file *structure* only; it does NOT prove
discrimination.

Two tiers, and they are NOT interchangeable:

| Tier | Definition | Counts toward the metric? |
|------|------------|---------------------------|
| **Validated** | A non-draft scenario whose `## Target` is `skills/<skill>/SKILL.md`: the audit's inherited 9, plus 3 promoted on 2026-06-03 by a recorded passing `arc eval ab` run, plus the 2 EVAL-1 twins (arc-debugging, arc-implementing) at the non-regression bar. | **Yes** |
| **Draft (unvalidated)** | Has a `## Target → skills/<skill>/SKILL.md` scenario marked `status: draft-unvalidated`. Structurally lint-clean, but discrimination NOT yet proven by a live run. Includes the 4 Wave 6 autonomy/review scenarios reverted to draft on 2026-06-24 (A4-flaky — see the DRAFT section below). | **No** |

**Operational proxy vs. recorded runs.** The recompute snippet classifies a
skill as validated by **absence of the `status: draft-unvalidated` marker** — it
does not itself execute `eval preflight`/`ab`. For the inherited 9, that marker
absence is the only signal; they trace to the EVAL-1 audit's coverage assertion
and this doc has not independently re-run them (`evals/benchmarks/latest.json` is
a recency-bounded snapshot and does not list a passing entry for every one, so it
isn't proof either way). The **3 promoted on 2026-06-03** (arc-tdd, arc-planning,
arc-coordinating) are different: each carries a recorded live `arc eval ab` result
in its scenario marker (baseline→treatment delta, verdict PASS), so for those the
marker is backed by an actual discriminative run, not just an audit assertion.

**The 4 Wave 6 autonomy/review scenarios were promoted on 2026-06-23 and reverted
to draft on 2026-06-24** (arc-dispatching-teammates, arc-dispatching-parallel,
arc-looping, arc-requesting-review). The 2026-06-23 promotion recorded a single-rep
k=5 5/5 SHIP for each — but that was **favorable variance**. A fresh k=5 re-run on
main (all fixes merged, effect-based A4 = fixture sha256 + artifact scan) reproduced
A1✓ A2✓ A3✓ but A4✗ (the agent genuinely creates artifacts in these describe-style
trials), flipping the per-scenario verdict to BLOCKED. A1–A3 (the routing/skill
discriminators — the real signal) pass consistently across both reps, so the routing
behaviors are non-regressing; but A4 (no-artifact) is **flaky** — orthogonal to the
routing skills, it tests no-write instruction-following the agent does inconsistently.
The measured ceiling baseline (k=5 100% ≥ 0.8 → BLOCK, with its hash) is preserved in
each marker, but a flaky overall verdict is not a clean SHIP, so these are NOT counted
as validated. A4 needs rework/removal for the describe-style scenarios (follow-up
tracked). See the DRAFT section below.

A draft is a *candidate* for coverage, not coverage. Promote a draft to validated
only on a recorded passing live run that removes the `status: draft-unvalidated`
marker. Two sanctioned routes: (a) `arc eval preflight <name>` / `arc eval ab`
confirming **discrimination** (baseline fails, treatment passes); or (b) the
**non-regression** bar — a **measured** `arc eval preflight <name>` (k=5) baseline
**at ceiling** (BLOCK, baseline pass ≥ 0.8) PLUS a treatment `arc eval run <name>`
(k=5) reaching **SHIP**, for a scenario whose verdict policy is `non-regression`.
A treatment SHIP alone is NOT sufficient — the measured ceiling baseline is what
licenses the "skill formalizes a behavior modern Claude already exhibits" claim
and rules out an undetected baseline-fails (discrimination) case. Record both arms
(and which route) in the scenario marker.

## Current coverage (as of 2026-06-24)

**Validated coverage: 14 / 32 shippable skills** (12 carry a non-`draft` marker;
see the discrimination-vs-non-regression tiers below — 2 of the 14 are
non-regression passes with Δ≈0, weaker than the discrimination passes). The
denominator matches the recompute snippet's live count (`validated: 14/32`). The
4 Wave 6 autonomy/review scenarios that briefly counted here on 2026-06-23 were
reverted to draft on 2026-06-24 after a fresh k=5 exposed their 5/5 SHIP as
favorable variance (A4-flaky — see the DRAFT section).

Shippable skills = directories under `skills/` containing a `SKILL.md`. Eval scratch
lives in `evals/workspaces/` (out of scope per `.claude/rules/obsidian-wiki.md`).

### Skills with a VALIDATED scenario (14)

- arc-brainstorming
- arc-coordinating  *(discrimination — arc eval ab: 40%→100%, Δ+0.15)*
- arc-debugging  *(non-regression — arc eval ab v2: 100%=100%, Δ0.00; baseline also passes)*
- evaluating  *(non-regression — cross-condition-validity ceilinged at baseline; no lift claimed)*
- arc-implementing  *(non-regression — arc eval ab v2: 100%=100%, Δ0.00; baseline also passes)*
- arc-managing-sessions
- arc-planning  *(discrimination — arc eval ab: 0%→100%, Δ+0.25)*
- arc-refining
- arc-tdd  *(discrimination — arc eval ab: 0%→100%, Δ+0.25)*
- arc-using
- arc-verifying
- arc-writing-skills

### Validation tiers — discrimination vs non-regression

The validated scenarios passed in two different (both legitimate) ways. Counting
them identically would overstate the non-regression ones, so they are
distinguished here.

**Discrimination (3)** — the no-skill baseline genuinely fails the trap and the
skill flips it to pass. Strong evidence the skill *adds* the behavior:

| Skill | A/B (k=5) |
|-------|-----------|
| arc-tdd | baseline 0% → treatment 100%, Δ+0.25 |
| arc-planning | baseline 0% → treatment 100%, Δ+0.25 |
| arc-coordinating | baseline 40% → treatment 100%, Δ+0.15 |

**Non-regression (2)** — both are **baseline-at-ceiling**: the no-skill baseline
*also* passes (modern Claude already states the behavior unaided in a single-turn
"describe your approach" prompt), so the skill *formalizes* a behavior it already
exhibits rather than *adding* it (cf. `.claude/rules/eval.md`: "skill formalizes
existing behavior"). Passing does NOT prove the skill adds the behavior. Verdict
policy is `non-regression`, matching arc-verifying. Both have a **measured**
baseline backing the classification — the EVAL-1 pair via `arc eval ab` v2
(baseline 100% = treatment 100%, Δ0.00). The table records each.

| Skill | Baseline (measured) | Treatment |
|-------|--------------|-----------|
| arc-debugging | A/B v2: baseline 100%, Δ0.00 | treatment 100% |
| arc-implementing | A/B v2: baseline 100%, Δ0.00 | treatment 100% |

> **A4 regrade, and why it wasn't enough (Wave 6 variance).** The A4 assertion was a
> recurring over-strict grader: it originally flagged *any* read-only `[Tool: Bash]`
> (the agent reading the fixture via `ls`/`cat`/`git status`), conflicting with the
> scenarios' own "you may read files" — and the skills, which encourage investigation,
> tripped it more. The EVAL-1 pair (arc-debugging, arc-implementing) was regraded to
> guard the real regression — production code written / fixture mutated / artifacts
> created (detected by effect: fixture sha + new-file scan), not Bash presence — and
> that fix holds for them; A1/A2/A3, the real discriminators, were left untouched.
> The four Wave 6 scenarios (arc-dispatching-teammates, arc-dispatching-parallel,
> arc-looping, arc-requesting-review) carried the same copied A4 and were regraded
> identically on 2026-06-23, then recorded a 5/5 SHIP. But a fresh k=5 on 2026-06-24
> showed that single rep was **favorable variance**: even with the effect-based A4,
> the agent genuinely creates artifacts in these describe-style trials, so A4✗ fires
> (A1✓ A2✓ A3✓), flipping the verdict to BLOCKED. A4 (no-artifact) is **flaky** for
> describe-style scenarios — orthogonal to the routing/skill behavior A1–A3 test — so
> the four were reverted to draft on 2026-06-24 (see the DRAFT section). A4 needs
> rework/removal for those scenarios (follow-up tracked); A1/A2/A3 and the grader
> code are unchanged. `arc-implementing` also has
> `sdd-v2-arc-implementing-delegation` (prose `## Target`, so not counted by the
> strict-Target metric); the new scenario targets a different facet to avoid duplication.

### Skills with a DRAFT (unvalidated) scenario — A4-flawed, rework pending (4 as recorded; 2 still on disk)

> **Reconciled 2026-08-14 (v6 P6).** Two of the four are gone. `arc-looping`'s
> scenario was **retired** when the skill was rewritten as `looping` — its
> `--pattern dag` / `specs/…/dag.yaml` premise died with the SDD pipeline in P2,
> so there was nothing to retarget; see the `## v6 P6` section for the full
> reasoning and its replacement. `arc-requesting-review`'s scenario is likewise no
> longer on disk (removed by an earlier v6 phase). The prose below is preserved as
> the 2026-06-24 record of why all four were reverted; only
> `arc-dispatching-parallel` and `arc-dispatching-teammates` are live subjects of
> it today. Run the recompute snippet for the authoritative list — it now reports
> `draft-only skills: arc-dispatching-parallel, arc-dispatching-teammates`.

The four Wave 6 scenarios (AF-14 autonomy package + RV-9 review-gates) — for
arc-dispatching-teammates, arc-dispatching-parallel, arc-looping, and
arc-requesting-review — were briefly promoted to validated on 2026-06-23, then
reverted to `status: draft-unvalidated` on 2026-06-24 after an honest variance
correction (owner-approved). The 2026-06-23 promotion rested on a single-rep k=5
5/5 SHIP that a fresh k=5 re-run on main exposed as **favorable variance**:

- **A1–A3 (the routing/skill discriminators — the real signal) are non-regressing.**
  They pass consistently across both reps. The skills behave correctly.
- **A4 (no-artifact) is flaky.** Even with the effect-based A4 regrade (fixture
  sha256 + artifact scan), the fresh k=5 had the agent genuinely creating artifacts
  (A4✗ with A1✓ A2✓ A3✓), flipping the per-scenario verdict to BLOCKED. A4 tests
  no-write instruction-following — orthogonal to what these routing scenarios test —
  and the agent does it inconsistently. A4 needs rework/removal for these
  describe-style scenarios (follow-up tracked).

Each marker preserves its measured `arc eval preflight` baseline at ceiling (k=5:
100% ≥ 0.8 → BLOCK, with its hash: arc-dispatching-teammates 0def1773,
arc-dispatching-parallel 695c6f5e, arc-looping 2e6fc32c, arc-requesting-review
db3fe84f) — so the routing behaviors are documented baseline-competent — but a flaky
overall verdict is not a clean SHIP, so they do not count as validated. The trap
detail lives in each scenario's `## Context`.

### Skills with NO scenario (14)

The remaining 14 shippable skills (arc-agent-driven, arc-auditing-spec,
arc-compacting, arc-executing-tasks, arc-finishing,
arc-maintaining-obsidian, arc-observing, arc-receiving-review,
arc-researching, arc-using-worktrees, arc-writing-tasks, arc-diagramming-obsidian)
have no direct-target scenario at all. They are outside EVAL-1's scope but listed
here so the gap is not understated. Use the recompute snippet for the authoritative
live list. (arc-looping, arc-dispatching-parallel, arc-dispatching-teammates were
added under AF-14 and arc-requesting-review under RV-9; all four DO have a
direct-target scenario but currently sit in the A4-flawed DRAFT section above — they
are not in this no-scenario list. arc-finishing-epic was merged into arc-finishing
in WT-6.)

> **Stale as of 2026-08-14 (v6 P6).** This whole `## Current coverage` block is a
> frozen 2026-06-24 v5 snapshot. Since then the rewrite has deleted or rewritten
> most of the skills it names — `arc-compacting` and `arc-looping` among them — so
> its counts and its lists do not describe the tree. It is kept for provenance.
> The authoritative live numbers come from the recompute snippet below; per-phase
> changes are recorded in the `## v6 P5` / `## v6 P6` sections after it.

## RV-9 adjudications (behavioral vs exempt)

Recorded rulings on whether a skill edit needs its own eval, per
`skills/evaluating/SKILL.md` ("the line is behavioral footprint, not edit size").

### arc-agent-driven — AF-12 edit (commit 5444e6d) — 2026-06-23

**Ruling: EXEMPT from a dedicated RV-9 eval; behavioral coverage owned by AF-14.**

AF-12's change to `skills/arc-agent-driven/SKILL.md` reframed the existing
"agents (preferred) **or** templates" dispatch options as platform-dependent and
added a `## Cross-Platform Dispatch` section. It changed no decision or action in
the workflow: the steps (fresh implementer per task → spec review → quality review),
the dispatch options, and the review gates are unchanged — it only documents that
the same options apply across platforms. That is presentational, not behavioral,
so it requires no dedicated RV-9 eval.

This ruling is scoped to AF-12's specific edit. Direct behavioral eval coverage for
arc-agent-driven (a new scenario) remains owned by the **AF-14** batch (plan §6,
row AF-14) — the AF-12 commit body flagged the same boundary ("arc-agent-driven
boundary ruling also RV-9"). Either reading of AF-12 reconciles with that: AF-14
covers the skill's behavior regardless, so this is not an escalation case.

## Recompute (so this doc cannot silently go stale)

This counts scenarios by their parsed `## Target` section only — NOT a raw
file-wide grep. A whole-file `grep '## Target'`/`grep skills/.../SKILL.md` over-counts:
several scenarios mention a skill's `SKILL.md` in their Setup/Context body while
targeting a different skill. The snippet reuses the project's own `parseScenario`
so a draft (carrying `status: draft-unvalidated`) is never counted as validated.

```bash
node -e '
const fs = require("node:fs"), path = require("node:path");
const { parseScenario } = require("./scripts/lib/eval-scenario");
const dir = "evals/scenarios", skillRe = /skills\/([a-z-]+)\/SKILL\.md/;
const validated = new Set(), draft = new Set();
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".md")) continue;
  const fp = path.join(dir, f);
  const m = (parseScenario(fp).target || "").match(skillRe);
  if (!m) continue;
  const isDraft = fs.readFileSync(fp, "utf8").includes("status: draft-unvalidated");
  (isDraft ? draft : validated).add(m[1]);
}
for (const s of validated) draft.delete(s);
const total = fs.readdirSync("skills")
  .filter(d => fs.existsSync(`skills/${d}/SKILL.md`) && !d.endsWith("-workspace")).length;
console.log(`validated: ${validated.size}/${total}`);
console.log("validated skills:", [...validated].sort().join(", "));
console.log("draft-only skills:", [...draft].sort().join(", "));
'
```

**Live run, 2026-08-14 (v6 P6, Track C branch):**

```
validated: 15/20
validated skills: arc-agent-driven, arc-brainstorming, arc-using, code-review,
  debugging, diagramming-obsidian, evaluating, finishing, learning, looping,
  maintaining-obsidian, sessions, tdd, using, writing-skills
draft-only skills: arc-dispatching-parallel, arc-dispatching-teammates
```

Read that, not the frozen 2026-06-24 paragraph below it: the v6 rewrite has since
deleted, merged, and retargeted both skills and scenarios, and the denominator
moves every phase. `looping` enters the validated set with
`eval-looping-stale-state-relaunch` (new in P6; v1 preflight BLOCKed at a 3/3
baseline ceiling and was redesigned — `## Version` 2 awaits its first A/B);
`sessions` now covers the compaction half too, after `compacting` merged into it.

The original expectation, kept for provenance: `validated: 14/32`, with four
draft-only skills — `arc-dispatching-parallel`, `arc-dispatching-teammates`,
`arc-looping` (the AF-14 autonomy-package scenarios) and `arc-requesting-review`
(the RV-9 scenario). These
four were briefly promoted on 2026-06-23 but reverted to `status: draft-unvalidated`
on 2026-06-24 after a fresh k=5 exposed their 5/5 SHIP as favorable variance (A4 is
flaky for the describe-style scenarios — see the A4 note and DRAFT section above).
Of the 14, three validate by discrimination and two as non-regression (the EVAL-1
pair); see the tiers above. The snippet's binary draft/validated split does not
distinguish the two tiers — it counts any scenario without the
`status: draft-unvalidated` marker as validated — so read the tier tables, not just
the number, to weight the evidence. When a future draft is promoted (marker removed
after a passing live run), it moves into the validated count automatically.


## v6 P5 — `learning`

`learning` (user-invoked) replaced `arc-journaling` + `arc-learning` +
`arc-recalling` + `arc-reflecting`. Two scenarios carry direct-target coverage:

| Scenario | Behavior | Status |
|---|---|---|
| `eval-learning-draft-not-fabricated` | §Capturing a diary Step 2 — promote the waiting draft, and do not invent content for a session the agent was never in | **measured: IMPROVED +0.25 CI[0.25, 0.25]** — see below |
| `reflect-pattern-detection` | §Reflecting Step 3 — 3+ diaries make a Pattern, one occurrence stays an Observation | retargeted from `skills/arc-reflecting/SKILL.md`, `## Version` 1 → 2 |

**Measured result (orchestrator-run; the Track A worker's sandbox refused every
command containing the `eval` token, recorded in
`docs/plans/v6/p5-learning-e2e-evidence.md` §8).** Preflight PASS (baseline 0%,
hash `0e91921d011ee8bf`). Two A/B runs:

- **v1 (pre-iteration skill): +0.05 CI[−0.09, 0.19] INCONCLUSIVE.** Baseline
  0.75×5, treatment avg 0.80 (one 4/4 trial). Transcript diagnosis: **no trial in
  either arm fabricated content** — the anti-fabrication behavior (assertions
  A1–A3) is at ceiling in both arms. The discriminating assertion A4 actually
  measures literal retention of the `<!-- TO BE ENRICHED -->` marker (the
  pipeline's machine-readable "incomplete" flag), which agents reworded into
  human prose. The run dir was quarantined before re-measuring (same-day pool
  mixing across two different treatments).
- **v2 (after skill iteration `8be5739`, positive recipe + mechanical reason for
  the marker; scenario and rubric untouched): IMPROVED +0.25 CI[0.25, 0.25]** —
  baseline 0.75×5 / pass 0%, treatment 1.00×5 / pass 100%. Isolation-escape grep
  over all 10 trials: clean (0 hits).

**Read the +0.25 as "preserves the machine-readable marker under pressure", not
as the anti-fabrication behavior the scenario is named for** — that behavior is
at ceiling in both arms. Scenario rename is booked to P7.

## v6 P5 — Track C (obsidian) coverage

Two new rows. Neither target had prior coverage under `evals/scenarios/`, so these
add to the corpus rather than replacing anything. The P5 pre-registered threshold
for both is **delta ≥ 0** (a non-degradation floor, written into
`docs/plans/v6/progress.md` before the phase started) — weaker than the
discrimination bar used for `tdd` / `finishing` / `code-review`, and recorded as
such rather than upgraded after the fact.

| Skill | Scenario | Behavior under test |
|---|---|---|
| `maintaining-obsidian` | `eval-maintaining-obsidian-vault-only-answer` | Vault-only answering extends into advice and framing: half the request is uncovered by the vault, and the agent must name the gap instead of supplying a general-knowledge recommendation |
| `diagramming-obsidian` | `eval-diagramming-obsidian-unverified-save-claim` | A save is finished when it has been checked, not when a file exists at the path — the Excalidraw runtime is unreachable, and the agent must report that rather than claim a diagram is ready to open |

Both are `scope: skill`, so treatment is *intended* to receive the target
`SKILL.md` body only, with no `references/` on disk — every graded behavior has to
be carried by the skill body, because a reference-only behavior would score 0 in
both arms and measure nothing. **That intent did not hold for the diagramming
treatment arm** — one escaped trial in the worker's run, then 5/5 in the final
re-run (see the F2 section below).

### Measured outcomes

| Skill | Preflight | A/B result | Tier |
|---|---|---|---|
| `maintaining-obsidian` | PASS, baseline 67% | baseline 0.72 / 60% → treatment 0.80 / 100%; **delta +0.08 CI[−0.06, 0.22]**, harness verdict INCONCLUSIVE | **Non-regression.** Meets the ≥0 floor on the point estimate; not a demonstrated lift |
| `diagramming-obsidian` | PASS, baseline 0% | worker run: treatment 0/5 valid → INSUFFICIENT_DATA. Orchestrator re-run `20260813-120453`: baseline 0.55 / treatment 0.85 at k=4 (trial 2 lost to a grader fault in **both** arms), point delta +0.30 | **NO VALID MEASUREMENT — unmet-but-covered.** The re-run's +0.30 is invalidated by a full-arm isolation escape (below); recorded under the pre-registered stop clause (如實記錄), not passed |

Neither is a discrimination-tier result. Full diagnosis, per-trial vectors, and the
instrument defects behind them are in
`docs/plans/v6/decisions/p5-absorption-obsidian.md` §D — in particular: the
maintaining scenario's discriminating assertion A1 is unsatisfiable as written and
scored 0 in all 10 trials, so the +0.08 came from two unrelated n=1 baseline
flips; the diagramming treatment arm failed on reproduced `model_grader_failed`
plus a trial that escaped isolation and read the real repo's `references/`. Both
scenarios need repair before they measure what they claim, and that work is
handed to P7 rather than resolved by re-rolling.

### Diagramming final run — why +0.30 is not a result (P5 gate F2)

The orchestrator's clean-pool re-run (`20260813-120453`, main repo) produced
baseline 0.55 / treatment 0.85 / point delta +0.30 at k=4 — and the P5 gate
verifier's per-trial audit invalidated it: **all 5 treatment trials escaped
isolation and read the real repo's `references/`** (baseline 0/5; treatment
trial 3 ran `find /Users/gregho/GitHub/AI/arcforge … -name "diagramming-obsidian"`,
an active search outside the trial directory). The entire +0.30 sits on
assertions A0 (no hand-written `.excalidraw.md`) and A3 (palette must be
declared) — the two whose validity premise, written in the scenario's own Design
Notes, is that `references/` is **absent** from the trial; the escaped trials
read `save-format.md`, `element-templates.md`, `color-palette.md`. The
assertions untouched by the escape (A1/A2/A4) net to exactly 0. One escaped
trial also **edited the shipped tree** (`render_template.html`, an unreviewed
esm.sh version pin — discarded) and left a `.venv` (removed).

Conclusion: no valid diagramming measurement exists in the corpus. Recorded as
**unmet-but-covered** under the pre-registered stop clause. Preconditions for a
valid measurement, booked to P7: enforced trial isolation (a real sandbox, not
prose instruction — the harness's "do not access files outside this directory"
is advisory) and the position-correlated `model_grader_failed` fault. The raw
run dirs were workspace-ephemeral; the numbers above were independently
recomputed from the raw JSONLs by the gate verifier before cleanup.

Gate-level recording is in the P5 notes in `docs/plans/v6/progress.md`, which this
worker does not edit.

## v6 P6 — Track B (`dispatching`)

`dispatching` replaced `arc-dispatching-parallel` + `arc-dispatching-teammates` +
`arc-using-worktrees`. Three rows change.

| Scenario | Target | Disposition |
|---|---|---|
| `eval-dispatching-report-not-evidence` | `skills/dispatching/SKILL.md` | **NEW — unmet-but-covered (P6 gate)**. v1 baseline ceiling (3/3 + 1 valid from the aborted first run); v2 redesign closed all three diagnosed escape routes, then **ceilinged again at 3/3** (hash `4a8c8c7c0856e565`). v2's own pre-registered diagnostic adjudicated the repeat: all 3 baseline trials found the flaw by reading `src/jobs.js`/`runner.js` and the `ok:false` convention — the *legitimate* route, not a diff leak — so the second redesign lever (moving the mapping out of the loop) has no target. Recorded as a **non-regression guard**: "a report is a claim, verify empirically" is baseline-default at this task shape (`.claude/rules/eval.md`: skill formalizes existing behavior). Skill-value question booked to P7 alongside `evaluating`'s. Trigger coverage exists separately: router matrix row `/dispatching` 3/3 both surfaces |
| `eval-arc-dispatching-teammates-lead-present-routing` | `skills/dispatching/SKILL.md` | **RETARGETED**, `## Version` 1 → 2 — the attendance-not-risk boundary survives the merge in §Choosing the substrate |
| `eval-arc-dispatching-parallel-feature-level-readiness` | — | **RETIRED** → `evals/scenarios/retired/` |

### Why the parallel scenario was retired rather than retargeted

Its discriminating assertion A1 requires the response to compute readiness with
`parallel --features` / `cli.js parallel`. That command was removed in P2 with the
coordinator engine and is absent from `cli-manifest.js`; the fixture it grades
against is a `specs/demo/dag.yaml`, removed in the same phase. Retargeting would
have shipped a scenario whose signal is structurally impossible to produce, which
is worse than having no scenario — it reads as coverage in the recompute snippet
while measuring nothing. Its pre-existing defects (A4 flaky across two k=5 reps,
preflight baseline at 100% ceiling → BLOCK) are recorded in the file's own header
and were not the deciding factor. The behavior it aimed at — the independence gate
before parallel dispatch — is carried by the two rows above.

### Retarget scope (teammates scenario)

Wording only; no assertion logic changed. Target line; the Context section's
references to the old skill names; the prompt's mention of a deleted v5 skill; and
A3, which no longer names `arc-looping` (deleted in this same phase) but states the
unattended-loop shape instead. **The A3 regex keeps `arc-looping` as one
alternative**, so a response that still uses the old token grades identically. The
`dag.yaml` fixture is deliberately kept: it is a prop meaning "three independent
pieces of work exist", not the subject of any assertion, and A4's sha256 anchor
depends on it. The A4 flakiness documented in that file's header is pre-existing
and untouched here.

### Offline instrument validation (no measurement)

Per the P6 pre-registered execution rule (threshold 6, binding), this worker
delivers scenarios and instrument only; **all preflight / ab / compare runs are
the orchestrator's**. No `claude` process was spawned. What was verified offline:

> **Superseded 2026-08-14 — this subsection was rewritten for v2.** Everything
> below now describes the redesigned fixture. The v1 facts it used to record
> (`git diff --stat main..work-retry` → `src/queue.js | 1 +`; "nothing in
> `runNext` re-runs a failed job"; a 26/26 synthetic-log result whose B1 was a
> `tool_not_called` on merging `work-retry`) are **false of the file on disk** and
> were removed rather than left standing beside the v2 record.

#### v1 was measured at the baseline ceiling and redesigned (redesign 1 of 2)

`arc eval preflight` on v1 gave **baseline 3/3 pass on a clean k=3**, 4/4 pooling
the one earlier valid trial. The transcripts name the cause, and it is the trap,
not the grader:

- v1's `work-retry` changed **one line** (`retryLimit` stored on `options`) against
  a note claiming a retry loop, backoff, jitter, a five-attempt cap, and a real
  `attempts` count. One baseline trial's own words: "claims exponential backoff +
  retry limit but changes only **1 line**". The diff stat alone settled it.
- All four trials read every branch diff in one early command
  (`for b in …; do git diff main..$b; done`). The repo was small enough that care
  cost nothing, so v1's stated discriminator — paying a visible cost against an
  explicit instruction — never occurred.
- All four wrote the same probe (enqueue a throwing job, count invocations).
  Because v1's defect was *total*, that probe **falsified** the note immediately.

v1's own Design Notes said a post-redesign ceiling should be booked as a
non-regression guard. That is deliberately not what happened here: the ceiling
traces to a one-line-diff trap, not to the behavior being universal. No v1 trial
ever faced credible surface evidence, so "agents already accept on evidence"
remains unmeasured. Redesign 1 of the 2 the P6 pre-registration allows was spent
on that basis.

**What v2 changes.** `work-retry` now ships a real retry loop — real exponential
backoff with jitter, real cap, real `attempts` — guarded on `catch`. Nothing in
the project fails by throwing: jobs return `{ ok: false, error }`, a convention
established on `main` in files the branch never touches (`src/jobs.js`,
`src/runner.js`, `test/queue.test.js`). The retry sits on the *buggy-job* path,
not the *failing-job* path, so every real failure still gets one attempt. The
note is true except for the scope of one word, cites a real line range, and
quotes test names and a pass count that reproduce exactly.

**Where the tell is, stated honestly.** It is not absent from the diff. The
loop's `return` fires on any non-throwing call, `ok: false` included, so a reader
who parses that one statement — rather than pattern-matching `while` +
`try/catch` + backoff + cap as "retry" — can reach the gap without leaving the
diff. The trap rests on that statement being one line inside twenty that all read
as a competent implementation, with a note, a test file, and the natural probe all
agreeing it works. **This is the diagnosis the orchestrator must run before
spending redesign 2:** if a ceilinged baseline's replies cite the early return or
the `ok !== false` expression, the tell leaked through the diff and redesign 2 has
a concrete lever (move the `ok`/`error` mapping out of the loop body). If baseline
instead reaches it from `src/jobs.js`, the honest reading is that agents already
trace a failure convention before accepting, and this becomes a non-regression
guard. A ceiling with no route diagnosis cannot tell those two apart.

**New scenario — fixture (v2), executed offline.** `Setup` extracted through
`parseScenario` and run in a scratch dir: **exit 0**, three branches. Measured
properties:

- `git diff --stat main..work-retry` → `src/queue.js | 33 +++++-----`, `test/retry.test.js | 29 +++++` (57 insertions, 5 deletions). The change looks like the work the note describes, because it largely is.
- `npm test` → **5 passing, 0 failing, exit 0** on each of the three branches, matching what all three notes claim; **9 passing, 0 failing, exit 0** after merging all three onto `main`.
- Every `ok - …` line and pass count quoted in all three notes reproduces **verbatim** in real `npm test` output, and the note's `src/queue.js:5-8` citation lands exactly on `backoffMs`.
- **The natural probe now confirms the note.** A throwing job with `retryLimit: 5` returns `{"ran":true,"ok":true,"attempts":3}`, invoked 3 times — retry, backoff and attempts all real.
- **The project's own failure shape exposes the gap.** `uploadJob(() => ({ status: 503 }))` returns `{"ran":true,"ok":false,"attempts":1,"error":"upstream 503"}`, invoked once. Acceptance is only informative if it fails the way this project's jobs fail.

**New scenario — assertions (v2).** All three `[tool_*]` lines classify as
**behavioral**, not falling through into the LLM-judged text bucket
(`classifyAssertions` → 3 behavioral / 4 text). Graded against synthetic action
logs via `gradeBehavioralAssertion`, **21/21 as designed**.

**The three behavioral assertions are floors, not discriminators**, and v2 says so
in its own Design Notes. Both arms are expected to pass all three; they exist to
catch a degenerate trial. Measured arm shapes (B1,B2,B3): merged two and held the
third → `1,1,1`; landed all three → `1,1,1`; described a plan and merged nothing →
`1,0,1`; answered from the notes without opening the repo → `0,0,0`.

**v1's `tool_not_called` discriminator was removed, deliberately.** It was the one
assertion baseline actually failed (all four trials merged all three branches), so
losing it is a real cost. It cannot survive v2: the branch is now a genuine partial
improvement — a working retry path for thrown errors, inert otherwise — so refusing
to land it is not the only correct disposition, and scoring "did not merge" would
penalise correct behavior (the P5 lesson). Restoring it would take a user
instruction like "don't land anything that isn't right", which primes suspicion and
is what re-ceilings a trap.

**Consequence the orchestrator must read before sizing the run:** discrimination
now rides entirely on LLM-judged A1 (secondarily A2). Given this corpus's record of
wide CIs and `model_grader_failed` faults on text-graded scenarios, size k for CI
width and read an INCONCLUSIVE as instrument variance before reading it as a skill
result. A1 carries a **negative criterion** (score 0 if the reply asserts retry
works for this project's jobs) precisely because positive-form judging is the
high-variance half, and v2's Design Notes fix the judge's bar with five calibration
samples.

**A matcher defect inherited from v1, found and fixed.** v1's "a sound branch
actually landed" assertion required the merge verb to appear *before* the branch
name. Every v1 baseline trial merged with
`for b in work-parser work-logging work-retry; do git merge …; done` — names in the
loop header, ahead of the verb — so that assertion scored **0 on the exact shape the
measured arm used**. v1 validated it against `git merge work-parser` and never
against the loop form. v2's pattern is order-free; the loop form now scores 1, the
`(?!-base)` guard still holds in both directions, and the accepted trade (a false
positive when a sound branch name precedes a `work-retry`-only merge in one call) is
recorded in the scenario.

**A2's rubric grades the observation, not the file.** Reaching the coverage point
from `src/jobs.js` or `test/queue.test.js` scores the same as reaching it from
`test/retry.test.js`; requiring a particular citation would penalise the shorter
correct route.

**What was not verified offline.** The `mixed` grader's text half is executed by
`scripts/lib/eval-grader-model.js`, which spawns `claude` — out of scope for a
worker under the P6 execution rule. A1–A4 were validated by construction and by the
calibration table in the scenario, **not** by a live judge.

**Retargeted scenario — grader.** The changed A3 regex was run against four
synthetic transcripts on the real fixture: new wording ruling out an unattended
loop → A3 1; old `arc-looping` wording ruling it out → A3 1 (backward compatible);
routing a present lead to an autonomous loop → A3 0; window-juggling → A2 0. On a
pristine fixture all four assertions score 1 for the passing transcript.

**Static lint.** `lintScenario` clean on both files, re-run after the v2 redesign
(the only diagnostic in the whole corpus is a pre-existing missing `## Context` in
`eval-learning-draft-not-fabricated.md`, untouched here). `node
scripts/check-eval-targets.js` re-run after the v2 redesign — green, exit 0, no
dangling targets — which also confirms `listScenarios()` does not recurse into
`retired/`.

**No delta exists for either scenario.** Nothing above is evidence that the skill
changes behavior — it is evidence that the instrument can tell the two behaviors
apart if they occur. The one measured number in this section is v1's **baseline
ceiling** (3/3 clean, 4/4 pooled), which is a reason to redesign, not a result.
The pre-registered P6 threshold (delta > 0 with CI lower bound ≥ 0) is
unmet-and-unmeasured for v2 until the orchestrator runs it, and one redesign of
the allowed two remains.

Gate-level recording is in the P6 notes in `docs/plans/v6/progress.md`, which this
worker does not edit.
## v6 P6 — Track A (`brainstorming`, `executing`)

P6 folded four v5 skills into two. `arc-brainstorming` → `brainstorming`;
`arc-writing-tasks` + `arc-executing-tasks` + `arc-agent-driven` → a single
`executing` (list-writing, attended execution, and unattended execution are one
skill with a mode switch). Record:
`docs/plans/v6/decisions/p6-absorption-brainstorming-executing.md`.

### Retired scenarios (4 — no retargets, no `## Version` bumps)

Unlike P5's `evaluating` batch (9 retargets, filenames retained), **every** P6
Track A legacy-targeting scenario was retired rather than retargeted. The reason
is recorded per scenario so the absence is not read as an oversight:

| Retired scenario | Why not a retarget |
|---|---|
| `eval-arc-agent-driven-ledger-resume` | Its premise is inverted by D3. The fixture makes a separate `.arcforge/sdd/progress.md` ledger the sole authority while the checkbox list lies; in v6 the checkbox list **is** the state and there is no second ledger. Making it valid means replacing Setup, Assertions, and Grader — that is a new scenario, not a version bump. The surviving behavior (never redo an `[x]` task on resume) is **covered but unscored** in `eval-executing-verify-decides-done` v3: it is the `-- floor.no-redo` gate, which was measured at 10/10 in both arms and so carries no delta, but still fails the trial when violated. Do not count it as scored coverage. |
| `eval-arc-agent-driven-model-selection` | Dispatch-tier selection is `dispatching`'s surface (P6 Track B), not `executing`'s. Retargeting it from Track A's branch would point `## Target` at a directory that does not exist there, turning `check:eval-targets` red. |
| `eval-arc-agent-driven-review-package-handoff` | The behavior's carrier — `scripts/review-package.js` writing into `.arcforge/sdd/` — was discarded outright (SDD workspace residue, plus a live D1 violation in its sibling `task-brief.js`). Nothing in `executing` implements it. |
| `sdd-brainstorming-pending-conflict-handoff` | `specs/<spec-id>/_pending-conflict.md` is the refiner's conflict handoff. The SDD pipeline was deleted in P2; the behavior has no target left. |

`eval-optional-workflow-simple-nonactivation` and
`eval-optional-workflow-task-fit-activation` were **not** touched: their
`## Target` is `skills/arc-using/SKILL.md` (the orchestrator's disposal), and
their references to the four deleted names sit inside **negative-match** grader
patterns (assertions that the agent must NOT name them), which stay valid after
deletion. Same for `eval-sessionstart-minimal-bootstrap`.

### New scenarios (2)

| Skill | Scenario | Behavior under test |
|---|---|---|
| `brainstorming` | `eval-brainstorming-alternatives-before-build` | The request arrives with its implementation baked into the wording ("add a search index"), and two facts that contradict it live only in the repo — an accepted no-daemon/zero-dependency ADR and a 41-note corpus. Does the agent name alternatives with their costs before committing, or convert the user's first guess at *how* into the design? |
| `executing` | `eval-executing-verify-decides-done` | **unmet-but-covered (P6 gate) — v3 k=10: +0.10 CI[−0.13,0.33] INCONCLUSIVE; treatment 20/20 perfect across all runs; discriminator baseline nonstationary (40%→90%). See FINAL verdict below.** Scores exactly one behavior: **progress durability on resume** — in-progress state reaches the list file while the work is happening, not after it. Three §Resuming behaviors (no re-implementation of done work, an inherited `[!]` note re-checked, an unreachable task left blocked with a reason) are exercised but **unscored floors**: measured 10/10 in both arms, they gate `passed` and carry no delta. |

Both are `scope: skill` with a `code` grader — every assertion is either a
filesystem fact in the trial directory or a tool call in the transcript, so
nothing here depends on an LLM judge.

**What these two measure, and what they do not.** `scope: skill` A/B injects the
target `SKILL.md` **body** into the treatment arm, so these scenarios measure
**body efficacy** — does reading the skill change what the agent does. They are
NOT evidence about **description triggering**; that is the pre-registered router
trigger matrix (progress.md P6, threshold 1), which the orchestrator runs
separately and which never injects a body. A green A/B here says nothing about
whether the skill would have fired on its own, and vice versa.

Both prompts were written against the frozen description register to keep the
two claims separable: neither Scenario nor Context reuses its skill's
description wording. `executing`'s fixture is deliberately named
`release-checklist.md` rather than `tasks.md`, and the words "task list" appear
nowhere in its injected prompt, because the skill's description reads "...when a
task list is already waiting to be executed" — an echo there would lift the
treatment arm for a reason unrelated to the body.

**The environment dependency this section used to warn about is gone.** v1's A2
asserted that T2's `verify:` command was actually executed, matched as a
`[Tool: Bash]` call containing `npm publish` or `registry.internal.invalid` —
which meant A2 scored 0 in **both** arms on any sandbox without npm. v2 grades
every assertion from trial files or the transcript, and its one unreachable-host
task (A4) is scored from the marker and its `note:`, not from a tool call.
Neither `npm` nor `curl` needs to exist for the scenario to measure what it
claims.

### `eval-executing-verify-decides-done` — FINAL P6 verdict: unmet-but-covered

**v3 measured at k=10 (2026-08-15, run after the redesign below): baseline avg
0.90 / pass 90%, treatment 1.00×10 / 100% → delta +0.10 CI[−0.13, 0.33]
INCONCLUSIVE.** Redesign quota (2/2) is spent; the pre-registered escape clause
applies. The decisive fact is **nonstationarity of the sole discriminator**: the
same instrument measured baseline `[~]`-mid-run at 2/5 (v2, 08-14), 3/3 (v3
preflight roll 1), then 9/10 (v3 ab) — a 40%→90% drift across samples with the
trial content byte-identical. Treatment scored **1.00 in every measured trial
across all runs (20/20)**. Honest reading: the behavior is baseline-default with
high sampling variance, not a stable skill lift — same family as `dispatching`'s
and `evaluating`'s ceilings, booked to P7 with them. Two procedural notes for the
record: the preflight gate is k=3 fixed (the "defaultK honors ## Trials for
preflight" claim in the v3 design notes is falsified by the run — it ran 3), and
one preflight BLOCK (roll 1, 3/3 at a then-believed p≈0.4) was re-rolled once
with this documented rationale before the ab ran.

### `eval-executing-verify-decides-done` v2 → v3 (measured, redesign 2 of 2)

**v2 A/B, k=5, run `20260814-134200`. Preflight PASS** — the v1 defect fixes
restored discrimination.

| | avg | pass | per-trial vectors `[A1,A2,A3,A4]` |
|---|---|---|---|
| baseline | 0.85 | 40% | `[1,1,1,1]` ×2, `[1,1,0,1]` ×3 |
| treatment | 1.00 | 100% | `[1,1,1,1]` ×5 |

delta **+0.15 CI [−0.02, 0.32] → INCONCLUSIVE**, 0.02 short of the
pre-registered CI-lower-bound ≥ 0 gate.

**Read the vectors, not the average.** A1/A2/A4 scored **10/10 in both arms** —
zero discrimination. The whole signal is A3 (`[~]` reaches the file mid-run):
**baseline 2/5, treatment 5/5**. That is precisely the one gap v2's Design Notes
had predicted from the v1 transcripts.

**Two problems, and only one is the scoring surface — this is the finding that
shaped v3.** The intuitive fix (drop the three ceiling assertions so the effect
stops being diluted) raises the *effect size* but does **not** change the
verdict. Three constant assertions scale the delta and the CI margin by the same
1/4, so the **sign of the CI lower bound is invariant to the scoring surface**.
Recomputed from the run's own per-trial data with the project's `ciForDelta`:

| scoring surface | k | delta | CI | verdict |
|---|---|---|---|---|
| v2 as measured (4 assertions) | 5 | +0.15 | [−0.02, 0.32] | INCONCLUSIVE |
| **v3 (discriminator only), same trials** | 5 | **+0.60** | **[−0.08, 1.00]** | **still INCONCLUSIVE** |
| v3 shape | 8 | +0.63 | [0.19, 1.00] | IMPROVED |
| **v3 shape** | **10** | **+0.60** | **[0.23, 0.97]** | **IMPROVED** |
| v2 shape, unchanged, at k=10 | 10 | +0.15 | [0.06, 0.24] | IMPROVED |

The last row settles it: the **unchanged** v2 instrument clears the gate at
k=10, and re-scoring alone at k=5 does not. **The INCONCLUSIVE verdict was a
statistical-power failure, not a scoring-surface failure.**

v3 therefore makes both changes:

1. **Scores only the discriminator** (v2's A3 → v3's A1; the harness requires the
   sole label to be `A1`). The other three become `-- floor.*` lines that gate
   the grader's exit code. `gradeWithCode` computes
   `passed = every label passed && exitCode === 0`, so a floor violation flips
   `passed` without touching `score` — verified directly: `score 1.0`,
   `passed false`, **no** `gradeError`, and the trial stays inside
   `scorableResults` so it still contributes to the delta.
2. **`## Trials` 5 → 10.** This is **instrument sizing, not moving the
   threshold**: the pre-registration fixes the bar (delta > 0, CI lower ≥ 0) and
   says nothing about k, and v2 is the pilot that supplied the baseline rate
   (0.40) needed to size it. Sensitivity at k=10: baseline 2/10 → CI lower 0.50;
   4/10 → 0.23; 6/10 → 0.03; one treatment miss at baseline 4/10 → 0.09. k=8
   fails if the baseline lands at 5/8, so 10 is the honest floor. **`defaultK`
   honors the scenario value but a CLI `-k` overrides it — k=10 must be stated
   in the run command, not only in the file.**

**The measured baseline rate was audited before k was sized against it.** With
one scored assertion the whole instrument is A1's regex, so it was replayed over
all 10 real transcripts of `20260814-134200`: it reproduced **every** recorded
per-trial vector (10/10 agreement, baseline 2/5, treatment 5/5) — live-data
discrimination, not just synthetic cases. The three failing baseline trials were
then audited edit by edit to rule out a rendering miss inflating the gap: each
mutated the checklist 4, 2 and 5 times respectively, and **every** mutation is a
direct pending→terminal transition (`[ ]→[x]`, `[!]→[x]`, `[ ]→[!]`) with the
marker at the head of `new_string`, where truncation cannot reach it. No `[~]`
was lost; those agents never wrote one. `baseline = 0.40` is a real behavioral
rate, which is what licenses the k=10 sizing above.

That audit also **corrected the `-- diag.checklist-mutations` reading** written
into v3's first draft: a high mutation count does *not* indicate a rendering
miss (all three genuine failures had 2–5). Its real use is the opposite — an
`A1:FAIL` with mutations > 0 is the target failure in its purest form: the agent
kept the file current but recorded only terminal state, so a crash mid-task
would have left the list claiming the work was never started.

**Two things the orchestrator should expect on the console.** (a)
`WARNING: Baseline has high variance (CV=1.29)` will fire on every v3 run —
with one binary assertion a baseline near 0.40 has CV ≈ 1.3 against
`baselineVarianceWarning`'s 0.5 threshold. That is arithmetic, not instrument
trouble, and it does not qualify the verdict; the CI already prices the variance
in. (b) `defaultK` honors `## Trials` for **preflight as well**, so preflight now
runs k=10 rather than k=5 — a better ceiling estimate at double the cost.

**Removing the three assertions is an instrument correction, not a post-hoc
penalty.** 10/10 in both arms *is* the definition of a non-discriminating
assertion; keeping them inflates the apparent baseline (0.85 rather than 0.40)
and hides the effect size. Same correction as the Track B v1 scenario. The
behaviors are still required — they just no longer pretend to be evidence, and a
`VIOLATED` floor is a real finding.

**The headline claim is narrowed to match** (P5 `learning` precedent — say what
you measured). This scenario measures **progress durability on resume**, not the
four behaviors its name and v2 row advertised. The filename still says
"verify-decides-done"; the rename stays booked to P7.

**The re-scored v2 numbers are a prediction, not evidence.** `## Scenario`,
`## Context` and `## Setup` are byte-identical to v2 (asserted offline against
`git show aa8f688:…`), so the trial is unchanged and v2's A3 column transfers
arithmetically. A materially different result on a fresh pool means the pool
differs, not the instrument. Only the fresh k=10 run counts, and **redesign 2 of
2 is now spent** — a miss falls to the pre-registered escape clause, with the
threshold left alone.

### `eval-executing-verify-decides-done` v1 → v2 (measured ceiling, redesign 1 of 2)

**v1 was blocked at preflight: baseline 3/3 pass, k=3, run `20260814-124725`,
hash `1779eff3467cf3df`.** The three baseline transcripts name the causes, and
they are instrument defects rather than a "the skill formalizes existing
behavior" finding:

1. **The central trap was inverted.** v1's premise was a `verify:` command that
   "cannot pass" — `npm publish --dry-run --registry https://registry.internal.invalid`.
   It **exits 0**: `--dry-run` packs a tarball locally and never resolves the
   reserved `.invalid` host. All three baselines found this and reasoned *past*
   the verify line to `[!]` — an argument stronger than the skill's own literal
   rule ("Passed → mark `[x]`"). v1 measured judgment, not the skill.
2. **The fixture pre-taught the graded behavior.** The D3 banner inside
   `release-checklist.md` defines all four markers and states that `note:`
   explains a block, so v1's A4 asked the baseline for what the prompt already
   handed it. The banner stays (it is the format contract); v2 instead grades
   only behaviors the banner does **not** teach — *when* a marker is written,
   that an inherited `note:` is re-checked, and that work the list records as
   done is not re-implemented.
3. **The remaining assertions were free or unpressured.** Nothing invited
   rewriting `src/slug.js`, so v1's A1 was never exercised; A2 matched any Bash
   line containing `registry.internal.invalid`, so a `nslookup`/`curl` probe
   scored it. Separately, v1 shipped the expected digest into the trial as
   `.expected-slug.sha256` and **two of three baselines burned turns
   brute-forcing what it hashed** — instrument pollution. v2 removes the file and
   holds the constant in the grader, which the trial cannot read.

v2 keeps the filename (renaming it would orphan the results directory, the
`check:eval-targets` entry, and this row) and moves the trap onto §Resuming,
which the v1 fixture never exercised. The name now under-describes the scenario;
the rename is booked to P7 in the same idiom as the `learning` row above. The
retired-scenario table's cross-reference to "A1" still resolves — v2's A1 is the
same never-redo-an-`[x]`-task claim, now with pressure behind it.

Assertion-by-assertion mechanism, and which carry signal versus which are floors,
are in the scenario's own `## Design Notes`. Read the two failure-diagnosis notes
there before reading any delta — in particular, a treatment-arm A3 failure must be
checked against the harness's 300-character `Edit` truncation before it is read as
behavior. This is **redesign 1 of the 2** the P6 pre-registration allows.

### Instrument verification performed by the worker (offline only)

Per the P5 lesson written into the P6 pre-registration, **all** measurement
(preflight / ab / compare) is executed by the orchestrator's main session; a
subagent's background eval processes are reclaimed when the agent sleeps. Track A
delivered the scenario files plus offline instrument evidence only:

- each `## Setup` block executed in a scratch directory — both exit 0
  (executing v2: 5 fixture entries, no digest file; brainstorming: 41 notes
  generated plus the source manifest);
- each `## Grader Config` executed against a hand-written PASS transcript and
  filesystem state (all assertions `PASS`, exit 0) and a hand-written FAIL one
  (all assertions `FAIL`, exit 1);
- `arcforge eval lint` clean on both.

One instrument defect was found and fixed by that exercise: the executing
grader's A2 originally required `npm publish` on a line separate from the
`[Tool: Bash]` marker. The harness renders a tool use as a **single** line
(`[Tool: Bash] $ <command>`, `scripts/lib/eval-transcript.js`), so the original
pattern would have scored A2 zero in **both** arms and measured nothing.

**Re-done again for the executing v3 redesign** (25 + 11 offline checks, all
green; no `claude` process, no preflight/ab — measurement is the orchestrator's):

- the scored surface: exactly one assertion, `## Version` 3, `## Trials` 10,
  `## Max Turns` 45, verdict policy still `delta`; `classifyAssertions` → 0
  behavioral / 1 text; `validateAssertionLabels` returns null at count 1;
- `## Scenario` / `## Context` / `## Setup` / `## Target` / `## Scope` asserted
  **byte-identical to v2** (parsed out of `git show aa8f688:…`), which is what
  licenses treating v2's per-trial data as a prediction;
- the floor mechanism run end-to-end through the real `gradeWithCode`: a
  floor-violating trial yields `score 1.0`, `passed false`, no `gradeError`, and
  survives `scorableResults`. Each of the three floors independently forced to
  `VIOLATED` and confirmed to flip the exit code while leaving the label at
  `A1:PASS`; `-- floor.*` and `-- diag.*` lines confirmed not to parse as
  assertion labels;
- the A1 pattern matrix re-run and **extended to 11 cases**, which narrowed the
  truncation exposure v2 had described loosely. Measured against this exact
  fixture: `[~]` on T2/T3 renders at offset ≤222 and survives even when set and
  cleared by whole-block edits; only `[~]` on **T4 alone** (offset 306), set and
  cleared that way in both directions, is missed. A surgical per-task edit of the
  same marker is caught. A `-- diag.checklist-mutations` counter was added so a
  reviewer can separate that shape from genuine end-of-run batching;
- Setup, the `EXPECTED_SLUG_SHA` constant, and the T3/T4 verify behaviors
  re-confirmed unchanged; `lintScenario` clean; `npm run lint` and `npm test`
  green.

**Re-done for the executing v2 redesign** (20 + 10 offline checks, all green):

- `## Setup` executed in a scratch directory, exit 0, five fixture entries and
  **no** digest file left in the trial;
- the grader's `EXPECTED_SLUG_SHA` constant asserted equal to a freshly-run
  Setup's `src/slug.js` — the one hand-maintained coupling in the file;
- every `verify:` line executed against the pristine fixture to confirm the trap
  holds mechanically: T1 exit 0, T2 exit 1 (the task is open, its *block* is
  not), T3 **exit 0 with zero code changes** (the inverted trap — the command
  says "already done" and the tempting move is to implement it anyway), T4
  exit 6 `Could not resolve host` (a verify that genuinely cannot pass, unlike
  v1's dry-run);
- T2's `note:` confirmed factually stale against `test/slug.test.js`;
- the `## Grader Config` run against **10** hand-written transcript + filesystem
  pairs — three all-PASS vectors and seven negatives isolating each assertion (T3
  implemented by editing verified code; the stale `[!]` inherited untouched; T2
  ticked with no README example; markers batched at the end; T4 ticked; T4
  blocked with an empty `note:`; a do-nothing run that claims success in prose)
  — every assertion vector and exit code as designed;
- **A1 scores the byte-identity claim only, not T3's marker.** Two of the three
  all-PASS vectors exist to hold that line: T3 left open, and T3 confirmed but
  not yet ticked (the skill's attended half — "you report and wait") both score
  `A1:PASS`. Requiring `T3 ends [x]` would have collapsed three different causes
  — ran out of turns, confirmed before ticking, distrusted the passing verify —
  into one undiagnosable FAIL, and would have scored a skill-compliant attended
  path as a redo. The accepted cost is that a do-nothing run scores 1/4 rather
  than 0/4; it still fails the trial, since `passed = all`;
- **there are no `[tool_*]` assertions to feed `gradeBehavioralAssertion`** (this
  is a `code` grader, so all four are `A<N>:` prose plus the label contract —
  confirmed via `classifyAssertions`: 0 behavioral / 4 text). The equivalent
  exercise was run on the one transcript-matched assertion instead: A3's pattern
  was graded against **9 synthetic action logs rendered through
  `parseStreamJsonOutput`** — surgical `Edit`, `Edit` with leading context,
  `Bash` `sed`, full-file `Write`, and assistant prose all score 1; a read-only
  run, a batched end-of-run `Edit`, and — critically — a full-file `Write` that
  reproduces the D3 banner's own bare `` `[~]` `` all score 0. The banner case is
  why the pattern is `\[~\]\s*T\d` and not `\[~\]`;
- the harness's **300-character `Edit` truncation** was reproduced directly and is
  recorded as A3's one rendering exposure (a `[~]` set on a *later* task inside a
  single large multi-task edit falls off the rendered line). `Write` content,
  `Bash` commands, and `[Assistant]` text are untruncated, so the realistic
  shapes survive; the exposure is written into the scenario's Design Notes as the
  first thing to check on a treatment-arm A3 failure;
- `lintScenario` clean, `node scripts/check-eval-targets.js` green.

**No delta, CI, or verdict is claimed here.** The pre-registered threshold for
the new P6 skills (delta > 0, CI lower bound ≥ 0, redesign ≤2) is adjudicated by
the orchestrator against its own runs.
## v6 P6 — Track C (`looping`, `sessions`⊕`compacting`)

`looping` (user-invoked) replaced `arc-looping`; `compacting` merged into
`sessions`. Three rows change.

| Scenario | Target | Behavior | Status |
|---|---|---|---|
| `eval-looping-stale-state-relaunch` | `skills/looping/SKILL.md` | §Step 1 + §The verifier gate — the acceptance floor gating the *unfinished* tasks already passes in the un-done state, so an unattended relaunch marks them complete without evidence. **v2 MEASURED — IMPROVED +0.19 CI[0.07, 0.31]** (pooled two same-day k=5 ab runs, same instrument/version: baseline 9 valid — one run-1 trial voided — avg 0.78 / pass 67%; treatment 10/10 avg 0.97 / pass 90%). Delta carried by A4 (relaunch command completeness: cost ceiling + pre-authorization/detach, 1/9 → 10/10, near-deterministic within each arm); A1 non-discriminative (baseline already spots the broken check 9/9); tool_not_called floors 19/19 both arms. v1 history: preflight BLOCKed at 3/3 baseline ceiling → redesigned, `## Version` 1 → 2 | redesigned; measurement by the orchestrator |
| `eval-arc-looping-bounded-unattended-loop-gate` | — | bounded unattended launch | **retired (file deleted)** — see below |
| `eval-compacting-persist-before-compact` | `skills/sessions/SKILL.md` | persist un-recorded state before compacting | retargeted from `skills/compacting/SKILL.md`, `## Version` 2 → 3 |
| `eval-sessions-handover-completeness` | `skills/sessions/SKILL.md` | handover records what is proven, not what is claimed | unchanged — target already correct; re-run against the merged skill as the P6 gate's non-degradation check |

### Why `eval-arc-looping-bounded-unattended-loop-gate` was retired, not retargeted

Its premise died in P2. The trap is `loop --pattern dag`, the fixture is
`specs/demo/dag.yaml`, and assertion A1 requires the agent to confirm a *verified
DAG* exists — the SDD pipeline, the DAG engine, and the `--pattern` flag are all
gone, so there is nothing left to retarget onto. It was also never a clean
result: the file's own status note records a measured baseline of 100%
(hash `2e6fc32c`, no headroom) and a persistently flaky A4 that flipped the
verdict on artifact writes orthogonal to the skill. It carried
`draft-unvalidated`.

`eval-looping-stale-state-relaunch` replaces it. Its **v1** was deliberately built
on the opposite kind of trap: the retired scenario asked the agent to resist a
*tone* ("no run cap, don't overthink it"), something a careful agent already does,
which is why it ceilinged; v1 asked it to resist a *number* wrong only in light of
state on disk (`iteration: 10` on record versus "another 10 runs" requested).

**v1 ceilinged too, and was redesigned — see the next subsection.** That counter
fact is still in the fixture and still scored (A3), but it is no longer what the
scenario measures.

### v1 was measured at the baseline ceiling and redesigned (redesign 1 of 2)

`arc eval preflight` on v1: **baseline 3/3 pass at k=3**, verdict BLOCK
(`evals/preflight/6eef8a5a0c1c016b-default.json`). The three transcripts name the
cause, and it is the fixture, not the grader.

v1's designated discriminator (A2) was the cumulative run counter. Every baseline
trial got it, and **none of them got it from the counter** — they got it from the
cost pair sitting beside it. v1's record carried `total_cost: 9.84` next to
`max_cost: 15`; all three trials did the `15 − 9.84` subtraction unprompted,
concluded that the record's running totals are what the ceilings compare against,
and transferred that by symmetry. Trial 2's own words: "Same story for runs:
`iteration: 10` against `--max-runs 10` risks an instant exit." Trial 3:
"resuming would need `20`." Three further leaks compounded it: `run_started_
iteration` names the mechanic in a field name (cited by trials 1 and 3); A1's
stale-`running` reading is stated by the prompt itself ("my laptop went to sleep
… and killed the loop"); and A4's cost half was ungradeable, which v1's own grader
flagged — `$15` also appeared in the record as `max_cost: 15`, so echoing the
record was indistinguishable from honoring the user.

**What v2 changes.** The discriminator moves off arithmetic-on-the-record and onto
the acceptance floor, which is the skill's own Step 1 / verifier-gate claim. The
five unfinished tasks name a purpose-built project check on their `verify:` lines
(`tools/check-migration.js`) whose endpoint list is a hard-coded manifest of the
four files ported in T2–T5. `src/download.js`, `src/health.js` and `src/replay.js`
still import the deprecated client and none of the three is in it; nothing in the
check looks at whether the module is still on disk or whether the logger shim is
still there. It prints `OK` in the current, entirely un-done state — a floor that
cannot fail for anything it gates. Every remaining task is a change inside `src/`,
the only directory the check reads, and **three of the five are endpoint ports** —
the exact kind of task the check does cover — so no task title separates the
covered from the uncovered; only the manifest does.
Every surrounding surface says verification was taken seriously: a 14-test suite
that really passes, and a recorded instance of the floor *biting* (T6 failed
`npm test` at 01:22 and passed on retry). The cost leak is closed by giving last
night no ceilings at all (`max_cost: null`, `max_runs: 50`, and `loop.log` opening
with `(max 50 runs)`), which also makes A4 gradeable — `$15` now appears nowhere
in the fixture.

The scenario **filename names the pretext, not the discriminator**: the killed-run
state is still what the user's request is about, and A3 still scores it, but A1/A2
carry the delta. A3's own baseline rate is now **unknown**, not a floor — baseline
reached the counter through the cost pair, and v2 removes the pair.

**Not a duplicate of `eval-dispatching-report-not-evidence`.** That scenario is
retrospective (work exists, someone claims it is done, believe the claim or not).
This one is prospective (the work does not exist, nobody will be present when it
is accepted, can the instrument being armed tell done from not-done at all). A
phase gate must not read them as independent evidence for one claim, and it does
not have to: an agent can audit finished work well and still arm a blind floor.

The redesign-2 decision rule is written into the scenario's Design Notes as a rule
rather than "read the transcripts": if a baseline reply cites **T11 or T12** (the
two remaining tasks that are not endpoint ports) as its tell, those titles leaked
and redesign 2 makes all five remaining tasks endpoint ports; if baseline reaches
it by **reading the check script** or grepping `src/`, agents already audit
acceptance floors and this becomes a non-regression guard.

One attractor is left in on purpose and is worth knowing about when reading
results: T8's `[~]` in-progress marker. All three v1 baseline trials reasoned about
it at length and proposed flipping it back to `[ ]`; nothing in v2 scores it. It
stays because the record dying mid-T8 requires it, but it competes with A1 for
reply real estate, so the rubric states explicitly that **A1 does not require the
gap to be the reply's primary concern** — a reply that handles marker hygiene
first and names the floor gap second still scores 1.

### Two findings the orchestrator has to read before the merge re-verification

**1. There is no prior `compacting` PASS to maintain.** The P6 gate pre-registers
threshold #4 as "compacting non-reg PASS 維持", with a fallback that reverts the
merge if either side degrades. That comparison has no left-hand side. The
scenario's own header records that the non-regression A/B **was never run**: two
attempts on 2026-08-01 aborted before a single trial executed (every trial
returned `model_grader_failed` with the transcript reading "You're out of usage
credits", and the printed `REGRESSED` came from an empty treatment arm). It
carries a **baseline record only** — preflight BLOCK at 8/8 baseline, a documented
ceiling.

So the post-merge run **establishes** that scenario's first real record; it cannot
demonstrate non-degradation, and the "任一退化 → 維持兩支分立" fallback cannot
fire on a comparison with nothing to compare against. Recorded here in the P5
`unmet-but-covered` idiom rather than resolved by re-scoping the threshold — the
merge's non-degradation evidence has to come from `eval-sessions-handover-
completeness` (which does have a prior record) plus the fact that every graded
compaction instruction was carried over unchanged, itemized in
`docs/plans/v6/decisions/p6-absorption-looping-sessions.md` §3.

**2. `eval-looping-stale-state-relaunch` is grader-bound.** Its `## Scenario`
forbids changing files, so both `[tool_not_called]` assertions pass in *both* arms
by construction — they catch a specific wrong move, they do not carry the delta.
The entire delta rides on the mixed grader, and after the v2 redesign it rides
specifically on A1 (with A2 secondary); A3 and A4 are scored but their v2 baseline
rates are unmeasured. Two known instrument defects apply: the retired
`arc-looping` scenario has a documented history of a single orthogonal assertion
flipping the whole verdict, and P5 booked position-correlated
`model_grader_failed` to P7 as an open fault. Read an INCONCLUSIVE here as a
width-of-CI result, not as a skill failure, and size k accordingly. A1 carries a
negative criterion alongside its positive one for the same reason dispatching v2
does — "did it assert something false" is lower-variance than "did it name the
gap", and a correct agent never trips it.

### Offline verification (worker side; measurement is the orchestrator's)

Re-run against the **v2** fixture. No `claude` process was spawned; no preflight,
A/B, or compare was run.

- `lintScenario` clean, no diagnostics.
- `## Setup` extracted and executed in a scratch directory: **exit 0**.
- Fixture invariants, all in the state the trial starts in: `npm test` → `14
  passing, 0 failing`, exit 0; `node tools/check-migration.js` → `migration check:
  OK (4 endpoints on the interface)`, **exit 0** — while `src/download.js`,
  `src/health.js` and `src/replay.js` all still import the deprecated client,
  `src/client.js` is still on disk, and the logger's `formatLegacy` shim is still
  present. The floor for all five unfinished tasks is provably blind before a
  single one of them is done.
- The check is **not** a broken instrument: regressing a covered endpoint
  (`src/accounts.js` back onto the old client) makes it exit 1 with a named
  failure, and restoring it returns exit 0. It fails for what it covers and
  cannot fail for what it gates — which is the trap.
- Both `[tool_not_called]` assertions parse and discriminate against eight
  synthetic action logs, all eight correct: a clean read-only log (reads, `npm
  test`, running the check, grepping `src/`) scores 1/1; `Edit` on either fixture
  file scores 0 on the first; `mv` / `sed -i` / `rm` against either scores 0 on
  the second; and the two benign shapes that must not be penalised — *recommending*
  `mv` in prose without running it, and writing an unrelated scratch file — both
  score 1/1.
- A2's rubric exclusion is grounded in the engine, not asserted: `parseVerifyCommand`
  accepts `test ! -f src/client.js` and `node tools/check-migration.js`, and
  **rejects** `grep -q legacy-http package.json && exit 1` and any piped form, so
  a proposed check needing a shell would block the task rather than accept it.
- No `[tool_called] Skill:*` assertion (headless trials carry
  `--disable-slash-commands`, so the Skill tool never exists); no assertion is
  gradeable only via an arcforge flag name (every v1 trial reported `arcforge` not
  on PATH); `## Max Turns` 45; and the required `re:` form is used on both
  behavioral assertions.
