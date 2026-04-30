# Feature: schema-drift-gate

## Source

- Requirement: fr-sd-016 (`specs/spec-driven-refine/details/sdd-schemas.xml`)
- Epic: `epic-schema-axis`

## Dependencies

- `schema-renderers` (must complete first — drift gate depends on
  the renderer functions existing and producing output)

## Acceptance Criteria

- [ ] `tests/scripts/sdd-schemas-fresh.test.js` contains four
      per-schema test cases (design, spec, decision-log,
      pending-conflict)
- [ ] Each case reads the committed file, invokes the corresponding
      renderer with markdown flag, asserts byte-equal after
      trailing-whitespace normalization
- [ ] On test failure, diffHint output identifies the first differing
      line with both committed and generated content
- [ ] On test failure, remediation output points to the regeneration
      command for the specific schema
- [ ] Test passes after `schema-renderers` completes
- [ ] Test fails (red) if any of the four schema files is hand-edited
      to diverge from the renderer output
