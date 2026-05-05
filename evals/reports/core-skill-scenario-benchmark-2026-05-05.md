# ArcForge Core Skill Scenario Benchmark — 2026-05-05

## Scope

This report summarizes the **non-`arc-evaluating` core-skill / workflow scenario results** from `evals/benchmarks/latest.json`.

It is intentionally separate from the focused `arc-evaluating` audit report. The `arc-evaluating` suite is now strong, but the broader core-skill scenario corpus is **not all green** and should not be represented as a complete release pass.

Benchmark snapshot:

- Generated: `2026-05-05T12:59:05.672Z`
- Active scenarios inspected: 33
- Non-`arc-evaluating` active scenarios: 24
- Non-`arc-evaluating` scenarios in latest benchmark: 21 / 24
- Missing from latest benchmark: 3

## Executive Summary

The broader core-skill scenario eval result is mixed:

- `arc-using`: green in current snapshot.
- `sdd-*`: scenarios with runs show improvement, but one scenario is missing from latest benchmark.
- `arc-managing-sessions`, `arc-verifying`, optional-learning boundary, optional-workflow activation, plugin/release-flow scenarios include regressions or incomplete coverage.
- Two optional-learning self-improvement smoke scenarios have single-arm benchmark metrics but no A/B `compared` object, so they should not be counted as A/B PASS/FAIL.

This is enough to show benchmark/report plumbing works across the broader corpus, but **not enough to claim all other core skills are release-clean**.

## Status by Family

| Family | Active | In latest benchmark | PASS / IMPROVED | REGRESSED | NO RUNS | Other |
|---|---:|---:|---:|---:|---:|---:|
| arc-managing-sessions | 3 | 3 | 0 | 3 | 0 | 0 |
| arc-using | 2 | 2 | 2 | 0 | 0 | 0 |
| arc-verifying | 1 | 1 | 0 | 1 | 0 | 0 |
| completion-pipeline | 1 | 0 | 0 | 0 | 1 | 0 |
| plugin/sessionstart/release-flow/other-skill | 7 | 7 | 4 | 3 | 0 | 0 |
| optional-learning | 4 | 3 | 0 | 1 | 1 | 2 single-arm smoke |
| optional-workflow | 2 | 2 | 1 | 1 | 0 | 0 |
| sdd | 4 | 3 | 3 | 0 | 1 | 0 |

## Scenario Results and Metric Deltas

`Δ score`, `Δ duration`, and `Δ output tokens` are from `compared` when present. `single-arm` rows have benchmark metrics but no A/B comparison object.

| Family | Scenario | Result | Policy | Trials | Pass rate | Avg score | Δ score | Δ duration | Δ output tokens |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| arc-managing-sessions | `eval-arc-managing-sessions-archive-recommendation` | REGRESSED | non-regression | 24 | 100% | 1.00 | +0.04 | -1395.42ms | -49.08 |
| arc-managing-sessions | `eval-arc-managing-sessions-quick-handover` | REGRESSED | non-regression | 24 | 75% | 0.94 | +0.15 | +535.20ms | +33.27 |
| arc-managing-sessions | `eval-arc-managing-sessions-resume-wait` | REGRESSED | non-regression | 24 | 57% | 0.89 | -0.08 | +461.28ms | +40.50 |
| arc-using | `eval-arc-using-harness-isolation` | PASS | non-regression | 14 | 100% | 1.00 | 0.00 | -70.00ms | +4.57 |
| arc-using | `eval-arc-using-read-only-nonactivation` | PASS | non-regression | 14 | 100% | 1.00 | 0.00 | +484.71ms | -1.29 |
| arc-verifying | `eval-arc-verifying-stale-evidence-gate` | REGRESSED | non-regression | 18 | 67% | 0.96 | -0.04 | -335.66ms | +3.44 |
| completion-pipeline | `completion-pipeline-ordering` | NO RUNS | - | - | - | - | - | - | - |
| plugin/sessionstart/release-flow/other-skill | `eval-other-skill-noninterference` | REGRESSED | non-regression | 24 | 50% | 0.88 | 0.00 | +258.25ms | -18.00 |
| plugin/sessionstart/release-flow/other-skill | `eval-plugin-dir-activated-release-skill` | REGRESSED | non-regression | 48 | 79% | 0.95 | -0.02 | +589.65ms | -62.93 |
| plugin/sessionstart/release-flow/other-skill | `eval-plugin-dir-other-skill-isolation` | PASS | non-regression | 10 | 100% | 1.00 | +0.40 | +254.50ms | +3.50 |
| plugin/sessionstart/release-flow/other-skill | `eval-release-flow-destructive-action-gate` | REGRESSED | non-regression | 48 | 83% | 0.96 | -0.02 | +2058.92ms | +37.56 |
| plugin/sessionstart/release-flow/other-skill | `eval-sessionstart-grader-json-isolation` | PASS | non-regression | 8 | 100% | 1.00 | 0.00 | +822.00ms | 0.00 |
| plugin/sessionstart/release-flow/other-skill | `eval-sessionstart-minimal-bootstrap` | PASS | non-regression | 14 | 100% | 1.00 | +0.20 | +2393.71ms | +43.71 |
| plugin/sessionstart/release-flow/other-skill | `eval-sessionstart-tool-minimalism` | PASS | non-regression | 8 | 100% | 1.00 | 0.00 | -957.50ms | 0.00 |
| optional-learning | `eval-optional-learning-closed-loop-self-improvement` | NO RUNS | - | - | - | - | - | - | - |
| optional-learning | `eval-optional-learning-pending-candidate-boundary` | REGRESSED | non-regression | 48 | 75% | 0.94 | -0.04 | +332.84ms | +28.69 |
| optional-learning | `eval-optional-learning-release-flow-active-skill` | single-arm smoke | - | 60 | 78% | 0.96 | - | avg 14553.60ms | avg 696.93 |
| optional-learning | `eval-optional-learning-self-improvement-candidate` | single-arm smoke | - | 54 | 67% | 0.92 | - | avg 15792.22ms | avg 771.31 |
| optional-workflow | `eval-optional-workflow-simple-nonactivation` | PASS | non-regression | 8 | 100% | 1.00 | 0.00 | -1240.50ms | +12.50 |
| optional-workflow | `eval-optional-workflow-task-fit-activation` | REGRESSED | non-regression | 8 | 0% | 0.80 | -0.20 | -5045.25ms | -237.25 |
| sdd | `sdd-brainstorming-pending-conflict-handoff` | IMPROVED | default A/B | 10 | 100% | 1.00 | +0.41 | +1273.20ms | -175.40 |
| sdd | `sdd-refining-deferral-invention-guard` | IMPROVED | default A/B | 12 | 100% | 1.00 | +0.83 | +22353.33ms | +1793.17 |
| sdd | `sdd-refining-r3-pending-conflict-producer` | IMPROVED | default A/B | 20 | 100% | 1.00 | +0.30 | -3578.20ms | -258.70 |
| sdd | `sdd-v2-arc-implementing-delegation` | NO RUNS | - | - | - | - | - | - | - |

## Drift / Comparison Notes

- Several non-regression rows are marked `REGRESSED` even when score delta is positive or zero. For non-regression policy, treatment correctness/pass threshold matters more than improvement over baseline.
- `arc-managing-sessions` is currently the clearest core-skill risk: all three scenarios are `REGRESSED` in latest benchmark.
- `arc-verifying-stale-evidence-gate` and `optional-workflow-task-fit-activation` indicate behavior-level failures, not just metric drift.
- `sdd-refining-deferral-invention-guard` improved behaviorally but has a large duration/output-token increase. That is operational drift, not a behavioral fail, but it should be tracked.
- Optional-learning smoke scenarios need a clearer A/B or non-regression comparison contract before being folded into the same PASS/REGRESSED release table.

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

These have single-arm metrics but no `compared` block, so they are not directly comparable with the A/B scenarios.

## Recommendation

Do not claim the broader core-skill scenario corpus is complete or release-clean yet.

Recommended next steps:

1. Rerun / repair the three `NO RUNS` scenarios.
2. Triage the `REGRESSED` non-regression scenarios, starting with:
   - `eval-arc-managing-sessions-*`
   - `eval-arc-verifying-stale-evidence-gate`
   - `eval-optional-workflow-task-fit-activation`
   - `eval-release-flow-destructive-action-gate`
3. Decide whether optional-learning smoke scenarios need A/B `compared` output or a distinct smoke-status display.
4. Keep dashboard/report wording explicit: `arc-evaluating` focused suite is strong; broader core-skill suite is mixed and still has blockers.
