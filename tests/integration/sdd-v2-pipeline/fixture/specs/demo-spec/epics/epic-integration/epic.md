# Epic: epic-integration

## Goal

Wire the parser and formatter primitives into a single `roundTrip(input)`
function and a CLI entry point. This epic is the DAG join node — it depends
on both epic-parser and epic-formatter being complete.

## Files

- `src/roundtrip.js`
- `src/cli.js`
- `test/roundtrip.test.js`

## Features

1. **fr-integration-001** — roundTrip Pipeline (base)
2. **fr-integration-002** — CLI Entry Exposing roundTrip (depends on 001)

## Dependencies

- epic-parser (consumes `src/parsers/int.js` and `src/parsers/float.js`)
- epic-formatter (consumes `src/formatters/number.js`)

## Source

- specs/demo-spec/details/core.xml
