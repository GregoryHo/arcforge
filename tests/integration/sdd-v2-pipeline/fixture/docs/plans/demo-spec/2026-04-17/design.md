# Demo Spec — Design (Path A, Initial)

Generated: 2026-04-17
Spec ID: demo-spec
Iteration: 2026-04-17

## Problem

We need a minimal end-to-end exercise for SDD v2 downstream skills
(`arc-implementing`, `arc-agent-driven`, `arc-dispatching-parallel`,
`arc-dispatching-teammates`, `arc-looping`). To do that we need a spec
small enough to execute quickly but structured enough to exercise multi-epic
dependency ordering.

## Proposed Solution

Implement a trivial number parse/format/integrate pipeline split across three
epics:

1. **Parser primitives** — `parseInteger(str)` and `parseFloat(str)`, each in
   its own file, fully independent of the other. Exercises
   `arc-dispatching-parallel`'s ability to run two features concurrently.
2. **Formatter primitives** — `formatNumber(n)` and `formatList(arr)`, where
   `formatList` imports `formatNumber`. Exercises feature-level dependency
   ordering within an epic.
3. **Integration** — `roundTrip(input)` that parses then formats, plus a CLI
   entry point. Depends on both parser and formatter epics. Exercises epic-level
   DAG ordering for `arc-looping` DAG pattern.

## Scope

- **In:** six trivial requirements (fr-parser-{001,002}, fr-formatter-{001,002},
  fr-integration-{001,002}), all exercising arcforge's per-spec layout.
- **Out:** real-world parsing concerns (locales, BigInt, streaming). These
  would pollute the fixture with domain complexity irrelevant to the pipeline
  verification goal.

## Architecture Impact

None — this fixture lives at
`tests/integration/sdd-v2-pipeline/fixture/` and is only ever copied into a
temporary trial directory. It does not affect production code paths.
