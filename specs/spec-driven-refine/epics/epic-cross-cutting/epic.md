# Epic: Cross-Cutting Interface Contracts

**Spec:** `spec-driven-refine` v2 (2026-04-27)
**Source detail:** `specs/spec-driven-refine/details/cross-cutting.xml`
**Depends on:** `epic-sdd-schemas`

## Description

Formalize the interface contracts for the two new artifacts as cross-cutting requirements alongside the v1 contracts (`fr-cc-if-001` design doc, `fr-cc-if-002` Spec Identity Header). These contract requirements describe the architectural roles of `_pending-conflict.md` (refiner producer / brainstorming consumer) and the structured decision-log (brainstorming producer / refiner consumer). The implementations live in `epic-sdd-schemas`; this epic verifies the contracts are correctly captured and cross-referenced.

## Features

- [ ] `cc-pending-conflict-contract` — `_pending-conflict.md` handoff contract (fr-cc-if-007)
- [ ] `cc-decision-log-contract` — Structured decision-log format contract (fr-cc-if-008)

## Implementation Notes

- These are spec-content requirements — no new code beyond what `epic-sdd-schemas` already produces. Implementation is "verify the contract maps to a real `PENDING_CONFLICT_RULES` / `DECISION_LOG_RULES` export and the rule constants enforce the field-shape invariants the contract describes."
- Tests: assertion-style — given the rule constants exist, the contract requirements are satisfied. Likely a single integration test that parseSpecHeader on `spec.xml` shows both `fr-cc-if-007` and `fr-cc-if-008` resolve.
- Watch for drift: if `epic-sdd-schemas` later changes a field name in `PENDING_CONFLICT_RULES`, this epic's contract description must also update — `fr-cc-if-006-ac2` from v1 (drift-between-layers-is-ERROR) applies.

## Done When

Both features in `"completed"` status; the rule constants from `epic-sdd-schemas` satisfy the contract field-shape invariants; cross-references between contract requirements and schema requirements are valid.
