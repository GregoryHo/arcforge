# Feature: dashboard-scenario-fields

## Source
- Requirement: fr-du-003
- Detail: dashboard-updates.xml

## Dependencies
- eval-core/scenario-plugin-dir
- eval-core/scenario-max-turns

## Acceptance Criteria
- [ ] Scenario detail shows pluginDir when present
- [ ] Scenario detail shows maxTurns when present
- [ ] Scenarios without these fields show no extra info (no "undefined")
