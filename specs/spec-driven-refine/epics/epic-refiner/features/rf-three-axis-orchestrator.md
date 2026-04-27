# Feature: Three-axis R3 contradiction check (orchestrator integrating axes 1/2/3)

## Source
- Requirement: `fr-rf-001` (modified)
- Detail: `details/refiner.xml`

## Dependencies
- `rf-no-invention-discipline` (axis-3 LLM relies on no-invention)
- `rf-self-contradiction-axis3-llm` (Phase 5.5 axis-3 LLM lives here)
- `rf-pending-conflict-writer` (block path uses the writer)
- `rf-mechanical-auth-check` (Phase 6 axis-3 mechanical lives here)

## Acceptance Criteria

See `specs/spec-driven-refine/details/refiner.xml#fr-rf-001` for canonical ACs.

Summary (this feature is the integration point — wire all four predecessors into a coherent flow):
- [ ] Axis 1 firing path: design.md internal contradiction (or design ↔ existing v1 spec) → BLOCK terminal output with axis label + line ranges + pointer to `_pending-conflict.md` + non-zero exit.
- [ ] Axis 2 firing path: design phrase ¬ Q&A `user_answer_verbatim` → BLOCK; terminal output cites design line range + Q&A `q_id`; handoff carries ≥1 candidate per side ("keep design wording", "accept Q&A answer", "make axis configurable").
- [ ] Axis 3 firing path (via `rf-self-contradiction-axis3-llm` LLM at Phase 5.5 or `rf-mechanical-auth-check` mechanical at Phase 6) → BLOCK with handoff per `fr-rf-015`.
- [ ] On any axis block, refiner writes only `_pending-conflict.md` (via `rf-pending-conflict-writer`) — no spec.xml, no details/, no narrative report.
- [ ] Terminal output lists each detected issue with: axis fired, one-line description, design line ranges, Q&A `q_id`s — and points to `_pending-conflict.md` for candidate resolutions / user-action prompt.
- [ ] Last to implement in the epic — integration tests need predecessors to be real.
