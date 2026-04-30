# Feature: schema-renderers

## Source

- Requirement: fr-sd-015 (`specs/spec-driven-refine/details/sdd-schemas.xml`)
- Epic: `epic-schema-axis`

## Dependencies

None within epic. (No upstream features.)

## Acceptance Criteria

- [ ] `scripts/lib/print-schema.js` exports `renderDecisionLog(opts)`
      and `renderPendingConflict(opts)` matching the existing
      `renderSpec` / `renderDesign` signature
- [ ] Both functions wired into `main()`'s target dispatch — `node
      print-schema.js decision-log` and `node print-schema.js
      pending-conflict` produce output
- [ ] Renderers source structured fields from `DECISION_LOG_RULES`
      and `PENDING_CONFLICT_RULES`; prose narrative lives in renderer
      body as `lines.push('...')` string literals (NOT inside the rule
      constant as a `narrative` field)
- [ ] `scripts/lib/sdd-schemas/decision-log.md` regenerated via
      `node print-schema.js decision-log --markdown > scripts/lib/sdd-schemas/decision-log.md`
      and carries the AUTO-GENERATED header (matching spec.md/design.md style)
- [ ] `scripts/lib/sdd-schemas/pending-conflict.md` regenerated equivalently
- [ ] Existing `print-schema.js` tests continue to pass; `--help`
      output reflects the four targets
