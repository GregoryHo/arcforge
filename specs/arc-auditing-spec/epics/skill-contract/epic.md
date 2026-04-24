# Epic: skill-contract

## Context

Public contract of the `/arc-auditing-spec` skill. Covers the outer shell:
how the skill is invoked, how its failure paths behave, which parts of the
filesystem it is forbidden to touch, and how implementation is delegated to
`arc-writing-skills`.

This epic is foundational — the other two epics (audit-agents,
output-and-interaction) consume the contract established here (skill-body
existence, agent tool grants, hook-free surface).

## Source

- Detail: `specs/arc-auditing-spec/details/skill-contract.xml`
- Requirements covered: `fr-sc-001`, `fr-sc-002`, `fr-sc-003`

## Features

| ID | Name | Depends on | Requirement |
|---|---|---|---|
| sc-001 | User-invoked skill with spec-id argument | — | fr-sc-001 |
| sc-002 | Hard read-only boundaries enforced via tool grants | — | fr-sc-002 |
| sc-003 | Implementation produced via arc-writing-skills | — | fr-sc-003 |

## Epic Dependencies

- None (foundational epic)
