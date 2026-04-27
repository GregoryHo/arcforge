# Feature: `_pending-conflict.md` write-on-block contract

## Source
- Requirement: `fr-rf-015`
- Detail: `details/refiner.xml`

## Dependencies
- (within epic: none; epic-level depends on `epic-sdd-schemas`, `epic-cross-cutting`, `epic-brainstorming`)

## Acceptance Criteria

See `specs/spec-driven-refine/details/refiner.xml#fr-rf-015` for canonical ACs.

Summary:
- [ ] On axis-1, axis-2, or axis-3 block (per `fr-rf-001`, including axis-3 mechanical from `fr-rf-010-ac5`), refiner writes `specs/<spec-id>/_pending-conflict.md` per `fr-cc-if-007`: which axis fired, conflict description (line ranges + q_ids), 1–3 candidate resolutions, user-action prompt to `/arc-brainstorming iterate <spec-id>`.
- [ ] Refiner MUST NOT write `_pending-conflict.md` for non-R3-axis blocks: DAG completion gate failure (`fr-rf-012`), design-doc validation failure (`fr-rf-009`), identity-header validation errors (`fr-rf-010-ac1` through `fr-rf-010-ac4`). These are pipeline-mechanical / programmer-error blocks; output is terminal + exit code only.
- [ ] Iron Law clause 3 narrowing (from `NEVER WRITE ON BLOCK` to `NEVER WRITE AUTHORITATIVE STATE ON BLOCK`) lands in `skills/arc-refining/SKILL.md` as part of this feature — current SKILL.md (post-Stage-1) still has strict v1 wording.
