# Feature: max-turns-priority

## Source
- Requirement: fr-se-003
- Detail: scenario-extension.xml

## Dependencies
- scenario-max-turns
- scenario-plugin-dir

## Acceptance Criteria
- [ ] CLI --max-turns overrides scenario ## Max Turns
- [ ] Scenario ## Max Turns overrides auto-detect and default
- [ ] When pluginDir set and no explicit maxTurns, default is 10
- [ ] When no pluginDir and no explicit maxTurns, no --max-turns flag passed
