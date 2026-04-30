# Epic: cc-005 Plugin Path Discipline

## Source

- Spec: `specs/spec-driven-refine/spec.xml` (v3, design iteration 2026-04-30)
- Detail: `specs/spec-driven-refine/details/cross-cutting.xml`
- Cross-cutting constraint: `cc-005` (in spec.xml `<cross_cutting>`)
- Delta refs: `<added ref="fr-cc-pl-001" />`, `<added ref="fr-cc-pl-002" />`

## Description

arcforge ships as a Claude Code plugin. At runtime the LLM works
in the user's project (cwd is the user's project, not the plugin
install). The audit performed during v3 brainstorm surfaced
multiple SDD skills with cwd-relative path patterns to plugin
shared library content (under `scripts/lib/`) — `node -e
"require('./scripts/lib/...')"` (P2) and bare `scripts/lib/...`
prose paths (P3). These work in contributor dev mode (cwd =
arcforge repo) but break when the LLM runs them in a user's
project cwd.

cc-005 (Cross-Component Plugin Path Discipline, defined in
spec.xml) requires that LLM-facing prose in `skills/`,
`templates/`, and `agents/` referencing plugin shared library
content prefix the path with `${ARCFORGE_ROOT}/`. This epic
implements the mechanical enforcement (CI lint) and the
remediation of audited existing violations.

The lint scope is deliberately narrow: only `scripts/lib/`
references in the three LLM-facing directories. Out of scope:
Node.js module-system requires inside `scripts/lib/` itself
(file-relative resolution is cross-project safe), test runner
paths inside `tests/`, hook execution paths via
`${CLAUDE_PLUGIN_ROOT}` (plugin contract handles them), and
skill-local relative patterns under `${SKILL_ROOT}/`. Static
analysis cannot reliably distinguish legitimate from broken
cd-then-bare patterns in shell, so cc-005 explicitly leaves
those to author's judgment.

Pre-work for this epic: `arc-writing-skills` already carries a
Path Resolution section (committed at `2a189db` prior to v3
sprint start) documenting the discipline for skill authors. v3
implementer agents working on remediation will see the
discipline as they consult their own meta-skill.

## Features

- `path-discipline-lint` (fr-cc-pl-001): Add
  `tests/scripts/skill-path-discipline.test.js`. Scans
  `skills/**/SKILL.md`, `templates/**/*.md`, `agents/**/*.md`
  for bare `scripts/lib/` references and cwd-relative
  requires. No bypass mechanism.
- `path-discipline-remediation` (fr-cc-pl-002): Mechanical
  prefix additions to fix audited existing P2/P3 violations
  across the SDD skills. Depends on `path-discipline-lint`
  (lint must exist before its passing state can be verified).

## Dependencies

- `epic-schema-axis` — schema axis updates SKILL.md prose
  (e.g., new direct-read references at
  `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/<name>.md`).
  Path-discipline epic runs after, so the lint scans the
  updated set and remediation cleans up any pre-existing
  violations not touched by the schema axis updates.

## Acceptance

- Both features completed (status `completed` in `dag.yaml`)
- `tests/scripts/skill-path-discipline.test.js` passes after
  remediation
- No bare `scripts/lib/` references remain in
  `skills/**/SKILL.md`, `templates/**/*.md`, or `agents/**/*.md`
- `npm test` passes overall
- Future skill edits that introduce a bare `scripts/lib/`
  reference fail CI before merge
