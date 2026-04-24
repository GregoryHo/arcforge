# Feature: sc-003-eval-coverage

## Source

- Requirement: `fr-sc-003` (Implementation produced via arc-writing-skills)
- Detail file: `specs/arc-auditing-spec/details/skill-contract.xml`
- Affected AC (new in v2): `fr-sc-003-ac3`

## Dependencies

- `oi-001-emphasis`, `oi-002-threshold`, `oi-003-skip`, `oi-004-conditional` — the scenarios exercise behavior implemented by all four fr-oi-* epics.

## Acceptance Criteria

- [ ] `fr-sc-003-ac3 (a)` — an eval scenario exists for the N_HIGH == 0 exit path; it verifies no Phase 3 AskUserQuestion call is made, no Phase 4 loop runs, no Decisions table is printed, and the skill exits cleanly after the Phase 2 concluding recommendation line.
- [ ] `fr-sc-003-ac3 (b)` — an eval scenario exists for the N_HIGH == 1 case; it verifies the Phase 2 Overview row for the lone HIGH renders with `⚠️ **<title>**`, no Phase 3 multi-select call fires, and (when the HIGH has ≥2 resolutions) Phase 4 enters directly for that single finding.
- [ ] `fr-sc-003-ac3 (c)` — an eval scenario exists for the <2-resolutions Phase 4 skip case; it verifies no AskUserQuestion question is issued for the single-resolution finding, and the Decisions-table row for it shows `Chosen Resolution = (no ceremony — see Detail)`.
- [ ] Existing `fr-sc-003-ac1` (arc-writing-skills RED/GREEN/REFACTOR cycle) and `ac2` (per-axis scenario coverage) remain satisfied — the three new scenarios are ADDITIVE, not replacements.
- [ ] The new scenarios follow the same directory layout and YAML/MD conventions as the existing scenarios under `skills/arc-auditing-spec/evals/scenarios/` — no harness change needed.

## Implementation notes

- Scenario naming suggestion: `threshold-n-high-zero/`, `threshold-n-high-one/`, `threshold-low-resolutions/` — prefixed so they cluster in file-listings and are distinguishable from the existing per-axis scenarios.
- Each scenario's expected-output assertion should be tight enough to catch regressions in ANY of the three dimensions (correct trigger condition, correct rendered output, correct suppression of downstream phases).
- This epic does NOT modify `skills/arc-auditing-spec/SKILL.md` or any agent file. If a scenario fails because the implementation under test is wrong, that's a defect in the upstream epic (one of update-oi-001 through update-oi-004) — fix goes there, not here.
