# Epic: Update fr-oi-003 — Phase 4 per-finding skip rule (< 2 resolutions)

## Source

- Spec requirement: `fr-oi-003` (Resolution UX — conditional batched per-finding AskUserQuestion with preview diffs)
- Detail file: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Delta entry: `<modified ref="fr-oi-003" />` in spec.xml v2 delta (iteration `2026-04-24-iterate2`)

## Scope

Implement the per-finding Phase 4 skip rule (new `fr-oi-003-ac6`): when a Stage-2 queue entry has fewer than 2 suggested resolutions, the skill MUST NOT issue an AskUserQuestion question for it (below `options.minItems: 2`), MUST record its Decisions-table row with Chosen Resolution set to the sentinel `(no ceremony — see Detail)` and User Note empty, AND MUST NOT treat the skip as an error.

Also tighten `fr-oi-003-ac1` to scope "N selected findings" to those with at least 2 resolutions.

## Dependencies

- `update-oi-002` — Phase 4's entry path is set up by Phase 3's conditional firing; implementing Phase 4's skip rule cleanly depends on Phase 3's branch logic already being in place.

## Features

- `oi-003-skip` — implement Phase 4 auto-skip with sentinel

## Touched artifacts

- `skills/arc-auditing-spec/SKILL.md` (Phase 4 prose)
- `skills/arc-auditing-spec/references/report-templates.md` (Decisions table sentinel template)
