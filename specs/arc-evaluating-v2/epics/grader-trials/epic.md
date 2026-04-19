# Epic: Grader Pipeline — Per-Trial Data and Claim Channels

## Summary
Wave-1 pure additions: capture timing + tokens per trial, surface deltas in benchmark reports, add discovered_claims[] and weak_assertions[] channels to grading.json (both advisory, neither affects verdict).

## Source
Detail file: `specs/arc-evaluating-v2/details/grader-pipeline.xml`

## Dependencies
_none (can start immediately)_

## Features
- **gr-001** — Capture per-trial timing and token metrics (source: `fr-gr-001`)
- **gr-002** — Surface token and duration deltas in benchmark reports (source: `fr-gr-002`)
- **gr-003** — discovered_claims[] field in grading.json (source: `fr-gr-003`)
- **gr-004** — weak_assertions[] field in grading.json (source: `fr-gr-004`)
