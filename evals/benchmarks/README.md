# Eval Benchmarks

This directory stores benchmark snapshots generated from eval results.

The eval harness writes:

- `latest.json` — most recent aggregate benchmark snapshot
- `YYYY-MM-DD.json` — date-stamped aggregate snapshot
- `raw/latest.json` — most recent dashboard-oriented per-trial raw metrics export
- `raw/YYYY-MM-DD.json` — date-stamped raw metrics export

Aggregate scenario entries include the behavioral result summary (`trials`, `pass_rate`, `avg_score`, `ci95`) plus execution metrics when present in raw rows:

- `metrics.duration_ms`, `metrics.input_tokens`, `metrics.output_tokens` — treatment/single-run counts, averages, min/max, and totals
- `compared.baseline` / `compared.treatment` — A/B score summaries when both conditions exist
- `compared.delta` / `compared.delta_ci` / `compared.verdict` — programmatic comparison result
- `compared.metrics.*` — baseline/treatment metric means, deltas, and metric-regression flags

Benchmark snapshots are summaries, not scenario definitions. A snapshot may reference scenarios that were later deleted or retired; treat those entries as historical records, not active test cases.

Raw dashboard exports use `schema_version: 1` and a row-per-trial shape. Each `rows[]` entry intentionally omits assistant output/transcript bodies and keeps only dashboard-safe provenance/metrics:

- identity/provenance: `scenario`, `condition`, `scope`, `claim_type`, `grader`, `version`, `run_id`, `timestamp`, `trial`, `k`, `model`
- behavioral result: `passed`, `score`, `assertion_count`, `assertion_passed_count`
- operational metrics: `duration_ms`, `input_tokens`, `output_tokens`, `total_tokens`, `cost_proxy_tokens`
- drift/cost context: `baseline_score_avg`, `baseline_duration_ms_avg`, `baseline_input_tokens_avg`, `baseline_output_tokens_avg`, `baseline_total_tokens_avg`, plus `*_delta_vs_baseline_avg` fields for score, duration, input tokens, output tokens, and total tokens
- diagnostics/drilldown: `infra_error`, `grade_error`, `transcript_path`, `artifact_summary`, `action_count`
- coverage summary: `data_quality.metric_coverage.*` reports the fraction of raw rows with numeric duration/token/total-token metrics

Active scenarios live in `evals/scenarios/`. Full raw per-trial JSONL and transcripts live in `evals/results/` and are ignored by git by default.

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
