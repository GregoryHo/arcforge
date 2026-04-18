# Epic: epic-formatter

## Goal

Provide two formatter primitives — `formatNumber` and `formatList`. Unlike
epic-parser, the two features are **not** independent: `formatList` depends on
`formatNumber` and must import it. This shape exercises feature-level
dependency ordering within a single epic.

## Files

- `src/formatters/number.js`
- `src/formatters/list.js`
- `test/formatters/number.test.js`
- `test/formatters/list.test.js`

## Features

1. **fr-formatter-001** — formatNumber Primitive (base)
2. **fr-formatter-002** — formatList Uses formatNumber (depends on 001)

## Dependencies

- None (this is a root epic — same spec as epic-parser, siblings)

## Source

- specs/demo-spec/details/core.xml
