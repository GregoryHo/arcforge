# Feature: oi-003-skip

## Source

- Requirement: `fr-oi-003` (Resolution UX — conditional batched per-finding AskUserQuestion with preview diffs)
- Detail file: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Affected ACs: modified `ac1` (≥2 resolutions precondition), new `ac6` (auto-skip + sentinel)

## Dependencies

- `oi-002-threshold` (feature in epic `update-oi-002`) — Phase 4 entry is shaped by Phase 3's branching; the skip rule plugs into the Phase 4 loop whose entry conditions are set by fr-oi-002's branches.

## Acceptance Criteria

- [ ] `fr-oi-003-ac1` — Given M Stage-2 entries each with ≥2 resolutions, Phase 4 issues at most 4 questions per AskUserQuestion call until all M have been asked exactly once.
- [ ] `fr-oi-003-ac6` — Given a Stage-2 entry has <2 suggested resolutions, Phase 4 skips that finding's question; the Decisions table (when rendered per fr-oi-004) records its row with `Chosen Resolution = (no ceremony — see Detail)` and User Note empty; no error is raised.
- [ ] Existing `fr-oi-003-ac2` (question structure), `ac3` (preview field), `ac4` (Recommended prefix), `ac5` (Other free-text accepted) unchanged.
- [ ] Skipped findings still appear in the Phase 2 Detail block with their full Resolutions table — the skip only suppresses the interactive question, not the data surface.

## Implementation notes

- Sentinel string is `(no ceremony — see Detail)` — exact punctuation matters for grep-based audit tools and for Decisions-table readability.
- A finding with zero resolutions is a reviewer-quality issue (should not happen if the axis agents are well-behaved) but must also be handled by this skip path — treat 0 and 1 resolution identically.
