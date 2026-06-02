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
| **Validated** | A non-draft scenario in the active suite whose `## Target` is `skills/<skill>/SKILL.md` — i.e. the audit's existing 9. | **Yes** |
| **Draft (unvalidated)** | Has a `## Target → skills/<skill>/SKILL.md` scenario marked `status: draft-unvalidated`. Structurally lint-clean, but discrimination NOT yet proven by a live run. | **No** |

**Operational proxy, not a live-run check.** The metric (and the recompute
snippet below) classify a skill as validated by **absence of the
`status: draft-unvalidated` marker**, NOT by confirming a passing live run. The
snippet does not — and cannot, here — execute `eval preflight`/`ab`. The 9
"validated" skills are inherited from the EVAL-1 audit's coverage assertion; this
doc has not independently re-run them. (`evals/benchmarks/latest.json` is a
recency-bounded snapshot and does not list a passing entry for every one of the
9, so it cannot be used as proof either way.) True validation is still the live
discriminative run.

A draft is a *candidate* for coverage, not coverage. Do not promote a draft to
validated until `arc eval preflight <name>` (or an `arc eval ab` run) confirms it
discriminates; then remove the `status: draft-unvalidated` marker from the file.

## Current coverage (as of 2026-06-02)

**Validated coverage: 9 / 33 shippable skills.**

Shippable skills = directories under `skills/` containing a `SKILL.md`, excluding
`*-workspace` (in-progress eval scratch dirs, out of scope per `.claude/rules/obsidian-wiki.md`).

### Skills with a VALIDATED scenario (9)

- arc-brainstorming
- arc-evaluating
- arc-learning
- arc-managing-sessions
- arc-refining
- arc-reflecting
- arc-using
- arc-verifying
- arc-writing-skills

### Skills with only a DRAFT scenario (5) — NOT counted as covered

These are the five core workflow skills called out by EVAL-1. Each now has a
structurally valid draft scenario, but **none has a live discriminative run**, so
none counts toward the 9/33 metric until validated.

| Skill | Draft scenario | Validate with |
|-------|----------------|---------------|
| arc-tdd | `eval-arc-tdd-test-first-gate` | `node scripts/cli.js eval preflight eval-arc-tdd-test-first-gate` |
| arc-debugging | `eval-arc-debugging-root-cause-first-gate` | `node scripts/cli.js eval preflight eval-arc-debugging-root-cause-first-gate` |
| arc-planning | `eval-arc-planning-pure-function-gate` | `node scripts/cli.js eval preflight eval-arc-planning-pure-function-gate` |
| arc-coordinating | `eval-arc-coordinating-cli-no-manual-fallback` | `node scripts/cli.js eval preflight eval-arc-coordinating-cli-no-manual-fallback` |
| arc-implementing | `eval-arc-implementing-orchestrator-no-direct-code` | `node scripts/cli.js eval preflight eval-arc-implementing-orchestrator-no-direct-code` |

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

Expected today: `validated: 9/33`, with the five core skills listed as draft-only.
When a draft is promoted (marker removed after a passing live run), it moves from
the draft list into the validated count automatically.
