# Epic: Refiner — R3 Enforcement + Conflict Handoff

**Spec:** `spec-driven-refine` v2 (2026-04-27)
**Source detail:** `specs/spec-driven-refine/details/refiner.xml`
**Depends on:** `epic-sdd-schemas`, `epic-cross-cutting`, `epic-brainstorming`

## Description

The refiner-side counterparts to brainstorming's handoff and decision-log: Phase 5 no-invention discipline, Phase 5.5 self-contradiction sub-pass plus axis-3 LLM coverage check, Phase 6 mechanical authorization check, the `_pending-conflict.md` writer on R3 axis-1/2/3 block, and the `fr-rf-001` orchestrator that integrates all of these into the modified three-axis Phase 4 + 5.5 + 6 contradiction-check chain. This is the largest epic in the sprint — five features, with `fr-rf-001` as the integration point at the end.

Note: Stage 1 (committed in `03c9798`) already shipped the prompt-only portion of this epic — `NO INVENTION WITHOUT AUTHORIZATION` Iron Law clause, three-axis Phase 4 framing, candidate-resolution discipline. Stage 2 (this epic) adds the *mechanical infrastructure* — `_pending-conflict.md` write, decision-log consumption, mechanical authorization helper invocation. Implementation will discover via TDD which pieces are already partially present in `SKILL.md` versus needing fresh code.

## Features

- [ ] `rf-no-invention-discipline` — Phase 5 no-invention (fr-rf-013)
- [ ] `rf-self-contradiction-axis3-llm` — Phase 5.5 self-contradiction + axis 3 LLM (fr-rf-014) [depends on rf-no-invention-discipline]
- [ ] `rf-pending-conflict-writer` — `_pending-conflict.md` writer (fr-rf-015)
- [ ] `rf-mechanical-auth-check` — Phase 6 mechanical authorization (fr-rf-010, modified)
- [ ] `rf-three-axis-orchestrator` — `fr-rf-001` modified, integrates all four predecessors

## Implementation Notes

- `rf-three-axis-orchestrator` (the `fr-rf-001` modification) is the tail of the dependency chain — it integrates `fr-rf-013/014/015` and `fr-rf-010-ac5` into a coherent Phase 4 / 5 / 5.5 / 6 flow. Implementing it before its predecessors will fail because integration tests need the predecessors to be real.
- The Iron Law text in `SKILL.md` needs the clause-3 narrowing (from `NEVER WRITE ON BLOCK` to `NEVER WRITE AUTHORITATIVE STATE ON BLOCK`) — this lands as part of `rf-pending-conflict-writer`. The current `SKILL.md` (post-Stage-1) still has the strict v1 wording; the Stage-2 prompt update is part of this feature.
- Phase 5.5 self-contradiction (`fr-rf-014-ac1/ac2`) and axis-3 LLM coverage (`fr-rf-014-ac3`) share a phase but have different downstream behaviors — self-contradiction findings BLOCK terminal-only (per design literal scope of B.2); axis-3 findings BLOCK with `_pending-conflict.md` handoff (axis 3 is enumerated in B.2). Tests must distinguish.
- `fr-rf-015-ac2` (don't write `_pending-conflict.md` for non-R3-axis blocks) is load-bearing — without it, brainstorming Phase 0 would auto-enter iterate branch on DAG-gate failures or schema-validation errors, which is wrong.
- Eval scenarios: the three-axis check (axes 1, 2, 3) and the no-invention discipline are all discriminative behaviors. The dog-food test that landed v2's spec already validated the prompt-only portion; Stage-2 mechanical pieces need their own evals.

## Done When

All five features `"completed"`; eval scenarios for axis-1, axis-2, axis-3 (LLM and mechanical), no-invention discipline, and self-contradiction all pass; the dog-food test (run patched refiner against a synthetic conflict fixture) blocks correctly with `_pending-conflict.md` written and brainstorming Phase 0 picks it up.
