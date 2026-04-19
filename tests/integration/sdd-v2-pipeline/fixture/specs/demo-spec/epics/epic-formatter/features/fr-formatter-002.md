# Feature: fr-formatter-002

## Source
- Requirement: fr-formatter-002
- Detail: specs/demo-spec/details/core.xml

## Dependencies
- fr-formatter-001 (MUST import `formatNumber` rather than reimplementing the
  "#" prefix logic)

## Acceptance Criteria
- [ ] `src/formatters/list.js` exports `formatList(arr)` function
- [ ] `formatList([1, 2, 3])` returns `"#1, #2, #3"`
- [ ] `formatList([])` returns `""`
- [ ] Implementation imports `formatNumber` from `./number.js` (verifiable by
      grepping the file for `require.*number` or `import.*number`)
- [ ] Unit test at `test/formatters/list.test.js`

## Technical Notes

- Use `arr.map(formatNumber).join(", ")` — do not reimplement the prefix.
