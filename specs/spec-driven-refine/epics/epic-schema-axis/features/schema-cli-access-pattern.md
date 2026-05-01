# Feature: schema-cli-access-pattern

## Source

- Requirement: fr-sd-011 (modified) (`specs/spec-driven-refine/details/sdd-schemas.xml`)
- Epic: `epic-schema-axis`

## Dependencies

- `schema-renderers` (must complete first — CLI cannot expose four
  targets until the two new renderers exist)

## Acceptance Criteria

- [ ] `scripts/lib/print-schema.js` accepts four targets in
      target-dispatch: `design`, `spec`, `decision-log`,
      `pending-conflict`
- [ ] CLI `--help` output documents all four targets
- [ ] Unknown target exits non-zero with usage message
- [ ] `--markdown` and `--json` flags work for all four targets
- [ ] SDD-pipeline skill prose (arc-brainstorming, arc-refining,
      arc-planning, and any others that reference SDD schemas) is
      updated to use direct read at
      `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/<name>.md` as the
      primary form. Per cc-005, all such references MUST carry the
      `${ARCFORGE_ROOT}/` prefix.
- [ ] CLI form `node ${ARCFORGE_ROOT}/scripts/lib/print-schema.js
      <name>` may appear in skill prose where it fits (e.g., when a
      flag like `--json` is needed); it remains a valid alternative
- [ ] Skills do NOT embed structural code-block templates that
      duplicate schema content (the existing prohibition continues)
- [ ] Existing print-schema.js tests pass; new test coverage exists
      for the two new targets and the unknown-target error path
