# Feature: Structured decision-log format contract

## Source
- Requirement: `fr-cc-if-008`
- Detail: `details/cross-cutting.xml`

## Dependencies
- (within epic: none; epic-level depends on `epic-sdd-schemas`)

## Acceptance Criteria

See `specs/spec-driven-refine/details/cross-cutting.xml#fr-cc-if-008` for canonical ACs.

Summary:
- [ ] Contract enumerates 4 required fields per row: `q_id`, `question`, `user_answer_verbatim`, `deferral_signal` (boolean).
- [ ] Machine-parseable; producer (brainstorming) and consumer (refiner) MUST agree on a single wire format — drift between them is ERROR. Wire format is implementation choice; spec captures contract not format.
- [ ] Rows MUST be addressable by `q_id` so refiner's Phase 6 mechanical authorization can iterate deterministically.
- [ ] `deferral_signal=true` when `user_answer_verbatim` matches canonical deferral phrases — refiner MUST NOT treat true-deferred axes as authorization for concrete MUSTs (per `fr-rf-013`).
