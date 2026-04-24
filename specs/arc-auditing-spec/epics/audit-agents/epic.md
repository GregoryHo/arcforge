# Epic: audit-agents

## Context

The three fan-out sub-agents that perform the actual audit work. Each runs in
fresh context with read-only tool grants. This epic delivers:

- The three agent definition files under `agents/` (cross-artifact-alignment,
  internal-consistency, state-transition-integrity)
- The fan-out wiring inside the skill body (Phase 1)
- The shared finding schema they emit
- Axis-scope discipline and graceful-degradation behavior

## Source

- Detail: `specs/arc-auditing-spec/details/audit-agents.xml`
- Requirements covered: `fr-aa-001`, `fr-aa-002`, `fr-aa-003`, `fr-aa-004`

## Features

| ID | Name | Depends on | Requirement |
|---|---|---|---|
| aa-001 | Parallel fan-out to three axis-aligned sub-agents | — | fr-aa-001 |
| aa-002 | Structured finding schema | aa-001 | fr-aa-002 |
| aa-003 | Axis-scope separation among the three agents | aa-001 | fr-aa-003 |
| aa-004 | Graceful degradation on missing or failed inputs | aa-001, aa-002 | fr-aa-004 |

## Epic Dependencies

- `skill-contract` (the fan-out is invoked from the skill body, whose invocation
  and read-only contract are established by the previous epic)
