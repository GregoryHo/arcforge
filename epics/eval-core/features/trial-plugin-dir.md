# Feature: trial-plugin-dir

## Source
- Requirement: fr-ec-002
- Detail: environment-control.xml

## Dependencies
- plugin-dir-settings
- scenario-plugin-dir

## Acceptance Criteria
- [ ] options.pluginDir adds --plugin-dir to claude CLI args
- [ ] pluginDir triggers buildPluginDirSettings() (not writeIsolationSettings)
- [ ] --strict-mcp-config NOT added when pluginDir is set
- [ ] Non-existent pluginDir path → infraError: true
- [ ] Without pluginDir, existing isolation behavior unchanged
