# spec-driven-refine v3 — Production Path-Resolution Discipline

## Context (iterating from spec-driven-refine v2)

spec-driven-refine v2 (current `spec_version`, `design_iteration` 2026-04-27)
brought in: DAG completion gate in refiner (fr-rf-012), three-axis R3
contradiction check, wiki-style delta accumulation, `_pending-conflict.md`
ephemeral handoff, mechanical authorization check (fr-rf-010), and the
`DECISION_LOG_RULES` + `PENDING_CONFLICT_RULES` schema constants
(fr-sd-013, fr-sd-012). All v2 features are completed (DAG fully green
prior to v3 brainstorm).

The audit performed during v3 brainstorm surfaced two cross-cutting
issues that v2 inherited but did not close:

**Issue A — Schema SoT implementation drift.** The v2.0.0 release decision
(see vault note `arcforge-decision-spec-schema-formalization`) established
that `scripts/lib/sdd-utils.js` rule constants are the single source of
truth, with `print-schema.js` rendering markdown at
`scripts/lib/sdd-schemas/<name>.md` and a CI drift gate
(`tests/scripts/sdd-schemas-fresh.test.js`) keeping the markdown
byte-equal to the rendered output. This was implemented for `spec.md`
and `design.md`. The two new schemas added during v2 sprint
(`decision-log.md`, `pending-conflict.md`) ship the rule constants but
were authored as hand-written markdown, never plumbed through
`print-schema.js`, and are not covered by the drift gate. The constants
and the markdown can therefore drift silently — already a contradiction
of the v2.0.0 decision. Verification: `print-schema.js` source explicitly
documents only `design` and `spec` as supported targets; the drift test
file enumerates only those two markdown paths.

**Issue B — Plugin distribution path discipline gap.** arcforge ships as
a Claude Code plugin. At runtime the LLM works in the user's project
(cwd ≠ plugin install). The SessionStart hook (`hooks/inject-skills/main.sh`)
sets `ARCFORGE_ROOT` and pushes it into both the Bash environment and
the LLM's `additionalContext`. Despite the mechanism existing, multiple
shipped SDD skills reference plugin shared library content via
cwd-relative patterns — `node -e "require('./scripts/lib/...')"` (P2)
and bare prose paths like "see `scripts/lib/sdd-utils.js`" (P3) — that
work in contributor dev mode (cwd = arcforge repo) but break the moment
the LLM runs them in a user's project cwd. The audit identified
violations across arc-brainstorming, arc-refining, arc-planning, and
related SDD skills.

OpenSpec field-verification research (recorded at
`docs/research/openspec-schema-architecture-2026-04-30.md`) confirmed
that the existing arcforge SoT model is a deliberate architectural
choice (constants-as-SoT with derived markdown), not the only viable
approach (OpenSpec uses prose-as-SoT with parallel Zod validators). The
research closes a re-litigation risk: Issue A is purely incomplete
application of the existing model, not a model defect. v3 fixes
the incompleteness, no new model adopted.

Pre-work completed during brainstorm (commit `2a189db`):
arc-writing-skills now carries a Path Resolution section documenting
the `${ARCFORGE_ROOT}` / `${SKILL_ROOT}` prefix discipline, anti-pattern
examples, and a pointer to the planned CI lint. This sharpens the
authoring guide before v3 implementation tasks land — implementer
agents working on subsequent SDD skill edits will see the discipline as
they consult their own meta-skill.

## Change Intent

v3 closes both gaps in one sprint, framed as two parallel axes that
share the same production-readiness goal.

**Schema axis — extend auto-gen pipeline to two missing schemas.** This
is mechanical work, no new architecture introduced. The print-schema.js
renderer pattern (`renderSpec`, `renderDesign`) gets two siblings
(`renderDecisionLog`, `renderPendingConflict`). The prose narrative
currently held in the hand-written `decision-log.md` and
`pending-conflict.md` files moves into the renderer functions using the
existing `lines.push('...')` idiom — placing prose in its natural
template location while keeping structured data sourced from the rule
constants. Once the renderers exist, the two markdown files are
regenerated via the CLI and acquire the existing AUTO-GENERATED header.
The drift gate (`sdd-schemas-fresh.test.js`) is extended to cover both
new files, structurally preventing future drift.

The LLM-facing access path direction shifts: skills should reference
schema content via direct file read at
`${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/<name>.md` as the primary
recommendation. The CLI form `node ${ARCFORGE_ROOT}/scripts/lib/print-schema.js <name>`
is retained as an equivalent alternative for ops and contributor
regeneration use, and remains valid in skill prose where it fits the
context, but is no longer the default form skill prose recommends.
This collapses one indirection layer for routine schema lookup while
preserving the CLI as a tool surface.

**Path-resolution axis — institute cc-005 as a cross-cutting constraint.**
A new constraint joins the existing cc-001 / cc-003 / cc-004 cluster in
`specs/spec-driven-refine/spec.xml` `<cross_cutting>`. The constraint
scope is deliberately narrow: when LLM-facing prose in `skills/`,
`templates/`, or `agents/` references plugin shared library content
(paths under `scripts/lib/`), the reference MUST be prefixed with
`${ARCFORGE_ROOT}/`. This scope was chosen after explicit examination
of overreach risk — Node.js module-system relative requires within
`scripts/lib/` itself, test runner relative paths within `tests/`, and
hook execution paths via `${CLAUDE_PLUGIN_ROOT}` are all explicitly
out-of-scope because each has a separate, correct mechanism that
already handles cross-project safety. Skill-local relative patterns
(via `${SKILL_ROOT}/scripts/...`, or `cd ${SKILL_ROOT}` then bare
references) are author's judgment and not enforced — static analysis
cannot reliably distinguish legitimate from broken cd-then-bare patterns
without effectively parsing Bash semantics.

CI lint at `tests/scripts/skill-path-discipline.test.js` enforces the
constraint mechanically: a syntactic scan of `skills/**/SKILL.md`,
`templates/**/*.md`, and `agents/**/*.md` for bare `scripts/lib/`
references not preceded by `${ARCFORGE_ROOT}/`. Test failure blocks
merge. There is no bypass mechanism — fix the path, do not annotate
around the lint. The lint scope intentionally excludes other
plugin-internal directories (hooks, agents themselves, scripts/cli.js)
because the high-frequency violation surface and the audited-confirmed
problem area is `scripts/lib/`. Future expansion is possible if other
directories accumulate violations, but YAGNI applies for v3.

The audited P2/P3 violations across the affected SDD skills are fixed
in this sprint as part of cc-005 enforcement landing — a sprint that
introduces the rule but leaves existing violators unfixed would ship a
broken state.

## Architecture Impact

No new SoT model is introduced. No deletions: the print-schema.js CLI
is retained as an equivalent alternative access path, not deprecated.
One new cross-cutting constraint enters spec.xml; arc-writing-skills
already carries the corresponding author-facing guidance (pre-work
landed at `2a189db`). One new CI test file complements the existing
drift gate. The audit footprint is bounded by the lint scope — fixes
to existing P2/P3 violations are mechanical (prefix addition), with no
semantic changes to SDD skill behavior. The combined sprint moves
arcforge measurably closer to safe end-user distribution by eliminating
the two known cwd-dependency / drift-permitted patterns that v2 left
open.
