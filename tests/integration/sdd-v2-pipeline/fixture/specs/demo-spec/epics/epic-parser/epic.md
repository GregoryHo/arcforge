# Epic: epic-parser

## Goal

Provide two parser primitives — `parseInteger` and `parseFloat` — each exposed
from its own module. Features are fully independent: no shared file, no shared
helper, no import between the two. This shape is deliberate so
`arc-dispatching-parallel` can run both features concurrently without
write-conflicts.

## Files

- `src/parsers/int.js`
- `src/parsers/float.js`
- `test/parsers/int.test.js`
- `test/parsers/float.test.js`

## Features

1. **fr-parser-001** — parseInteger Primitive (independent)
2. **fr-parser-002** — parseFloat Primitive (independent)

## Dependencies

- None (this is a root epic)

## Source

- specs/demo-spec/details/core.xml
