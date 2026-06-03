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

**Validated coverage: 12 / 33 shippable skills.**

Shippable skills = directories under `skills/` containing a `SKILL.md`, excluding
`*-workspace` (in-progress eval scratch dirs, out of scope per `.claude/rules/obsidian-wiki.md`).

### Skills with a VALIDATED scenario (12)

- arc-brainstorming
- arc-coordinating  *(promoted 2026-06-03 — arc eval ab: 40%→100%, Δ+0.15, PASS)*
- arc-evaluating
- arc-learning
- arc-managing-sessions
- arc-planning  *(promoted 2026-06-03 — arc eval ab: 0%→100%, Δ+0.25, PASS)*
- arc-reflecting
- arc-refining
- arc-tdd  *(promoted 2026-06-03 — arc eval ab: 0%→100%, Δ+0.25, PASS)*
- arc-using
- arc-verifying
- arc-writing-skills

### Skills with a DRAFT scenario that did NOT validate (2) — NOT counted as covered

Of the five core-workflow drafts authored for EVAL-1, three validated on
2026-06-03 (now in the list above). The remaining two were run through
`arc eval ab` (k=5) the same day but **regressed** — the skill arm did not beat
the no-skill baseline — so they do NOT count toward coverage and need redesign:

| Skill | Draft scenario | A/B result (k=5) | Why it failed / next step |
|-------|----------------|------------------|---------------------------|
| arc-debugging | `eval-arc-debugging-root-cause-first-gate` | baseline 100% → treatment 40%, Δ−0.15, REGRESSED | Baseline at-ceiling (preflight k=3 had shown 67%, so the trap is non-robust). Needs a harder trap where the no-skill agent reliably skips root-cause analysis. |
| arc-implementing | `eval-arc-implementing-orchestrator-no-direct-code` | baseline 20% → treatment 0%, Δ−0.05 (CI spans 0), REGRESSED | No significant skill effect; both arms struggle. Trap/grader needs redesign so the orchestrator-role behavior is cleanly separable. |

> Note: `arc-implementing` also has `sdd-v2-arc-implementing-delegation`, a
> behavioral scenario whose `## Target` is prose (not a `SKILL.md` path), so it is
> not counted by the strict-Target metric and has no recorded passing run in
> `evals/benchmarks/latest.json`. The new draft targets a different facet (stated
> orchestrator role + Phase 0 `blocked_by` gate) to avoid duplication.

### Skills with NO scenario (19)

The remaining 19 shippable skills (e.g. arc-agent-driven, arc-auditing-spec,
arc-compacting, arc-executing-tasks, arc-finishing, arc-finishing-epic,
arc-journaling, arc-looping, arc-maintaining-obsidian, arc-observing,
arc-recalling, arc-receiving-review, arc-requesting-review, arc-researching,
arc-using-worktrees, arc-writing-tasks, arc-dispatching-parallel,
arc-dispatching-teammates, arc-diagramming-obsidian) have no direct-target
scenario at all. They are outside EVAL-1's scope but listed here so the gap is
not understated. Use the recompute snippet for the authoritative live list.

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

Expected today: `validated: 12/33`, with arc-debugging and arc-implementing as the
only draft-only skills (their A/B runs regressed — see above). When a draft is
promoted (the `status: draft-unvalidated` marker removed after a passing live run),
it moves from the draft list into the validated count automatically.
