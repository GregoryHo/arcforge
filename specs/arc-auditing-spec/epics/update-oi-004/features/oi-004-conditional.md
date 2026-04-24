# Feature: oi-004-conditional

## Source

- Requirement: `fr-oi-004` (Decisions table output at skill end — conditional on ceremony firing)
- Detail file: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Affected ACs: modified `ac1` (conditional firing precondition), new `ac4` (no-decisions-table path)

## Dependencies

- `oi-003-skip` (feature in epic `update-oi-003`) — the Decisions table's sentinel-row format is defined by fr-oi-003-ac6; Phase 5's rendering uses that format for auto-skipped rows.

## Acceptance Criteria

- [ ] `fr-oi-004-ac1` — Given Phase 3 or Phase 4 actually fired AND collected user answers, Phase 5 prints a markdown Decisions table with columns Finding ID / Chosen Resolution / User Note.
- [ ] `fr-oi-004-ac4` — Given both Phase 3 and Phase 4 were skipped (N_HIGH == 0 path per fr-oi-002-ac5), skill exits with no Decisions table printed.
- [ ] Existing `fr-oi-004-ac2` (User Note verbatim from Other) and `ac3` (no post-audit Edit/Write) unchanged.
- [ ] When rendered, the Decisions table includes rows for ALL findings that went through Phase 3 triage or Phase 4 resolution, including findings auto-skipped at Phase 4 (their row carries `Chosen Resolution = (no ceremony — see Detail)`).

## Implementation notes

- The "Phase 3 or Phase 4 actually fired" test should be a single in-memory boolean flag set true the moment either phase issues its first AskUserQuestion call (or, for fr-oi-002-ac6's direct-to-Phase-4 path, when Phase 4 enters its loop). Don't re-derive from scratch at Phase 5 entry — carry the flag.
- The no-table exit path should NOT print a stub "No decisions" line; just terminate cleanly after the Phase 2 concluding recommendation (which fr-oi-002-ac5 already prints).
