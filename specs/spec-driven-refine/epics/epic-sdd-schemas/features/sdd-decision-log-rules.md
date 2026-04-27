# Feature: DECISION_LOG_RULES constant + schema doc

## Source
- Requirement: `fr-sd-013`
- Detail: `details/sdd-schemas.xml`

## Dependencies
- (none — foundational within the sprint)

## Acceptance Criteria

See `specs/spec-driven-refine/details/sdd-schemas.xml#fr-sd-013` for canonical ACs.

Summary:
- [ ] `scripts/lib/sdd-utils.js` exports a frozen `DECISION_LOG_RULES` object with: `canonical_path` (relative to brainstorming output dir), `required_fields_per_row` (q_id, question, user_answer_verbatim, deferral_signal), `q_id_uniqueness` (per-session unique), `deferral_signal_canonical_phrases` (≥ "use defaults", "covered.", "skip", "you decide").
- [ ] Schema specifies rows are addressable by `q_id` — lookup is deterministic, no LLM re-interpretation needed.
- [ ] Schema doc under `scripts/lib/sdd-schemas/` includes valid example (3 rows, mix of `deferral_signal=true|false`) + invalid examples (duplicate q_id, missing field).
