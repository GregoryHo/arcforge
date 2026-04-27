# Epic: Brainstorming — Phase 0 Detection + Decision-Log Output

**Spec:** `spec-driven-refine` v2 (2026-04-27)
**Source detail:** `specs/spec-driven-refine/details/brainstorming.xml`
**Depends on:** `epic-sdd-schemas`, `epic-cross-cutting`

## Description

Extend `arc-brainstorming` with two capabilities. (1) Phase 0 scan-and-route auto-enters the iterate branch when `_pending-conflict.md` is present, seeds Change Intent from the conflict body, and deletes the marker on successful new-design write — the user does not retell the conflict. (2) Phase 2 Q&A elicitation emits the decision-log in the structured format (`q_id`, `question`, `user_answer_verbatim`, `deferral_signal`) so refiner can mechanically iterate over rows for axis-2 contradiction check and Phase 6 authorization.

## Features

- [ ] `bs-decision-log-producer` — Phase 2 structured decision-log output (fr-bs-009)
- [ ] `bs-pending-conflict-detection` — Phase 0 detection + iterate-branch auto-entry (fr-bs-008)

## Implementation Notes

- Both features modify `skills/arc-brainstorming/SKILL.md` (instructions for the LLM) and may add helper invocations to `scripts/lib/sdd-utils.js` from `epic-sdd-schemas` (e.g., `parseConflictMarker` for Phase 0, the decision-log writer for Phase 2).
- Deletion of `_pending-conflict.md` is gated on successful design.md write — if the new-design write fails, the marker MUST persist for retry. Test the failure path explicitly.
- Deferral-signal canonical phrases ("use defaults", "covered.", "skip", "you decide") are codified in `DECISION_LOG_RULES` from `epic-sdd-schemas`. Brainstorming reads them from there, not hand-codes.
- Eval scenarios: the iterate-branch auto-entry is a discriminative behavior (per the v1 `nfr-003-ac3` taxonomy — block-vs-proceed decision points are A/B-testable). Worth a focused eval before merging.

## Done When

Both features `"completed"`; eval scenario for Phase 0 conflict detection passes; structured decision-log produced by Phase 2 parses cleanly through `validateDecisionLog`.
