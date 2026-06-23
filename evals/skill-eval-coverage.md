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
| **Validated** | A non-draft scenario whose `## Target` is `skills/<skill>/SKILL.md`: the audit's inherited 9, plus 3 promoted on 2026-06-03 by a recorded passing `arc eval ab` run. | **Yes** |
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
marker is backed by an actual discriminative run, not just an audit assertion.

A draft is a *candidate* for coverage, not coverage. Do not promote a draft to
validated until `arc eval preflight <name>` (or an `arc eval ab` run) confirms it
discriminates; then remove the `status: draft-unvalidated` marker from the file.

## Current coverage (as of 2026-06-03)

**Validated coverage: 14 / 32 shippable skills** (12 carry a non-`draft` marker;
see the discrimination-vs-non-regression tiers below — 2 of the 14 are
non-regression passes with Δ≈0, weaker than the discrimination passes). The
denominator matches the recompute snippet's live count (`validated: 14/32`).

Shippable skills = directories under `skills/` containing a `SKILL.md`. Eval scratch
lives in `evals/workspaces/` (out of scope per `.claude/rules/obsidian-wiki.md`).

### Skills with a VALIDATED scenario (14)

- arc-brainstorming
- arc-coordinating  *(discrimination — arc eval ab: 40%→100%, Δ+0.15)*
- arc-debugging  *(non-regression — arc eval ab v2: 100%=100%, Δ0.00; baseline also passes)*
- arc-evaluating
- arc-implementing  *(non-regression — arc eval ab v2: 100%=100%, Δ0.00; baseline also passes)*
- arc-learning
- arc-managing-sessions
- arc-planning  *(discrimination — arc eval ab: 0%→100%, Δ+0.25)*
- arc-reflecting
- arc-refining
- arc-tdd  *(discrimination — arc eval ab: 0%→100%, Δ+0.25)*
- arc-using
- arc-verifying
- arc-writing-skills

### Validation tiers — discrimination vs non-regression

The five EVAL-1 scenarios all validated, but in two different (both legitimate)
ways. Counting them identically would overstate the weaker two, so they are
distinguished here.

**Discrimination (3)** — the no-skill baseline genuinely fails the trap and the
skill flips it to pass. Strong evidence the skill *adds* the behavior:

| Skill | A/B (k=5) |
|-------|-----------|
| arc-tdd | baseline 0% → treatment 100%, Δ+0.25 |
| arc-planning | baseline 0% → treatment 100%, Δ+0.25 |
| arc-coordinating | baseline 40% → treatment 100%, Δ+0.15 |

**Non-regression (2)** — the baseline *also* passes (modern Claude states the
behavior unaided in a single-turn "describe your approach" prompt), so the A/B
delta is ≈0. The scenario guards against the skill *regressing* the behavior; it
does NOT prove the skill adds it (cf. `.claude/rules/eval.md`: "skill formalizes
existing behavior"). Verdict policy is `non-regression`, matching arc-verifying.

| Skill | A/B v2 (k=5) |
|-------|--------------|
| arc-debugging | baseline 100% = treatment 100%, Δ0.00 |
| arc-implementing | baseline 100% = treatment 100%, Δ0.00 |

> Both non-regression scenarios first showed a **false** `REGRESSED` verdict because
> their A4 assertion flagged *any* read-only `[Tool: Bash]` (the agent reading the
> fixture via `ls`/`cat`), conflicting with the scenarios' own "you may read files"
> — and the skills, which encourage investigation, tripped it more. A4 was fixed to
> guard the real regression (production code written / fixture mutated); see each
> scenario's status marker (`validated-nonregression`, v2). `arc-implementing` also
> has `sdd-v2-arc-implementing-delegation` (prose `## Target`, so not counted by the
> strict-Target metric); the new scenario targets a different facet to avoid duplication.

### Skills with a DRAFT (unvalidated) scenario (4)

Authored 2026-06-23 for Wave 6 (AF-14 autonomy package + RV-9 review-gates). Each has a
`## Target → skills/<skill>/SKILL.md` scenario that is structurally lint-clean
(`eval lint` ok, registered in `eval list`) but carries `status: draft-unvalidated`.
Per the tiers above, a draft is a *candidate* for coverage, not coverage — these
do NOT count toward the validated metric until a recorded passing live run
(`arc eval preflight`/`ab`) removes the marker.

| Skill | Draft scenario | Discriminative trap |
|-------|----------------|---------------------|
| arc-dispatching-teammates | eval-arc-dispatching-teammates-lead-present-routing | lead-present multi-epic → teammates, not manual window-juggling, not arc-looping (boundary = attendance) |
| arc-dispatching-parallel | eval-arc-dispatching-parallel-feature-level-readiness | engine-computed readiness (`parallel --features`) + parallelize independent features, not eyeball + sequential-for-safety |
| arc-looping | eval-arc-looping-bounded-unattended-loop-gate | verified DAG + green baseline + bounded `--max-runs` before an unattended overnight loop, not an unbounded blind launch |
| arc-requesting-review | eval-arc-requesting-review-dispatch-fidelity | faithful PR/branch context — resolve real `BASE_SHA`/`HEAD_SHA` via `git rev-parse` + fill the five code-reviewer placeholders, not blank SHAs + a hand-waved "look at my recent changes" (verdict policy `non-regression`: the 0.8 preflight ceiling may BLOCK since modern Claude often captures the range unaided) |

### Skills with NO scenario (14)

The remaining 14 shippable skills (arc-agent-driven, arc-auditing-spec,
arc-compacting, arc-executing-tasks, arc-finishing, arc-journaling,
arc-maintaining-obsidian, arc-observing, arc-recalling, arc-receiving-review,
arc-researching, arc-using-worktrees, arc-writing-tasks, arc-diagramming-obsidian)
have no direct-target scenario at all. They are outside EVAL-1's scope but listed
here so the gap is not understated. Use the recompute snippet for the authoritative
live list. (arc-looping, arc-dispatching-parallel, arc-dispatching-teammates moved
to the DRAFT section under AF-14; arc-requesting-review under RV-9;
arc-finishing-epic was merged into arc-finishing in WT-6.)

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

Expected today: `validated: 14/32`, with four draft-only skills
(`arc-dispatching-parallel`, `arc-dispatching-teammates`, `arc-looping` — the
AF-14 autonomy-package drafts — and `arc-requesting-review`, the RV-9 draft). The
five EVAL-1 scenarios remain validated — three by discrimination, two as
non-regression; see the tiers above. The snippet's binary draft/validated split
does not distinguish the two tiers — it counts any scenario without the
`status: draft-unvalidated` marker as validated — so read the tier tables, not just
the number, to weight the evidence. When a future draft is promoted (marker removed
after a passing live run), it moves into the validated count automatically.
