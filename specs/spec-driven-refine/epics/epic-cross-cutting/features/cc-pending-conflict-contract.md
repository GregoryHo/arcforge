# Feature: `_pending-conflict.md` handoff contract

## Source
- Requirement: `fr-cc-if-007`
- Detail: `details/cross-cutting.xml`

## Dependencies
- (within epic: none; epic-level depends on `epic-sdd-schemas`)

## Acceptance Criteria

See `specs/spec-driven-refine/details/cross-cutting.xml#fr-cc-if-007` for canonical ACs.

Summary:
- [ ] Contract specifies file location `specs/<spec-id>/_pending-conflict.md`; underscore prefix marks ephemeral; MUST NOT live under `details/`.
- [ ] Contract enumerates required content fields: axis fired, conflict description (line ranges + q_ids), 1–3 candidate resolutions, user-action prompt.
- [ ] Lifecycle: refiner writes on R3 axis-1/2/3 block (per `fr-rf-015`); brainstorming reads as Change Intent seed (per `fr-bs-008`); brainstorming deletes on successful new-design write. Net zero authoritative state preserved across the cycle.
- [ ] Machine-parseable; producer/consumer agree on a wire format.
