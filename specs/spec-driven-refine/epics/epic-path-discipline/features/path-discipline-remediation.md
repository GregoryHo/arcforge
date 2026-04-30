# Feature: path-discipline-remediation

## Source

- Requirement: fr-cc-pl-002 (`specs/spec-driven-refine/details/cross-cutting.xml`)
- Constraint: cc-005 (in `spec.xml` `<cross_cutting>`)
- Epic: `epic-path-discipline`

## Dependencies

- `path-discipline-lint` (must complete first — the lint identifies
  the authoritative current set of violations, and the lint passing
  is the verification that remediation is complete)

## Acceptance Criteria

- [ ] All existing bare `scripts/lib/` references in
      `skills/**/SKILL.md`, `templates/**/*.md`, and
      `agents/**/*.md` are prefixed with `${ARCFORGE_ROOT}/`
- [ ] `tests/scripts/skill-path-discipline.test.js` (from
      `path-discipline-lint`) passes cleanly
- [ ] Audit set includes at minimum: `arc-brainstorming`,
      `arc-refining`, `arc-planning` (the lint surfaces the
      complete current set authoritatively)
- [ ] Fixes are mechanical prefix additions only — no Bash block
      reorganization, no CLI↔direct-read substitution, no skill
      instruction semantic changes
- [ ] Pre-existing `arc-writing-skills` Path Resolution section
      (committed at `2a189db`) is NOT subject to this audit
      (upstream pre-work). Any drift from cc-005 surfaced in that
      section is fixed under this requirement.
- [ ] No regressions in skill behavior — existing skill tests
      continue to pass after remediation
- [ ] `npm test` passes overall after remediation
