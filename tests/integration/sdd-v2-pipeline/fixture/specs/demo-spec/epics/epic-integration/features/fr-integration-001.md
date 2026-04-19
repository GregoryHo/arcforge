# Feature: fr-integration-001

## Source
- Requirement: fr-integration-001
- Detail: specs/demo-spec/details/core.xml

## Dependencies
- epic-parser (fr-parser-001 + fr-parser-002 must be merged into base before
  this feature is executable)
- epic-formatter (fr-formatter-001 must be merged into base)

## Acceptance Criteria
- [ ] `src/roundtrip.js` exports `roundTrip(input)` function
- [ ] `roundTrip("7")` returns `"#7"`
- [ ] `roundTrip("3.14")` returns `"#3.14"`
- [ ] `roundTrip("not-a-number")` returns `"#null"`
- [ ] Implementation imports from both `src/parsers/int.js` and
      `src/formatters/number.js`

## Technical Notes

- Order: try `parseInteger` first; if null, try `parseFloat`; format whichever
  succeeded (or null) via `formatNumber`.
