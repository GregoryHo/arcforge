# Epic: output-and-interaction

## Context

Everything the user sees, and the persistence surface. Covers Phases 2–5 of the
skill body:

- Phase 2 markdown report (Summary + Overview + per-finding Detail blocks)
- Phase 3 triage UX (multi-select AskUserQuestion over HIGH findings, free-text
  pull-in for MED/LOW)
- Phase 4 resolution UX (per-finding AskUserQuestion with diff previews)
- Phase 5 Decisions table
- Optional `--save` persistence to the L4 path

Sequential-by-design: each phase consumes the previous phase's output state, so
feature dependencies here are a tight chain rather than the parallel fan in
other epics.

## Source

- Detail: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Requirements covered: `fr-oi-001`, `fr-oi-002`, `fr-oi-003`, `fr-oi-004`, `fr-oi-005`

## Features

| ID | Name | Depends on | Requirement |
|---|---|---|---|
| oi-001 | Phase 2 markdown report with mandatory table layout | — | fr-oi-001 |
| oi-002 | Triage UX — multi-select over HIGH findings | oi-001 | fr-oi-002 |
| oi-003 | Resolution UX — batched per-finding AskUserQuestion with preview diffs | oi-002 | fr-oi-003 |
| oi-004 | Decisions table output at skill end | oi-003 | fr-oi-004 |
| oi-005 | Optional report persistence via --save flag | oi-004 | fr-oi-005 |

## Epic Dependencies

- `audit-agents` (output formats findings produced by the fan-out agents; no
  output work can proceed until the agent contract and finding schema exist)
