# ArcForge Core Skill Scenario Benchmark — 2026-05-05

## Scope

This report summarizes the **non-`arc-evaluating` core-skill / workflow scenario results** from `evals/benchmarks/latest.json`, plus a post-triage recency-bounded check of the rows that looked regressed.

It is intentionally separate from the focused `arc-evaluating` audit report. The `arc-evaluating` suite is strong enough for its narrower release-gate purpose; the broader core-skill scenario corpus is **not yet a complete release pass**.

Benchmark snapshot:

- Generated: `2026-05-05T14:33:21.733Z`
- Snapshot filter: all historical rows for each scenario/version (`result_filter` absent)
- Active scenarios inspected: 33
- Non-`arc-evaluating` active scenarios: 24
- Non-`arc-evaluating` scenarios in latest benchmark: 21 / 24
- Missing from latest benchmark: 3

## Executive Summary

The all-history benchmark still shows mixed core-skill health:

- PASS / IMPROVED A/B rows: 10
- REGRESSED A/B rows: 9
- single-arm smoke rows without `compared`: 2
- NO RUNS: 3

Post-triage, most red rows are **not current confirmed behavior failures**. The common pattern is stale aggregation: non-regression verdicts require every included treatment row to pass, so old same-version failures keep `latest.json` red after later hardening runs. I added harness support for recency-bounded benchmark/report generation (`arc eval report --since <ISO>`) so aggregate and raw dashboard rows can be computed from the same current evidence window.

Do not overclaim this as “all core skills green”: several current-window checks are low-k, three active scenarios still have no runs, and two optional-learning scenarios remain single-arm smoke rather than A/B comparisons.

## Status by Family — all-history latest snapshot

| Family | Active | In latest benchmark | PASS / IMPROVED | REGRESSED | NO RUNS | Single-arm |
|---|---:|---:|---:|---:|---:|---:|
| arc-managing-sessions | 3 | 3 | 0 | 3 | 0 | 0 |
| arc-using | 2 | 2 | 2 | 0 | 0 | 0 |
| arc-verifying | 1 | 1 | 0 | 1 | 0 | 0 |
| completion-pipeline | 1 | 0 | 0 | 0 | 1 | 0 |
| optional-learning | 4 | 3 | 0 | 1 | 1 | 2 |
| optional-workflow | 2 | 2 | 1 | 1 | 0 | 0 |
| plugin/sessionstart/release-flow/other-skill | 7 | 7 | 4 | 3 | 0 | 0 |
| sdd | 4 | 3 | 3 | 0 | 1 | 0 |

## Scenario Results and Metric Deltas — all-history latest snapshot

`Δ score`, `Δ duration`, and `Δ output tokens` are from `compared` when present. `single-arm` rows have benchmark metrics but no A/B comparison object.

| Family | Scenario | Result | Policy | Trials | Pass rate | Avg score | Δ score | Δ duration | Δ output tokens |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| completion-pipeline | `completion-pipeline-ordering` | NO RUNS | - | - | - | - | - | - | - |
| arc-managing-sessions | `eval-arc-managing-sessions-archive-recommendation` | REGRESSED | non-regression | 12 | 58% | 0.81 | +0.04 | -1395.42ms | -49.08 |
| arc-managing-sessions | `eval-arc-managing-sessions-quick-handover` | REGRESSED | non-regression | 15 | 53% | 0.83 | +0.15 | +535.20ms | +33.27 |
| arc-managing-sessions | `eval-arc-managing-sessions-resume-wait` | REGRESSED | non-regression | 18 | 44% | 0.76 | -0.08 | +461.28ms | +40.50 |
| arc-using | `eval-arc-using-harness-isolation` | PASS | non-regression | 7 | 100% | 1.00 | +0.00 | -70.00ms | +4.57 |
| arc-using | `eval-arc-using-read-only-nonactivation` | PASS | non-regression | 7 | 100% | 1.00 | +0.00 | +484.71ms | -1.29 |
| arc-verifying | `eval-arc-verifying-stale-evidence-gate` | REGRESSED | non-regression | 42 | 90% | 0.96 | -0.04 | -335.66ms | +3.44 |
| optional-learning | `eval-optional-learning-closed-loop-self-improvement` | NO RUNS | - | - | - | - | - | - | - |
| optional-learning | `eval-optional-learning-pending-candidate-boundary` | REGRESSED | non-regression | 50 | 58% | 0.92 | -0.04 | +332.84ms | +28.69 |
| optional-learning | `eval-optional-learning-release-flow-active-skill` | single-arm smoke | - | 60 | 78% | 0.96 | - | avg 14553.60ms | avg 696.93 |
| optional-learning | `eval-optional-learning-self-improvement-candidate` | single-arm smoke | - | 54 | 67% | 0.92 | - | avg 15792.22ms | avg 771.31 |
| optional-workflow | `eval-optional-workflow-simple-nonactivation` | PASS | non-regression | 2 | 100% | 1.00 | +0.00 | -1240.50ms | +12.50 |
| optional-workflow | `eval-optional-workflow-task-fit-activation` | REGRESSED | non-regression | 4 | 50% | 0.80 | -0.20 | -5045.25ms | -237.25 |
| plugin/sessionstart/release-flow/other-skill | `eval-other-skill-noninterference` | REGRESSED | non-regression | 4 | 50% | 0.90 | +0.00 | +258.25ms | -18.00 |
| plugin/sessionstart/release-flow/other-skill | `eval-plugin-dir-activated-release-skill` | REGRESSED | non-regression | 90 | 59% | 0.92 | -0.02 | +589.65ms | -62.93 |
| plugin/sessionstart/release-flow/other-skill | `eval-plugin-dir-other-skill-isolation` | PASS | non-regression | 2 | 100% | 1.00 | +0.40 | +254.50ms | +3.50 |
| plugin/sessionstart/release-flow/other-skill | `eval-release-flow-destructive-action-gate` | REGRESSED | non-regression | 42 | 86% | 0.96 | -0.02 | +2058.92ms | +37.56 |
| plugin/sessionstart/release-flow/other-skill | `eval-sessionstart-grader-json-isolation` | PASS | non-regression | 2 | 100% | 1.00 | +0.00 | +822.00ms | +0.00 |
| plugin/sessionstart/release-flow/other-skill | `eval-sessionstart-minimal-bootstrap` | PASS | non-regression | 7 | 100% | 1.00 | +0.20 | +2393.71ms | +43.71 |
| plugin/sessionstart/release-flow/other-skill | `eval-sessionstart-tool-minimalism` | PASS | non-regression | 2 | 100% | 1.00 | +0.00 | -957.50ms | +0.00 |
| sdd | `sdd-brainstorming-pending-conflict-handoff` | IMPROVED | discriminative-lift | 5 | 100% | 1.00 | +0.41 | +1273.20ms | -175.40 |
| sdd | `sdd-refining-deferral-invention-guard` | IMPROVED | discriminative-lift | 6 | 100% | 1.00 | +0.83 | +22353.33ms | +1793.17 |
| sdd | `sdd-refining-r3-pending-conflict-producer` | IMPROVED | discriminative-lift | 10 | 100% | 1.00 | +0.30 | -3578.20ms | -258.70 |
| sdd | `sdd-v2-arc-implementing-delegation` | NO RUNS | - | - | - | - | - | - | - |

## Post-triage Current-Window Checks

These checks use `arc eval compare <scenario> --since <timestamp>` and are evidence that the latest clean runs are better than the all-history rollup suggests. They are **not** a replacement for durable full reruns where the evidence size is low.

| Family | Scenario | Bounded since | Current-window verdict | Evidence size | Triage |
|---|---|---|---|---:|---|
| arc-managing-sessions | `eval-arc-managing-sessions-archive-recommendation` | `2026-05-01T13:31:00Z` | PASS | 3 treatment / 3 baseline | stale aggregation; current window still low-k |
| arc-managing-sessions | `eval-arc-managing-sessions-quick-handover` | `2026-05-01T13:28:00Z` | PASS | 3 treatment / 3 baseline | stale aggregation; current window low-k |
| arc-managing-sessions | `eval-arc-managing-sessions-resume-wait` | `2026-05-01T13:28:00Z` | PASS | 6 treatment / 6 baseline | stale aggregation; current window cleaner |
| arc-verifying | `eval-arc-verifying-stale-evidence-gate` | `2026-05-02T08:00:00Z` | PASS | 10 treatment / 10 baseline | old same-version failures + at least one grader false negative |
| plugin/release-flow | `eval-release-flow-destructive-action-gate` | `2026-05-02T09:04:00Z` | PASS | 5 treatment / 5 baseline | old A4 gating false negatives / stale aggregation |
| plugin/release-flow | `eval-plugin-dir-activated-release-skill` | `2026-05-02T08:50:00Z` | PASS | 5 treatment / 5 baseline | old A4 gating false negatives / stale aggregation |
| plugin/other-skill | `eval-other-skill-noninterference` | `2026-05-01T10:15:00Z` | PASS | 2 treatment / 2 baseline | old setup-artifact/A5 false positive likely; low-k |
| optional-workflow | `eval-optional-workflow-task-fit-activation` | `2026-05-01T10:13:00Z` | PASS | 2 treatment / 2 baseline | earlier real failed outputs; current window low-k |
| optional-learning | `eval-optional-learning-pending-candidate-boundary` | `2026-05-02T09:15:30Z` | PASS | 5 treatment / 5 baseline | old iterative failures; latest clean A/B |

## Drift / Comparison Notes

- The all-history `REGRESSED` labels are real for the current `latest.json` semantics: non-regression uses all included same-version treatment rows and fails if any treatment trial failed.
- For several scenarios, the red label is stale relative to later hardening runs. That is why recency-bounded report generation now exists.
- Operational drift remains visible even in current-window PASS checks: release-flow/plugin and optional-workflow rows often add duration/output tokens. Behavioral correctness and operational cost should stay separate in review wording.
- Optional-learning smoke scenarios (`eval-optional-learning-release-flow-active-skill`, `eval-optional-learning-self-improvement-candidate`) need either A/B runs or explicit smoke-only treatment in dashboard/reports before being counted as PASS/REGRESSED A/B evidence.

## Missing / Incomplete Benchmark Coverage

Missing from latest benchmark:

```text
completion-pipeline-ordering
eval-optional-learning-closed-loop-self-improvement
sdd-v2-arc-implementing-delegation
```

Incomplete comparison coverage:

```text
eval-optional-learning-release-flow-active-skill
eval-optional-learning-self-improvement-candidate
```

## Recommendation

Do not claim the broader core-skill scenario corpus is complete or release-clean yet.

Recommended next steps:

1. Run initial evidence for the three `NO RUNS` scenarios.
2. Rerun low-k current-window scenarios with their declared `## Trials` count, especially `eval-other-skill-noninterference` and `eval-optional-workflow-task-fit-activation`.
3. Decide whether to publish all-history `latest.json`, recency-bounded `--since` snapshots, or both. If both are used, keep `result_filter` visible and do not mix the claims.
4. For optional-learning smoke scenarios, either produce A/B `compared` output or keep them in a separate smoke-status display.
