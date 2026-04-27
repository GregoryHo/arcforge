# Feature: Phase 5 no-invention discipline (three legitimate moves)

## Source
- Requirement: `fr-rf-013`
- Detail: `details/refiner.xml`

## Dependencies
- (within epic: none; epic-level depends on `epic-sdd-schemas`, `epic-cross-cutting`, `epic-brainstorming`)

## Acceptance Criteria

See `specs/spec-driven-refine/details/refiner.xml#fr-rf-013` for canonical ACs.

Summary:
- [ ] Refiner MUST NOT author criteria from training-data inference. Three legitimate moves under deferral / qualitative phrasing: (a) preserve qualitative phrase as SHOULD/MAY, (b) leave axis unbound, (c) BLOCK on axis 3.
- [ ] `deferral_signal=true` Q&A rows do NOT authorize concrete MUSTs — corresponding axis MUST be treated as unbound.
- [ ] For every concrete MUST in the produced spec, refiner MUST be able to point to a non-deferral source (design phrase containing the value, or Q&A row with `deferral_signal=false` containing the value). No source = invention = MUST NOT author.
- [ ] Note: prompt-only portion of this feature already lives in post-Stage-1 `SKILL.md` (committed `03c9798`). TDD will discover whether additional code (e.g., a runtime check) is needed beyond prompt discipline.
