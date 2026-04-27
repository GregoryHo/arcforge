# Feature: Phase 0 pending-conflict detection + iterate-branch auto-entry

## Source
- Requirement: `fr-bs-008`
- Detail: `details/brainstorming.xml`

## Dependencies
- (within epic: none; epic-level depends on `epic-sdd-schemas`, `epic-cross-cutting`)

## Acceptance Criteria

See `specs/spec-driven-refine/details/brainstorming.xml#fr-bs-008` for canonical ACs.

Summary:
- [ ] Phase 0 scan-and-route checks for `specs/<spec-id>/_pending-conflict.md`. Presence triggers automatic iterate-branch entry (does NOT ask "new spec or iteration?"). Conflict body becomes Change Intent seed via `parseConflictMarker`.
- [ ] Brainstorming presents candidate resolutions verbatim from the file and prompts user to pick `(a)/(b)/(c)/other`. User does NOT retell the conflict.
- [ ] On successful new-design write to `docs/plans/<spec-id>/<NEW-DATE>/design.md`, brainstorming MUST delete `specs/<spec-id>/_pending-conflict.md`. If the new-design write fails, the marker MUST persist (cleanup gated on success).
- [ ] Brainstorming MUST NOT modify or rewrite `_pending-conflict.md` content — read-only from brainstorming's perspective. Conflict reframing happens in the new design.md, not by editing the handoff.
