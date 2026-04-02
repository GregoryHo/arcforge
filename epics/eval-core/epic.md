# Epic: eval-core

## Goal

Add transcript action parsing, scenario field extensions, and environment control to the eval harness. This is the foundation that all other epics depend on.

## File

`scripts/lib/eval.js`

## Features

1. **action-parser** — parseActionsFromTranscript() + actions in TrialResult
2. **action-result-storage** — Persist actions in JSONL results
3. **scenario-plugin-dir** — Parse ## Plugin Dir field
4. **scenario-max-turns** — Parse ## Max Turns field
5. **max-turns-priority** — CLI > scenario > auto-detect > default resolution
6. **plugin-dir-settings** — buildPluginDirSettings() for semi-isolation
7. **trial-plugin-dir** — runTrial() --plugin-dir support
8. **trial-max-turns** — runTrial() --max-turns support
9. **workflow-ab-plugin-dir** — Workflow A/B treatment uses plugin-dir

## Dependencies

None (foundation epic).

## Source

- specs/details/action-parser.xml
- specs/details/scenario-extension.xml
- specs/details/environment-control.xml
