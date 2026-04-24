# Feature: oi-001-emphasis

## Source

- Requirement: `fr-oi-001` (Phase 2 markdown report with mandatory table layout)
- Detail file: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Affected AC (new in v2): `fr-oi-001-ac5`

## Dependencies

None.

## Acceptance Criteria

- [ ] `fr-oi-001-ac5` — Given the audit produces exactly one HIGH-severity finding, the Findings Overview row for that finding MUST render the Title column prefixed with `⚠️` and wrapped in markdown bold (e.g., `⚠️ **<title>**`).
- [ ] Existing `fr-oi-001-ac1` (Summary table), `ac2` (Overview structure), `ac3` (Detail blocks — Observed + Suggested Resolutions as tables, why-it-matters as prose), and `ac4` (MED/LOW/INFO appearance) regressions: none.
- [ ] N_HIGH == 0 and N_HIGH >= 2 cases MUST render the Overview row without the emphasis marker (no regression to baseline rendering).
- [ ] The emphasis marker is applied ONLY in the Findings Overview table, not in the per-finding Detail block header.

## Implementation notes

- Phase 2 rendering lives in `skills/arc-auditing-spec/SKILL.md` (step-by-step prose) and in `skills/arc-auditing-spec/references/report-templates.md` (concrete markdown templates).
- The emphasis trigger is `count(findings.filter(f => f.severity === 'HIGH')) === 1` — NOT "at least one HIGH"; a HIGH count of 2+ uses ordinary rendering because Phase 3 will fire and surface the HIGHs via triage.
