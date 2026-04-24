# Epic: Update fr-sc-003 — eval scenarios for Change-1 threshold branches

## Source

- Spec requirement: `fr-sc-003` (Implementation produced via arc-writing-skills)
- Detail file: `specs/arc-auditing-spec/details/skill-contract.xml`
- Delta entry: `<modified ref="fr-sc-003" />` in spec.xml v2 delta (iteration `2026-04-24-iterate2`)

## Scope

Satisfy the new `fr-sc-003-ac3` added in v2: the eval suite must contain at least one scenario for each of the three Change-1 threshold branches:

1. **N_HIGH == 0 exit** — skill exits after Phase 2 with a concluding recommendation line; no Phase 3 / 4 / 5 output.
2. **N_HIGH == 1 emphasis + direct-to-Phase-4** — Phase 2 Overview row for the lone HIGH shows `⚠️ **title**`; no Phase 3 multi-select call; (when the HIGH has ≥2 resolutions) Phase 4 is entered directly for that single finding.
3. **<2-resolutions skip** — a Stage-2 entry with fewer than 2 suggested resolutions is auto-skipped at Phase 4; its Decisions-table row shows `Chosen Resolution = (no ceremony — see Detail)`.

This epic runs LAST in the sprint because the scenarios must exercise behavior implemented in epics `update-oi-001` through `update-oi-004`. The scenarios go under `skills/arc-auditing-spec/evals/scenarios/` following the v1 scenario structure (no harness change).

## Dependencies

- `update-oi-001` — scenario (2) needs visual emphasis implemented
- `update-oi-002` — scenarios (1) and (2) need Phase 3 threshold branches
- `update-oi-003` — scenario (3) needs the Phase 4 skip rule + sentinel
- `update-oi-004` — scenario (1) implicitly needs Phase 5 conditional rendering

## Features

- `sc-003-eval-coverage` — add the three threshold-branch eval scenarios

## Touched artifacts

- `skills/arc-auditing-spec/evals/scenarios/` (three new scenario directories/files following the v1 structure)
- No SKILL.md change, no agent-file change — this epic is pure test coverage of the v2 behavior.
