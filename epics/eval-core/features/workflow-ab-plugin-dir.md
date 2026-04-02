# Feature: workflow-ab-plugin-dir

## Source
- Requirement: fr-ec-004
- Detail: environment-control.xml

## Dependencies
- trial-plugin-dir
- plugin-dir-settings

## Acceptance Criteria
- [ ] Workflow A/B baseline always isolated=true
- [ ] Workflow A/B treatment uses semi-isolated + plugin-dir when scenario has pluginDir
- [ ] Treatment without scenario pluginDir uses existing non-isolated behavior
