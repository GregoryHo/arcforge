# Feature: plugin-dir-settings

## Source
- Requirement: fr-ec-001
- Detail: environment-control.xml

## Dependencies
None.

## Acceptance Criteria
- [ ] buildPluginDirSettings() disables all installed plugins (enabledPlugins all false)
- [ ] Output has autoMemoryEnabled: false
- [ ] Output does NOT include claudeMdExcludes
- [ ] Returns valid JSON even if claude CLI unavailable
