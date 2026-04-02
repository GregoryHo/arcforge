# Feature: cli-max-turns

## Source
- Requirement: fr-cf-003
- Detail: cli-flags.xml

## Dependencies
- eval-core/trial-max-turns

## Acceptance Criteria
- [ ] "arc eval run name --max-turns 10" passes maxTurns to runTrial()
- [ ] CLI --max-turns overrides scenario's Max Turns field
