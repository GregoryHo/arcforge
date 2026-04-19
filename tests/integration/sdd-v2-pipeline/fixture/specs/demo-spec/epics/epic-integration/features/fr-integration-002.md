# Feature: fr-integration-002

## Source
- Requirement: fr-integration-002
- Detail: specs/demo-spec/details/core.xml

## Dependencies
- fr-integration-001 (uses roundTrip)

## Acceptance Criteria
- [ ] `src/cli.js` is a runnable Node entry point
- [ ] `node src/cli.js 42` prints `#42` followed by a newline to stdout
- [ ] `node src/cli.js foo` prints `#null` followed by a newline to stdout
- [ ] Implementation imports `roundTrip` from `./roundtrip.js`

## Technical Notes

- Use `process.argv[2]` for the input; no flag parsing needed.
