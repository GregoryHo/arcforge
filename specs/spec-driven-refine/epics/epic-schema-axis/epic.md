# Epic: Schema Auto-Gen Pipeline Completion

## Source

- Spec: `specs/spec-driven-refine/spec.xml` (v3, design iteration 2026-04-30)
- Detail: `specs/spec-driven-refine/details/sdd-schemas.xml`
- Delta refs: `<modified ref="fr-sd-011" />`, `<added ref="fr-sd-015" />`, `<added ref="fr-sd-016" />`

## Description

Mechanical extension of the v2.0.0 single-source-of-truth model
(documented at vault note `arcforge-decision-spec-schema-formalization`)
to the two SDD schemas added in v2 sprint that were authored as
hand-written markdown without going through `print-schema.js` auto-gen.

The v2 sprint added `DECISION_LOG_RULES` (fr-sd-013) and
`PENDING_CONFLICT_RULES` (fr-sd-012) constants, plus validators
(fr-sd-014). The corresponding `scripts/lib/sdd-schemas/decision-log.md`
and `pending-conflict.md` markdown files were authored by hand. They
ship the same content the constants describe but the two artifacts
can drift silently — there is no `print-schema.js` renderer for them
and no `sdd-schemas-fresh.test.js` drift gate.

This epic closes that gap by extending the renderer pattern
(renderSpec, renderDesign) with two siblings, regenerating the two
markdown files via the CLI, and extending the drift gate to cover
all four schema files. The result: the v2.0.0 decision applies
uniformly across the four sdd-schemas/*.md files, drift becomes
structurally impossible, and skill access pattern shifts so direct
read of `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/<name>.md` is the
recommended primary form (CLI retained as equivalent alternative).

## Features

- `schema-renderers` (fr-sd-015): Add `renderDecisionLog()` and
  `renderPendingConflict()` to `scripts/lib/print-schema.js`. Prose
  narrative lives in renderer body via `lines.push('...')`;
  structured fields source from rule constants.
- `schema-drift-gate` (fr-sd-016): Extend
  `tests/scripts/sdd-schemas-fresh.test.js` to cover all four schema
  markdown files (design, spec, decision-log, pending-conflict) via
  byte-equal check. Depends on `schema-renderers`.
- `schema-cli-access-pattern` (fr-sd-011): Update CLI to accept four
  targets (was two) and update SDD-pipeline skills to reference
  schema via direct read at
  `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/<name>.md` as primary
  form, retaining CLI as alternative. Depends on `schema-renderers`.

## Dependencies

None. This epic is one of two parallel axes in v3 (the other is
`epic-path-discipline`). Schema axis lands first because
`epic-path-discipline` depends on it (path discipline lint must
scan the updated SKILL.md prose that this epic produces).

## Acceptance

- All three features completed (status `completed` in `dag.yaml`)
- `node scripts/lib/print-schema.js decision-log --markdown` and
  `node scripts/lib/print-schema.js pending-conflict --markdown`
  both produce output matching the corresponding committed file
- `tests/scripts/sdd-schemas-fresh.test.js` passes with four cases
- `npm test` passes overall
