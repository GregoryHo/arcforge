# arc-evaluating scenario suite report

Date: 2026-05-05  
Branch: `chore/arcforge-eval-observation-audit`  
Skill under eval: `skills/arc-evaluating/SKILL.md`  
Benchmark snapshots: `evals/benchmarks/latest.json`, `evals/benchmarks/2026-05-05.json`
Raw dashboard exports: `evals/benchmarks/raw/latest.json`, `evals/benchmarks/raw/2026-05-05.json`

## Scope

This report summarizes the current expanded `arc-evaluating` eval suite. It is intentionally a suite-level review surface, separate from raw ignored per-trial rows under `evals/results/`.

The suite evaluates whether `arc-evaluating` gives disciplined eval-design guidance: weak-scenario detection, preflight/ceiling handling, grader selection, A/B uncertainty interpretation, metric-regression separation, workflow-vs-skill boundary decisions, and discovered-claims / weak-assertions lifecycle arbitration.

## Behavioral result table

| Scenario | Eval id | Trials/side | Baseline pass / avg | Treatment pass / avg | Delta | CI95 | Verdict / policy |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Original weak-scenario audit | `eval-arc-evaluating-scenario-audit` | 30 | 97% / 0.99 | 100% / 1.00 | +0.01 | [-0.01, 0.02] | PASS / non-regression |
| Preflight ceiling redesign | `eval-arc-evaluating-preflight-ceiling-redesign` | 5 | 60% / 0.90 | 100% / 1.00 | +0.10 | [-0.07, 0.27] | PASS / non-regression |
| Grader selection boundary | `eval-arc-evaluating-grader-selection-boundary` | 5 | 100% / 1.00 | 100% / 1.00 | +0.00 | [0.00, 0.00] | PASS / non-regression |
| Noisy A/B delta interpretation | `eval-arc-evaluating-ab-noisy-delta-interpretation` | 5 | 40% / 0.85 | 100% / 1.00 | +0.15 | [-0.02, 0.32] | PASS / non-regression |
| Metric regression separation | `eval-arc-evaluating-metric-regression-separation` | 5 | 100% / 1.00 | 100% / 1.00 | +0.00 | [0.00, 0.00] | PASS / non-regression |
| Workflow-vs-skill boundary | `eval-arc-evaluating-workflow-vs-skill-boundary` | 5 | 0% / 0.75 | 100% / 1.00 | +0.25 | [0.25, 0.25] | PASS / non-regression |
| Claim lifecycle arbitration | `eval-arc-evaluating-claim-lifecycle-arbitration` | 5 | 0% / 0.76 | 100% / 1.00 | +0.24 | [0.13, 0.35] | PASS / non-regression |

## Metrics table

Metric deltas are treatment minus baseline, averaged per trial.

| Scenario | Duration baseline | Duration treatment | Duration delta | Input tok delta | Output tok baseline | Output tok treatment | Output tok delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Original weak-scenario audit | 16404.33ms | 18799.00ms | +2394.67ms | +0.00 | 844.93 | 986.47 | +141.53 |
| Preflight ceiling redesign | 8416.60ms | 12795.20ms | +4378.60ms | +0.00 | 379.80 | 544.60 | +164.80 |
| Grader selection boundary | 12746.80ms | 13309.20ms | +562.40ms | +0.00 | 574.40 | 617.00 | +42.60 |
| Noisy A/B delta interpretation | 18142.20ms | 14748.20ms | -3394.00ms | +0.00 | 784.40 | 734.80 | -49.60 |
| Metric regression separation | 17486.00ms | 18968.40ms | +1482.40ms | +0.00 | 794.80 | 992.40 | +197.60 |
| Workflow-vs-skill boundary | 11977.20ms | 14760.00ms | +2782.80ms | +0.00 | 531.80 | 725.20 | +193.40 |
| Claim lifecycle arbitration | 18958.00ms | 19145.40ms | +187.40ms | +0.00 | 911.20 | 1066.60 | +155.40 |

Current benchmark helper did not flag metric regressions for these scenarios. Operationally, treatment is often slower and more verbose; that cost should stay separate from behavioral correctness.

## Benchmark field coverage

`evals/benchmarks/latest.json` currently exposes, per scenario where data exists:

- behavioral summaries: `trials`, `pass_rate`, `avg_score`, `ci95`, `pass_at_k`, `pass_all_k`;
- treatment/single-run metrics: `metrics.duration_ms`, `metrics.input_tokens`, `metrics.output_tokens`;
- A/B comparison: `compared.baseline`, `compared.treatment`, `compared.delta`, `compared.delta_ci`, `compared.verdict`, `compared.verdict_policy`;
- A/B metric deltas: `compared.metrics.duration_ms`, `compared.metrics.input_tokens`, `compared.metrics.output_tokens` with baseline average, treatment average, delta, and regression flag.

`evals/benchmarks/raw/latest.json` adds dashboard-ready per-trial rows. The current export has 929 rows with 100% duration/input-token/output-token metric coverage. Each row keeps scenario/condition/run/trial provenance, behavioral score/pass data, assertion counts, duration/token metrics, error fields, action count, and transcript-path drilldown; it intentionally omits assistant output bodies so the dashboard can aggregate metrics without duplicating transcripts.

## Drift / comparison interpretation

- The original weak-scenario audit remains near ceiling: treatment is 100%, baseline is already 97%, and CI crosses zero. Treat it as non-regression, not broad lift.
- Preflight ceiling redesign and noisy-delta interpretation now pass after v2 grader regex adjustments. Their CIs still cross zero, so they mainly protect against overclaiming.
- Grader selection and metric regression separation are useful regression guards but have no discriminative A/B lift because baseline is also perfect.
- Workflow-vs-skill boundary has a clear discriminative signal: baseline 0% pass, treatment 100%, delta +0.25 with CI [0.25, 0.25].
- Claim lifecycle arbitration closes the prior discovered-claims / weak-assertions gap: baseline 0% pass, treatment 100%, delta +0.24 with CI [0.13, 0.35]. This specifically tests that raw `discovered_claims` / `weak_assertions` become human-arbitrated audit candidates rather than automatic canonical skill edits.
- Across the suite, the result claim is behavioral non-regression plus two clear boundary/lifecycle wins, not comprehensive proof that every `arc-evaluating` behavior is covered.

## Scenario completeness assessment

The suite is meaningfully stronger than the original single audit scenario. It now covers the main gaps identified in the audit:

1. weak/proxy assertions and insufficient `k=1` evidence;
2. preflight ceiling effects and scenario redesign;
3. grader selection boundaries between deterministic and semantic grading;
4. noisy A/B deltas and CI-crosses-zero interpretation;
5. metric/cost regression as a separate release risk;
6. workflow/plugin/environment evals vs prompt-only `--skill-file` variation;
7. discovered-claims / weak-assertions lifecycle arbitration for promotion, retirement, and historical grader artifact handling.

This closes the main scenario gap identified in the previous audit. It is still not mathematical proof of every `arc-evaluating` behavior, but it is a credible path toward a release gate: the suite now combines near-ceiling non-regression guards with discriminative boundary/lifecycle scenarios and machine-reviewable raw metrics.

## Fully reliable / exhaustive target

Treat `fully reliable / exhaustive / complete proof` as an aspirational gate target, not a literal claim from this dataset. To approach that target, the next required layers are:

1. expand scenario families beyond these seven eval-design behaviors, especially model/human grader calibration and adversarial semantic judgment cases;
2. add raw-dashboard drift monitors over per-trial duration/tokens/score/pass/error distributions, not only aggregate snapshot rows;
3. require stable raw metric collection (`data_quality.metric_coverage.* == 1`) before interpreting cost deltas;
4. periodically retire or quarantine stale scenario versions instead of mixing historical grader artifacts into current benchmark claims;
5. keep behavioral correctness verdicts separate from operational-cost regressions and infra/grade errors.

## Recommendation

Ready as a stronger non-regression benchmark/report update with raw dashboard data collection. The previously identified lifecycle gap now has a passing scenario, and the dashboard has per-trial metric rows for future drift/cost visualization. Keep the external claim conservative: the suite is credible for the major eval-design review behaviors covered here and is moving toward release-gate reliability, but it is not a literal exhaustive proof of every possible `arc-evaluating` behavior or grader-quality judgment.
