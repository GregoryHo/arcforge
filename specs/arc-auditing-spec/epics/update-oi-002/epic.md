# Epic: Update fr-oi-002 — Phase 3 conditional firing (N_HIGH >= 2)

## Source

- Spec requirement: `fr-oi-002` (Triage UX — conditional multi-select over HIGH findings with free-text pull-in)
- Detail file: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Delta entry: `<modified ref="fr-oi-002" />` in spec.xml v2 delta (iteration `2026-04-24-iterate2`)

## Scope

Tighten Phase 3 so it fires only when the audit produced at least 2 HIGH-severity findings — matching AskUserQuestion's `options.minItems: 2` constraint. Below that threshold, take the degraded paths codified in the two new ACs:

- `fr-oi-002-ac5` (N_HIGH == 0): no Phase 3 call; no Phase 4; no Decisions table; print concluding recommendation line; exit cleanly.
- `fr-oi-002-ac6` (N_HIGH == 1): no Phase 3 multi-select call; rely on fr-oi-001-ac5's visual emphasis; proceed directly into Phase 4 with that single HIGH as the sole Stage-2 queue entry.

Also tighten the `Other` pull-in precondition on `fr-oi-002-ac3`: the free-text channel that injects MED/LOW IDs into Phase 4's queue exists ONLY when Phase 3 actually fires (N_HIGH >= 2). No alternative injection path is provided for the degraded branches.

## Dependencies

- `update-oi-001` — Phase 3's N_HIGH == 1 branch (ac6) relies on the visual emphasis primitive from fr-oi-001-ac5.

## Features

- `oi-002-threshold` — implement Phase 3 threshold branches

## Touched artifacts

- `skills/arc-auditing-spec/SKILL.md` (Phase 3 prose)
- `skills/arc-auditing-spec/references/report-templates.md` (concluding-recommendation-line template)
