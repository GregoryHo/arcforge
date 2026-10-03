# Hours for parseDuration — 2026-10-02

## Where it stands
Branch `feat-duration-hours`: the hours test is written, the code for it is not.
`npm test` → 4 tests, 3 pass, 1 fail (`parses hours`: unknown unit: h)

## Done
- Seconds and minutes parse — verified by `npm test` (`parses seconds`, `parses minutes` pass)
- Text that is not a duration is rejected — verified by `npm test` (`rejects text that is not a duration` passes)

## Unfinished
- Hours — test written in `test/hours.test.js`, failing; nothing in `src/duration.js` yet

## Decisions
- Hours are written `h` only — because the scheduler config that feeds this is generated and only ever emits `h`; rejected accepting `hr` / `hours` as well

## Next
1. Add `h: 60 * 60 * 1000` to `UNITS` in `src/duration.js`, then run `npm test`
