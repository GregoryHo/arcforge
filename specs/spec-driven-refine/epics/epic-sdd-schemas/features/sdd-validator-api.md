# Feature: parseConflictMarker / parseDecisionLog / validateDecisionLog / mechanicalAuthorizationCheck

## Source
- Requirement: `fr-sd-014`
- Detail: `details/sdd-schemas.xml`

## Dependencies
- `sdd-pending-conflict-rules` (consumes `PENDING_CONFLICT_RULES`)
- `sdd-decision-log-rules` (consumes `DECISION_LOG_RULES`)

## Acceptance Criteria

See `specs/spec-driven-refine/details/sdd-schemas.xml#fr-sd-014` for canonical ACs.

Summary:
- [ ] `parseConflictMarker(filePath)` returns `{axis_fired, conflict_description, candidate_resolutions, user_action_prompt}` or `null`. Validates against `PENDING_CONFLICT_RULES` and surfaces schema violations as parse errors.
- [ ] `parseDecisionLog(filePath)` returns `Array<{q_id, question, user_answer_verbatim, deferral_signal}>`.
- [ ] `validateDecisionLog(parsed)` returns `{valid, issues}` shape (matches `validateDesignDoc`/`validateSpecHeader` precedent). Enforces `DECISION_LOG_RULES`.
- [ ] Phase 6 mechanical authorization helper: given in-memory spec XML + design.md path + decision-log path (when present), iterates over every `<trace>`, verifies cited content appears at cited source. Returns `{valid, unauthorized_traces}`.
- [ ] Validators reference rule constants directly — no duplicated literals (per `fr-sd-010-ac3`).
