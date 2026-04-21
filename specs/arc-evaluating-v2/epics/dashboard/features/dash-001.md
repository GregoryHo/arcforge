# Feature: Two-tab layout (Outputs, Benchmark)

## Source
- Requirement: `fr-dash-001`
- Detail: `specs/arc-evaluating-v2/details/dashboard.xml`

## Dependencies (within epic)
_none_

## Summary
Outputs tab renders one trial at a time (prompt, files, grading, previous-iteration diff). Benchmark tab aggregates pass rate, delta, CI, token/duration deltas. Active tab + trial encoded in URL fragment.

## Acceptance Criteria
Full criteria live in `specs/arc-evaluating-v2/details/dashboard.xml` under `<requirement id="fr-dash-001">`. Implementer MUST read the spec detail file before writing code — the spec is SoT; this feature.md is a traceability pointer only.
