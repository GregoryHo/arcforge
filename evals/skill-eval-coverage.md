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

### Skills with a DRAFT (unvalidated) scenario — A4-flawed, rework pending (4)

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
arc-compacting, arc-executing-tasks, arc-finishing, arc-journaling,
arc-maintaining-obsidian, arc-observing, arc-recalling, arc-receiving-review,
arc-researching, arc-using-worktrees, arc-writing-tasks, arc-diagramming-obsidian)
have no direct-target scenario at all. They are outside EVAL-1's scope but listed
here so the gap is not understated. Use the recompute snippet for the authoritative
live list. (arc-looping, arc-dispatching-parallel, arc-dispatching-teammates were
added under AF-14 and arc-requesting-review under RV-9; all four DO have a
direct-target scenario but currently sit in the A4-flawed DRAFT section above — they
are not in this no-scenario list. arc-finishing-epic was merged into arc-finishing
in WT-6.)

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

Expected today: `validated: 14/32`, with four draft-only skills —
`arc-dispatching-parallel`, `arc-dispatching-teammates`, `arc-looping` (the AF-14
autonomy-package scenarios) and `arc-requesting-review` (the RV-9 scenario). These
four were briefly promoted on 2026-06-23 but reverted to `status: draft-unvalidated`
on 2026-06-24 after a fresh k=5 exposed their 5/5 SHIP as favorable variance (A4 is
flaky for the describe-style scenarios — see the A4 note and DRAFT section above).
Of the 14, three validate by discrimination and two as non-regression (the EVAL-1
pair); see the tiers above. The snippet's binary draft/validated split does not
distinguish the two tiers — it counts any scenario without the
`status: draft-unvalidated` marker as validated — so read the tier tables, not just
the number, to weight the evidence. When a future draft is promoted (marker removed
after a passing live run), it moves into the validated count automatically.
