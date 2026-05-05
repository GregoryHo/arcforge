# Eval Benchmarks

This directory stores benchmark snapshots generated from eval results.

The eval harness writes:

- `latest.json` — most recent aggregate benchmark snapshot
- `YYYY-MM-DD.json` — date-stamped aggregate snapshot

Each scenario entry includes the behavioral result summary (`trials`, `pass_rate`, `avg_score`, `ci95`) plus execution metrics when present in raw rows:

- `metrics.duration_ms`, `metrics.input_tokens`, `metrics.output_tokens` — treatment/single-run counts, averages, min/max, and totals
- `compared.baseline` / `compared.treatment` — A/B score summaries when both conditions exist
- `compared.delta` / `compared.delta_ci` / `compared.verdict` — programmatic comparison result
- `compared.metrics.*` — baseline/treatment metric means, deltas, and metric-regression flags

Benchmark snapshots are summaries, not scenario definitions. A snapshot may reference scenarios that were later deleted or retired; treat those entries as historical records, not active test cases.

Active scenarios live in `evals/scenarios/`. Raw per-trial output lives in `evals/results/` and is ignored by git by default.

## Current active composable-skill coverage

The composable skill refactor is covered by the focused scenarios documented in:

- `docs/guide/composable-skill-eval-coverage.md`

Use those scenarios for current non-regression checks around:

- bounded `arc-using` behavior
- SessionStart minimal bootstrap
- optional workflow task-fit activation
- simple-task non-activation
- harness / grader / plugin-dir isolation
- other-skill non-interference
