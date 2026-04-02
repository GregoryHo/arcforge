# Feature: trial-max-turns

## Source
- Requirement: fr-ec-003
- Detail: environment-control.xml

## Dependencies
- max-turns-priority

## Acceptance Criteria
- [ ] options.maxTurns adds --max-turns N to claude CLI args
- [ ] When maxTurns not set and pluginDir set, default is 10
- [ ] When neither set, no --max-turns flag passed
