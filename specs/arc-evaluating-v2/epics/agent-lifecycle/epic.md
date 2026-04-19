# Epic: Agent Rename, Scope Tightening, and New Blind Comparator

## Summary
Rename eval-comparator → eval-analyzer; strip its verdict authority (no SHIP/INVESTIGATE); introduce eval-blind-comparator for paired-preference rating. All three are prompt templates loaded via loadAgentDef, not subagent_type registrations.

## Source
Detail file: `specs/arc-evaluating-v2/details/agent-lifecycle.xml`

## Dependencies
- folder-structure

## Features
- **ag-001** — Rename eval-comparator to eval-analyzer (source: `fr-ag-001`)
- **ag-002** — Strip verdict authority from eval-analyzer (source: `fr-ag-002`)
- **ag-003** — Introduce eval-blind-comparator prompt template (source: `fr-ag-003`)
