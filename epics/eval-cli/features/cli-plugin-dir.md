# Feature: cli-plugin-dir

## Source
- Requirement: fr-cf-002
- Detail: cli-flags.xml

## Dependencies
- eval-core/trial-plugin-dir

## Acceptance Criteria
- [ ] "arc eval run name --plugin-dir /path" passes pluginDir to runTrial()
- [ ] "arc eval ab name --plugin-dir /path" passes pluginDir to treatment trials only
- [ ] CLI --plugin-dir overrides scenario's Plugin Dir field
