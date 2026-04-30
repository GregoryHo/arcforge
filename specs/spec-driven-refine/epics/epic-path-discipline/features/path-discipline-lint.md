# Feature: path-discipline-lint

## Source

- Requirement: fr-cc-pl-001 (`specs/spec-driven-refine/details/cross-cutting.xml`)
- Constraint: cc-005 (in `spec.xml` `<cross_cutting>`)
- Epic: `epic-path-discipline`

## Dependencies

None within epic. (No upstream features.)

## Acceptance Criteria

- [ ] `tests/scripts/skill-path-discipline.test.js` exists and is
      picked up by the test runner
- [ ] Test scans three globs: `skills/**/SKILL.md`,
      `templates/**/*.md`, `agents/**/*.md`
- [ ] Detects two violation patterns:
  - bare `scripts/lib/` references in prose not preceded by
    `${ARCFORGE_ROOT}/` on the same logical token
  - `node -e "require('./scripts/lib/...')"` cwd-relative
    require invocations
- [ ] Detection regex documented inline with rationale comments
- [ ] Each violation reports: file path, line number, offending
      line content (truncated to 120 chars if longer), and the
      corrective form (`${ARCFORGE_ROOT}/scripts/lib/...`)
- [ ] Test failure blocks CI (no bypass annotation, no skip marker,
      no allowlist)
- [ ] Lint does NOT scan: `scripts/lib/`, `tests/`, `hooks/`, or
      skill-local paths under `skills/<name>/scripts/` /
      `skills/<name>/references/` that use `${SKILL_ROOT}/` or
      cd-then-bare patterns
- [ ] Lint test added to `npm test` pipeline (runs in CI)
