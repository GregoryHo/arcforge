# Feature: oi-002-threshold

## Source

- Requirement: `fr-oi-002` (Triage UX — conditional multi-select over HIGH findings with free-text pull-in)
- Detail file: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Affected ACs: modified `ac1` (N_HIGH >= 2 precondition), modified `ac3` (Phase-3-firing precondition on Other pull-in), new `ac5` (zero-HIGH exit), new `ac6` (one-HIGH direct-to-Phase-4)

## Dependencies

- `oi-001-emphasis` (feature in epic `update-oi-001`) — ac6 requires fr-oi-001-ac5's Overview emphasis to already be implemented.

## Acceptance Criteria

- [ ] `fr-oi-002-ac1` — Phase 3's first AskUserQuestion call fires only when N_HIGH >= 2; when it does, `multiSelect: true`, `header: "Triage"`, up to 4 HIGH options in stable order.
- [ ] `fr-oi-002-ac3` — `Other` pull-in of sub-HIGH finding IDs works ONLY during a firing Phase 3 (N_HIGH >= 2); not applicable in degraded branches.
- [ ] `fr-oi-002-ac5` — N_HIGH == 0: skill prints a concluding recommendation line after Phase 2, skips Phase 3 / Phase 4 / Phase 5, exits with success status.
- [ ] `fr-oi-002-ac6` — N_HIGH == 1: skill skips Phase 3 multi-select call; Phase 2 Overview row for that HIGH carries fr-oi-001-ac5 emphasis; skill proceeds directly into Phase 4 with that single HIGH as sole Stage-2 queue entry.
- [ ] Existing `fr-oi-002-ac2` (batched Phase 3 calls when N_HIGH > 4) and `ac4` (MED/LOW/INFO never in triage options) unchanged.

## Implementation notes

- The concluding recommendation line (ac5 path) should reference the Phase 2 Detail blocks explicitly so the user knows where to look for any follow-up ("No HIGH findings to triage. See the Detail blocks above for MED/LOW/INFO findings. Skill exiting." or similar).
- For ac6, Phase 4 entry bypasses the Stage-2 queue's normal build-from-triage path — the queue contains exactly one entry: the one HIGH finding. fr-oi-003's skip rule (ac6) still governs whether that single Phase 4 question actually fires.
