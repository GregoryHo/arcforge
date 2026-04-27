# Feature: Structured decision-log output (Phase 2 producer)

## Source
- Requirement: `fr-bs-009`
- Detail: `details/brainstorming.xml`

## Dependencies
- (within epic: none; epic-level depends on `epic-sdd-schemas`, `epic-cross-cutting`)

## Acceptance Criteria

See `specs/spec-driven-refine/details/brainstorming.xml#fr-bs-009` for canonical ACs.

Summary:
- [ ] Phase 2 emits decision-log conforming to `fr-cc-if-008`: each row has `q_id` (stable, session-unique), `question` (verbatim), `user_answer_verbatim` (verbatim), `deferral_signal` (boolean).
- [ ] Output is machine-parseable per `fr-cc-if-008`. Wire format chosen at implementation.
- [ ] `q_id` values stable across the brainstorming session — same question keeps the same `q_id` across revisions; this is what enables refiner's traces to cite Q&A by `q_id` and remain valid.
- [ ] Deferral-signal detection canonical phrases ("use defaults", "covered.", "skip", "you decide") set `deferral_signal=true`; canonical list lives in `DECISION_LOG_RULES` (from `epic-sdd-schemas`), not hand-coded here.
