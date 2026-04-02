# Feature: scenario-plugin-dir

## Source
- Requirement: fr-se-001
- Detail: scenario-extension.xml

## Dependencies
None.

## Acceptance Criteria
- [ ] "## Plugin Dir" with "${PROJECT_ROOT}" resolves to projectRoot path
- [ ] "## Plugin Dir" with absolute path used as-is
- [ ] Missing field results in scenario.pluginDir = undefined
