# Epic: Update fr-oi-004 — Decisions table conditional rendering

## Source

- Spec requirement: `fr-oi-004` (Decisions table output at skill end — conditional on ceremony firing)
- Detail file: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Delta entry: `<modified ref="fr-oi-004" />` in spec.xml v2 delta (iteration `2026-04-24-iterate2`)

## Scope

Make the Phase 5 Decisions table conditional on whether Phase 3 or Phase 4 actually fired. When both were skipped (the N_HIGH == 0 path codified in `fr-oi-002-ac5`), no Decisions table is printed; the skill exits after the Phase 2 report plus the concluding recommendation line.

When the Decisions table IS rendered, it includes all discussed findings AND any auto-skipped single-resolution findings whose rows carry the `(no ceremony — see Detail)` sentinel from `fr-oi-003-ac6`.

## Dependencies

- `update-oi-003` — the Decisions-table row format for skipped findings references fr-oi-003's sentinel; implementing Phase 5 conditionally on top of the Phase 4 skip rule is cleaner than parallel work.

## Features

- `oi-004-conditional` — implement Decisions table suppression when both Phase 3 and Phase 4 skipped

## Touched artifacts

- `skills/arc-auditing-spec/SKILL.md` (Phase 5 prose)
- `skills/arc-auditing-spec/references/report-templates.md` (Decisions table template — must document the sentinel row format and the suppression condition)
