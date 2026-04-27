# Feature: Phase 6 mechanical authorization check (axis 3 mechanical)

## Source
- Requirement: `fr-rf-010` (modified — `fr-rf-010-ac5` is the new AC)
- Detail: `details/refiner.xml`

## Dependencies
- (within epic: none; epic-level depends on `epic-sdd-schemas`, `epic-cross-cutting`, `epic-brainstorming`)

## Acceptance Criteria

See `specs/spec-driven-refine/details/refiner.xml#fr-rf-010` for canonical ACs (existing ac1–ac4 preserved; new ac5 added).

Summary (delta from v1):
- [ ] At Phase 6, refiner invokes the mechanical authorization helper (from `epic-sdd-schemas` `sdd-validator-api`) over every `<trace>` element in the in-memory draft.
- [ ] Trace pointing to design line ranges → cited content MUST appear at those lines in the design doc. Mismatch is ERROR.
- [ ] Trace pointing to Q&A rows by `q_id` → cited content MUST appear in that row's `user_answer_verbatim` of the structured decision-log. Mismatch is ERROR.
- [ ] On axis-3 mechanical-check ERROR, refiner blocks per `fr-rf-001` axis 3 — `_pending-conflict.md` written via `fr-rf-015`, no spec.xml or details/ written.
- [ ] Existing AC1–AC4 (header validation, every-requirement-has-AC-with-trace, ERROR-no-files-written, atomic write) preserved unchanged from v1.
