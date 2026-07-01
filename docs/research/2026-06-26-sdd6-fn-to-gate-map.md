# SDD-6 Migration Map: Retired Inline Functions -> `sdd-gate` Stages

> **Contributor note (NOT shipped surface).** Design/research record for the
> SDD-6 skill migration. Lives in `docs/research/` and documents internal
> decision history + the function->stage mapping. It is not user-facing skill
> content and must not leak into `skills/`, `hooks/`, or any other shipped row.

- **Date:** 2026-06-26
- **Scope:** `arc-refining` + `arc-planning` SKILL.md recipes
- **Engine surface:** `scripts/cli/sdd-gate-command.js` (dispatcher) ->
  `scripts/lib/sdd-validators.js` (validators/writer), re-exported through
  `scripts/lib/sdd-utils.js`
- **Landing commit:** `da6892f` —
  *feat(skills): migrate arc-refining/arc-planning SDD recipes to sdd-gate CLI (SDD-6)*

## Summary

v4.0.0 shipped the `sdd-gate <stage>` CLI engine (#87) but wired **zero skill
consumers** — the two skills that were supposed to call it (`arc-refining`,
`arc-planning`) kept running their old inline `node -e` recipes against the
retired functions. The SDD-6 migration replaces those eight inline recipes with
calls to the deterministic `sdd-gate` stages, completing the half that shipped.

This is a **correctness fix, not a cosmetic refactor**: at least one of the old
inline recipes (`writeConflictMarker` with two arguments) throws at runtime
against the current `sdd-validators.js`, which now requires a third `projectRoot`
argument. See [Load-bearing rationale](#load-bearing-rationale).

## Function -> Stage Map

Each retired inline function maps to exactly one `sdd-gate` stage. Verified
against the stage dispatch in `scripts/cli/sdd-gate-command.js` and the
validator definitions in `scripts/lib/sdd-validators.js`.

| Retired inline function | `sdd-gate` stage | Stage helper (sdd-gate-command.js) | Refiner/planner phase |
|---|---|---|---|
| `checkDagStatus` | `dag` | `stageDag` (L106) | refiner Phase 1 |
| `parseDesignDoc` + `validateDesignDoc` | `design` | `stageDesign` (L128) | refiner Phase 2 |
| `parseVision` / `validateVision`, `parseDecisionLedger` / `validateDecisionLedger`, `checkSpecDecisionGraph` (vision/ledger/graph validators) | `context` | `stageContext` (L139) | refiner Phase 2.5b |
| `parseSpecHeader` + `validateSpecHeader` | `header` | `stageHeader` (L205) | refiner Phase 6a / planner Phase 1 |
| `mechanicalAuthorizationCheck` | `authorize` | `stageAuthorize` (L220) | refiner Phase 6b |
| `writeConflictMarker` | `conflict` (explicit axis-1 / axis-2 / axis-3 write) **and** `authorize` (Phase 6b mechanical layer, write-on-block) | `stageConflict` (L265) + `stageAuthorize` (L238) | refiner Phase 4 / 5.5a / 5.5b (conflict); Phase 6b (authorize) |

### Notes on the two-place mapping for `writeConflictMarker`

`writeConflictMarker` is reached from **two** stages, because the conflict
handoff file is written on two distinct triggers:

1. **`conflict` stage (`stageConflict`)** — the explicit R3 conflict-marker
   write for axis-1, axis-2, and axis-3 blocks (refiner Phases 4 / 5.5a / 5.5b).
   Reads the conflict payload as JSON on stdin and calls
   `writeConflictMarker(specId, payload, projectRoot)` (sdd-gate-command.js L285).
2. **`authorize` stage (`stageAuthorize`)** — the Phase 6b mechanical layer.
   When `mechanicalAuthorizationCheck` returns `valid: false`, the stage
   deterministically writes the axis-3 conflict marker itself via
   `writeConflictMarker(specId, {...}, projectRoot)` (sdd-gate-command.js L238)
   so recovery state lands on disk regardless of agent behavior, then emits
   `axis_fired: '3'` in the block JSON.

This collapses every R3 conflict-write path through a single engine surface — no
skill phase calls `writeConflictMarker` directly any more.

## Load-bearing rationale

The migration corrects a recipe that throws at runtime.

`scripts/lib/sdd-validators.js` requires a **third `projectRoot` argument** and
fails closed without it:

```js
// sdd-validators.js — writeConflictMarker(specId, conflictData, projectRoot)
if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
  throw new Error('writeConflictMarker: projectRoot is required (pass an absolute path)');
}
```

(The validator is the definition the CLI actually calls: `sdd-gate-command.js`
imports `writeConflictMarker` from `../lib/sdd-utils`, and `sdd-utils.js`
re-exports the same `sdd-validators.js` function — there is no separate 2-arg
variant.)

The **old inline recipe** in `arc-refining/SKILL.md` (removed by `da6892f`)
called it with only **two** arguments:

```js
// retired inline recipe (Phase 4 and Phase 6b) — 2 args, no projectRoot
writeConflictMarker('<spec-id>', {
  axis_fired: '<1|2|3>',
  conflict_description: '...',
  candidate_resolutions: [ ... ],
  user_action_prompt: '...'
});
```

Against the current validator, that 2-arg call hits the `projectRoot` guard and
**throws** — the conflict handoff file is never written, breaking the
`fr-rf-014-ac5` / `fr-rf-015` write-on-block contract precisely when a block is
happening.

The `sdd-gate` stages supply the missing argument: both `stageAuthorize` and
`stageConflict` pass `projectRoot` as the third argument. So the migration
repairs a broken runtime path; it is not a stylistic cleanup. (`projectRoot` is
passed explicitly to avoid `cwd` surprises when the refiner is invoked from a
skill bash block.)

## Forensic summary — why the CLI shipped with zero consumers

The SDD-6 work was authored as two halves: an **engine half** (the `sdd-gate`
CLI surface) and a **skill half** (rewiring `arc-refining` + `arc-planning` to
consume it).

- The skill half was **plan-authorized** as part of SDD-6.
- It was then **owner-approved for deferral** into a combined
  *"Wave 6 + SDD-8 eval"* tranche.
- That deferral was **tracked only in prose** — there was no DAG node and no
  task entry pinning the skill-wiring as outstanding work.

Because the deferral lived only in prose, the downstream tranche ran as
intended for *eval* but not for *wiring*: **SDD-8 ran eval-only**, and the skill
consumers were never connected. The net effect: **v4.0.0 shipped the `sdd-gate`
CLI with zero consumers** — the engine landed (#87), every skill kept calling
the retired inline functions, and the broken 2-arg `writeConflictMarker` path
remained live in the skills.

The SDD-6 migration commit (`da6892f`) closes this gap: it salvages the
stranded skill-half WIP (cherry-picked from `3b6931f`; its engine-only parent
`7aa7dd5` was superseded by #87), reconciles the Phase 5.5a / 5.5b
cross-references, documents the exact `_pending-conflict.md` field contract
inline, and retargets the pytest skill contracts from the retired function
names to the `sdd-gate` surface.

### Process lesson for contributors

A two-half feature whose second half is deferred should be tracked as a **DAG
node or task**, not in prose. Prose-only deferral is invisible to the planning
surface, which is how an authorized-but-unbuilt skill half slipped past a major
release and shipped an engine with no callers — plus a live runtime throw in the
shipped skills. If you split engine and consumer work, leave a tracked,
gate-able artifact for the consumer half.
