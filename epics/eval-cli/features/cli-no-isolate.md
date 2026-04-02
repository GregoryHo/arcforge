# Feature: cli-no-isolate

## Source
- Requirement: fr-cf-001
- Detail: cli-flags.xml

## Dependencies
- eval-core/trial-plugin-dir (isolated flag handling)

## Acceptance Criteria
- [ ] "arc eval run name --no-isolate" runs with isolated=false
- [ ] Without --no-isolate, eval run defaults to isolated=true
