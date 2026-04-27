# Epic: SDD Schemas — `_pending-conflict.md` and Decision-Log

**Spec:** `spec-driven-refine` v2 (2026-04-27)
**Source detail:** `specs/spec-driven-refine/details/sdd-schemas.xml`
**Depends on:** none (foundational)

## Description

Implement the schema rules and validator API for the two new artifact contracts that v2 introduces: the ephemeral `_pending-conflict.md` handoff (refiner → brainstorming) and the structured decision-log (brainstorming → refiner). Both schemas live as exported frozen constants in `scripts/lib/sdd-utils.js` with documentation in `scripts/lib/sdd-schemas/`. The validator API exposes parsers (`parseConflictMarker`, `parseDecisionLog`), a validator (`validateDecisionLog`), and the Phase 6 mechanical authorization helper that refiner uses to verify every `<trace>` cites real source content.

## Features

- [ ] `sdd-pending-conflict-rules` — `PENDING_CONFLICT_RULES` constant (fr-sd-012)
- [ ] `sdd-decision-log-rules` — `DECISION_LOG_RULES` constant (fr-sd-013)
- [ ] `sdd-validator-api` — parsers, validator, and authorization helper (fr-sd-014)

## Implementation Notes

- Follow the `DESIGN_DOC_RULES` / `SPEC_HEADER_RULES` precedent in `scripts/lib/sdd-utils.js` — frozen object literals with regex / required-field / canonical-path entries.
- Validators MUST reference rule constants directly (no duplicated literals inside function bodies — see `fr-sd-010-ac3` from v1).
- Wire format for both artifacts is an implementation choice (per `fr-cc-if-008-ac2` and `fr-cc-if-007-ac4`); pick one (likely YAML for arcforge convention) and document the choice in the schema.
- The mechanical authorization helper is the load-bearing piece for B.4 — it iterates over every `<trace>` element and verifies the cited content appears at the cited source. Tests should cover both line-range traces and `q_id`-indexed traces.

## Done When

All three features are in `"completed"` status; tests for parsers + validator + authorization helper pass; schema docs exist under `scripts/lib/sdd-schemas/`.
