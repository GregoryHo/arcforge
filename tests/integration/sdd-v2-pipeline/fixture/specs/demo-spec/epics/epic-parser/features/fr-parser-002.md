# Feature: fr-parser-002

## Source
- Requirement: fr-parser-002
- Detail: specs/demo-spec/details/core.xml

## Dependencies
- None (independent of fr-parser-001)

## Acceptance Criteria
- [ ] `src/parsers/float.js` exports `parseFloat(input)` function
- [ ] `parseFloat("3.14")` returns the number 3.14
- [ ] `parseFloat("NaN")` returns null
- [ ] `parseFloat("not-a-number")` returns null
- [ ] Unit test at `test/parsers/float.test.js` covers decimal + null cases

## Technical Notes

- Must be **independent** of `src/parsers/int.js` — do not import, do not
  call `parseInteger`. Shadowing the global `parseFloat` is OK; this module's
  exported name is `parseFloat`.
- Implementation may use `Number.parseFloat(input)` wrapped with
  `Number.isFinite`.
