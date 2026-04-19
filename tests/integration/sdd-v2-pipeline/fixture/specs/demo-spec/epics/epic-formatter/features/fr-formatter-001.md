# Feature: fr-formatter-001

## Source
- Requirement: fr-formatter-001
- Detail: specs/demo-spec/details/core.xml

## Dependencies
- None

## Acceptance Criteria
- [ ] `src/formatters/number.js` exports `formatNumber(n)` function
- [ ] `formatNumber(42)` returns `"#42"`
- [ ] `formatNumber(null)` returns `"#null"`
- [ ] `formatNumber(3.14)` returns `"#3.14"`
- [ ] Unit test at `test/formatters/number.test.js`

## Technical Notes

- Must stringify via template literal: `` `#${n}` ``. Null-safety is handled
  by `String(null) === "null"` inside the template.
