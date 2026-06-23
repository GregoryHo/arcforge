# Skill Eval Coverage

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
| **Validated** | A non-draft scenario whose `## Target` is `skills/<skill>/SKILL.md`: the audit's inherited 9, plus 3 promoted on 2026-06-03 by a recorded passing `arc eval ab` run, plus 4 promoted on 2026-06-23 at the non-regression bar — a measured `arc eval preflight` baseline at ceiling (BLOCK) PLUS a treatment `arc eval run` SHIP. | **Yes** |
| **Draft (unvalidated)** | Has a `## Target → skills/<skill>/SKILL.md` scenario marked `status: draft-unvalidated`. Structurally lint-clean, but discrimination NOT yet proven by a live run. | **No** |

**Operational proxy vs. recorded runs.** The recompute snippet classifies a
skill as validated by **absence of the `status: draft-unvalidated` marker** — it
does not itself execute `eval preflight`/`ab`. For the inherited 9, that marker
absence is the only signal; they trace to the EVAL-1 audit's coverage assertion
and this doc has not independently re-run them (`evals/benchmarks/latest.json` is
a recency-bounded snapshot and does not list a passing entry for every one, so it
isn't proof either way). The **3 promoted on 2026-06-03** (arc-tdd, arc-planning,
arc-coordinating) are different: each carries a recorded live `arc eval ab` result
in its scenario marker (baseline→treatment delta, verdict PASS), so for those the
marker is backed by an actual discriminative run, not just an audit assertion. The
**4 promoted on 2026-06-23** (arc-dispatching-teammates, arc-dispatching-parallel,
arc-looping, arc-requesting-review) are backed by both arms recorded in each
scenario marker: a **measured `arc eval preflight` baseline at ceiling** (k=5
baseline pass 100% ≥ 0.8 → BLOCK, with its hash) PLUS a treatment `arc eval run`
SHIP (k=5: 5/5 PASS). The measured ceiling baseline is what classifies these as
non-regression: the behavior is baseline-competent, so the skill **formalizes**
it — the marker does NOT claim the skill adds it. That is the non-regression bar
(see the tiers below), weaker than the discrimination promotions, and it is exactly
the EVAL-1 twin pattern (baseline-at-ceiling).

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

## Current coverage (as of 2026-06-23)

**Validated coverage: 18 / 32 shippable skills** (16 carry a non-`draft` marker;
see the discrimination-vs-non-regression tiers below — 6 of the 18 are
non-regression passes with Δ≈0, weaker than the discrimination passes). The
denominator matches the recompute snippet's live count (`validated: 18/32`).

Shippable skills = directories under `skills/` containing a `SKILL.md`. Eval scratch
lives in `evals/workspaces/` (out of scope per `.claude/rules/obsidian-wiki.md`).

### Skills with a VALIDATED scenario (18)

- arc-brainstorming
- arc-coordinating  *(discrimination — arc eval ab: 40%→100%, Δ+0.15)*
- arc-debugging  *(non-regression — arc eval ab v2: 100%=100%, Δ0.00; baseline also passes)*
- arc-dispatching-parallel  *(non-regression — preflight baseline 100% ≥ 0.8 → BLOCK + arc eval run k=5: 5/5 SHIP; promoted 2026-06-23 after A4 regrade)*
- arc-dispatching-teammates  *(non-regression — preflight baseline 100% ≥ 0.8 → BLOCK + arc eval run k=5: 5/5 SHIP; promoted 2026-06-23 after A4 regrade)*
- arc-evaluating
- arc-implementing  *(non-regression — arc eval ab v2: 100%=100%, Δ0.00; baseline also passes)*
- arc-learning
- arc-looping  *(non-regression — preflight baseline 100% ≥ 0.8 → BLOCK + arc eval run k=5: 5/5 SHIP; promoted 2026-06-23 after A4 regrade)*
- arc-managing-sessions
- arc-planning  *(discrimination — arc eval ab: 0%→100%, Δ+0.25)*
- arc-reflecting
- arc-refining
- arc-requesting-review  *(non-regression — preflight baseline 100% ≥ 0.8 → BLOCK + arc eval run k=5: 5/5 SHIP; promoted 2026-06-23 after A4 regrade)*
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

**Non-regression (6)** — all six are **baseline-at-ceiling**: the no-skill baseline
*also* passes (modern Claude already states the behavior unaided in a single-turn
"describe your approach" prompt), so the skill *formalizes* a behavior it already
exhibits rather than *adding* it (cf. `.claude/rules/eval.md`: "skill formalizes
existing behavior"). Passing does NOT prove the skill adds the behavior. Verdict
policy is `non-regression`, matching arc-verifying. All six have a **measured**
baseline backing the classification — the EVAL-1 pair via `arc eval ab` v2
(baseline 100% = treatment 100%, Δ0.00), and the four promoted 2026-06-23 via
`arc eval preflight` (k=5 baseline pass 100% ≥ 0.8 ceiling → BLOCK) plus a
treatment `arc eval run` SHIP. The table records each.

| Skill | Baseline (measured) | Treatment |
|-------|--------------|-----------|
| arc-debugging | A/B v2: baseline 100%, Δ0.00 | treatment 100% |
| arc-implementing | A/B v2: baseline 100%, Δ0.00 | treatment 100% |
| arc-dispatching-teammates | preflight: 100% ≥ 0.8 → BLOCK (0def1773) | arc eval run: 5/5 SHIP |
| arc-dispatching-parallel | preflight: 100% ≥ 0.8 → BLOCK (695c6f5e) | arc eval run: 5/5 SHIP |
| arc-looping | preflight: 100% ≥ 0.8 → BLOCK (2e6fc32c) | arc eval run: 5/5 SHIP |
| arc-requesting-review | preflight: 100% ≥ 0.8 → BLOCK (db3fe84f) | arc eval run: 5/5 SHIP |

> **A4 regrade (the recurring over-strict grader).** Six non-regression scenarios
> first showed a **false** failing verdict because their A4 assertion flagged *any*
> read-only `[Tool: Bash]` (the agent reading the fixture via `ls`/`cat`/`git status`),
> conflicting with the scenarios' own "you may read files" — and the skills, which
> encourage investigation, tripped it more. The EVAL-1 pair (arc-debugging,
> arc-implementing) was fixed first; the four Wave 6 drafts
> (arc-dispatching-teammates, arc-dispatching-parallel, arc-looping,
> arc-requesting-review) carried the same copied A4 and were regraded identically
> on 2026-06-23. The fix guards the real regression — production code written /
> fixture mutated / artifacts created (detected by effect: fixture sha + new-file
> scan), not Bash presence — so read-only investigation no longer trips A4. A1/A2/A3,
> the real discriminators, were left untouched. See each scenario's
> `validated-nonregression` status marker. `arc-implementing` also has
> `sdd-v2-arc-implementing-delegation` (prose `## Target`, so not counted by the
> strict-Target metric); the new scenario targets a different facet to avoid duplication.

### Skills with a DRAFT (unvalidated) scenario (0)

None. The four Wave 6 drafts (AF-14 autonomy package + RV-9 review-gates) authored
2026-06-23 — arc-dispatching-teammates, arc-dispatching-parallel, arc-looping, and
arc-requesting-review — were promoted to validated on 2026-06-23 after the A4
regrade (see the non-regression tier and the A4-regrade note above). Each recorded
a measured `arc eval preflight` baseline at ceiling (k=5: 100% ≥ 0.8 → BLOCK) plus
a treatment `arc eval run` SHIP (k=5: 5/5 PASS) once A4 stopped flagging read-only
Bash — the baseline-at-ceiling non-regression bar, like the EVAL-1 twins. Their
discriminative traps are summarized in the non-regression tier table; the trap
detail lives in each scenario's `## Context`.

### Skills with NO scenario (14)

The remaining 14 shippable skills (arc-agent-driven, arc-auditing-spec,
arc-compacting, arc-executing-tasks, arc-finishing, arc-journaling,
arc-maintaining-obsidian, arc-observing, arc-recalling, arc-receiving-review,
arc-researching, arc-using-worktrees, arc-writing-tasks, arc-diagramming-obsidian)
have no direct-target scenario at all. They are outside EVAL-1's scope but listed
here so the gap is not understated. Use the recompute snippet for the authoritative
live list. (arc-looping, arc-dispatching-parallel, arc-dispatching-teammates were
added under AF-14 and arc-requesting-review under RV-9; all four were promoted from
DRAFT to VALIDATED on 2026-06-23 after the A4 regrade. arc-finishing-epic was merged
into arc-finishing in WT-6.)

## RV-9 adjudications (behavioral vs exempt)

Recorded rulings on whether a skill edit needs its own eval, per
`skills/arc-evaluating/SKILL.md` ("the line is behavioral footprint, not edit size").

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

Expected today: `validated: 18/32`, with zero draft-only skills — the four Wave 6
drafts (`arc-dispatching-parallel`, `arc-dispatching-teammates`, `arc-looping` — the
AF-14 autonomy-package drafts — and `arc-requesting-review`, the RV-9 draft) were
promoted on 2026-06-23 after the A4 regrade. Of the 18, three validate by
discrimination and six as non-regression (the two EVAL-1 pair plus the four Wave 6
promotions); see the tiers above. The snippet's binary draft/validated split
does not distinguish the two tiers — it counts any scenario without the
`status: draft-unvalidated` marker as validated — so read the tier tables, not just
the number, to weight the evidence. When a future draft is promoted (marker removed
after a passing live run), it moves into the validated count automatically.
