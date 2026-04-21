# Epic: Folder Consolidation

## Summary
Move eval agents into skills/arc-evaluating/agents/ via the existing prompt-template pattern; relocate the dashboard into the skill folder; preserve scripts/lib/eval*.js as the canonical engine.

## Source
Detail file: `specs/arc-evaluating-v2/details/folder-structure.xml`

## Dependencies
_none (can start immediately)_

## Features
- **fs-001** — Co-locate eval agent prompt templates inside skill folder (source: `fr-fs-001`)
- **fs-002** — Relocate dashboard code into skill folder (source: `fr-fs-002`)
- **fs-003** — Preserve canonical engine location (source: `fr-fs-003`)
