# Feature: Phase 5.5 self-contradiction sub-pass + axis 3 LLM judgment

## Source
- Requirement: `fr-rf-014`
- Detail: `details/refiner.xml`

## Dependencies
- `rf-no-invention-discipline` (axis-3 LLM coverage builds on no-invention semantics)

## Acceptance Criteria

See `specs/spec-driven-refine/details/refiner.xml#fr-rf-014` for canonical ACs.

Summary:
- [ ] Phase 5.5 LLM sub-pass detects scope mismatches (description says "system handles X" but ACs only test success path) — BLOCK with terminal output (requirement ID, mismatch, remediation hint).
- [ ] Phase 5.5 detects RFC-2119 verb mismatches (description MUST vs sibling AC SHOULD on same axis) — BLOCK.
- [ ] Phase 5.5 also performs axis 3 coverage LLM judgment: every criterion in in-memory draft must have a citable (design phrase ∪ Q&A row) source. No citable source → BLOCK per `fr-rf-001` axis 3.
- [ ] On any Phase 5.5 finding, R3 enforcement severity (BLOCK + non-zero exit + no spec.xml + no details/). MUST NOT downgrade to WARNING. Phase 5.5 self-contradiction findings BLOCK terminal-only (per design literal scope of B.2 — `_pending-conflict.md` is for axes 1/2/3); axis-3 LLM coverage findings trigger handoff via `fr-rf-015`.
