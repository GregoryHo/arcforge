# Feature: fr-parser-001

## Source
- Requirement: fr-parser-001
- Detail: specs/demo-spec/details/core.xml

## Dependencies
- None

## Acceptance Criteria
- [ ] `src/parsers/int.js` exports `parseInteger(input)` function
- [ ] `parseInteger("42")` returns the number 42
- [ ] `parseInteger("abc")` returns null (no throw)
- [ ] `parseInteger("")` returns null
- [ ] Unit test at `test/parsers/int.test.js` covers happy path + null cases

## Technical Notes

- Must be **independent** of `src/parsers/float.js` — do not share code, do not
  import across parsers. This independence is what `arc-dispatching-parallel`
  is expected to exploit.
- Implementation may use `Number.parseInt(input, 10)` wrapped with a
  `Number.isNaN` check.
