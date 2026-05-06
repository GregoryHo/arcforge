# arc-evaluating scenario suite eval — 2026-05-05

## Scope

- Commit at evaluation start: `a43b5e1` (`chore/arcforge-eval-observation-audit`)
- Skill under eval: `skills/arc-evaluating/SKILL.md`
- Harness: ArcForge eval harness through `node scripts/cli.js eval ...`
- Claim type: `non-regression`
- Verdict policy: `non-regression`
- Grader: deterministic `code`
- Benchmark snapshots updated: `evals/benchmarks/latest.json`, `evals/benchmarks/2026-05-05.json`
- Raw dashboard exports updated: `evals/benchmarks/raw/latest.json`, `evals/benchmarks/raw/2026-05-05.json`

This suite evaluates whether `arc-evaluating` gives disciplined eval-design review rather than rubber-stamping weak release evidence. It now covers the original weak-scenario audit plus eight focused boundary/lifecycle/calibration/proxy-grader scenarios.

## Commands

```bash
node scripts/cli.js eval ab <scenario> --k 5 --max-turns 2
node scripts/cli.js eval compare <scenario>
node scripts/cli.js eval report --json
node scripts/cli.js eval lint <scenario>
npm run test:scripts -- --runTestsByPath tests/scripts/eval.test.js tests/scripts/eval-stats.test.js
npm run lint
npm test
```

Raw per-trial JSONL rows and transcripts remain ignored under `evals/results/`. Dashboard-oriented per-trial metrics are committed under `evals/benchmarks/raw/`; current raw export has 949 rows and 100% duration/input-token/output-token/total-token metric coverage. Rows now include total-token cost proxy plus baseline-relative score/duration/token deltas for drift dashboards.

## Result summary

| Scenario | Eval id | Trials/side | Baseline pass | Baseline avg | Treatment pass | Treatment avg | Delta | Delta CI95 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Original weak-scenario audit | eval-arc-evaluating-scenario-audit | 30 | 97% | 0.99 | 100% | 1.00 | +0.01 | [-0.01, 0.02] | PASS |
| Preflight ceiling redesign | eval-arc-evaluating-preflight-ceiling-redesign | 5 | 60% | 0.90 | 100% | 1.00 | +0.10 | [-0.07, 0.27] | PASS |
| Grader selection boundary | eval-arc-evaluating-grader-selection-boundary | 5 | 100% | 1.00 | 100% | 1.00 | +0.00 | [0.00, 0.00] | PASS |
| Noisy A/B delta interpretation | eval-arc-evaluating-ab-noisy-delta-interpretation | 5 | 40% | 0.85 | 100% | 1.00 | +0.15 | [-0.02, 0.32] | PASS |
| Metric regression separation | eval-arc-evaluating-metric-regression-separation | 5 | 100% | 1.00 | 100% | 1.00 | +0.00 | [0.00, 0.00] | PASS |
| Workflow-vs-skill boundary | eval-arc-evaluating-workflow-vs-skill-boundary | 5 | 0% | 0.75 | 100% | 1.00 | +0.25 | [0.25, 0.25] | PASS |
| Claim lifecycle arbitration | eval-arc-evaluating-claim-lifecycle-arbitration | 5 | 0% | 0.76 | 100% | 1.00 | +0.24 | [0.13, 0.35] | PASS |
| Model-grader calibration | eval-arc-evaluating-model-grader-calibration | 5 | 100% | 1.00 | 100% | 1.00 | +0.00 | [0.00, 0.00] | PASS |
| Adversarial proxy grader | eval-arc-evaluating-adversarial-proxy-grader | 5 | 20% | 0.76 | 100% | 1.00 | +0.24 | [0.03, 0.45] | PASS |

## Metrics

| Scenario | Baseline duration ms | Treatment duration ms | Duration delta | Baseline input tok | Treatment input tok | Input delta | Baseline output tok | Treatment output tok | Output delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Original weak-scenario audit | 16404.33 | 18799.00 | +2394.67 | 6.00 | 6.00 | +0.00 | 844.93 | 986.47 | +141.53 |
| Preflight ceiling redesign | 8416.60 | 12795.20 | +4378.60 | 6.00 | 6.00 | +0.00 | 379.80 | 544.60 | +164.80 |
| Grader selection boundary | 12746.80 | 13309.20 | +562.40 | 6.00 | 6.00 | +0.00 | 574.40 | 617.00 | +42.60 |
| Noisy A/B delta interpretation | 18142.20 | 14748.20 | -3394.00 | 6.00 | 6.00 | +0.00 | 784.40 | 734.80 | -49.60 |
| Metric regression separation | 17486.00 | 18968.40 | +1482.40 | 6.00 | 6.00 | +0.00 | 794.80 | 992.40 | +197.60 |
| Workflow-vs-skill boundary | 11977.20 | 14760.00 | +2782.80 | 6.00 | 6.00 | +0.00 | 531.80 | 725.20 | +193.40 |
| Claim lifecycle arbitration | 18958.00 | 19145.40 | +187.40 | 6.00 | 6.00 | +0.00 | 911.20 | 1066.60 | +155.40 |
| Model-grader calibration | 17907.20 | 15470.40 | -2436.80 | 6.00 | 6.00 | +0.00 | 868.80 | 763.80 | -105.00 |
| Adversarial proxy grader | 21654.80 | 21021.80 | -633.00 | 6.00 | 6.00 | +0.00 | 987.20 | 1003.60 | +16.40 |

No metric regression flag tripped in the benchmark helper. Treatment is often slower and/or more verbose than baseline; these operational costs are reported separately from behavioral correctness.

## Drift / compared interpretation

- **Near-ceiling / non-regression guards:** original weak-scenario audit, grader selection boundary, metric regression separation, and model-grader calibration. These pass, but do not prove broad lift because baseline also performs strongly.
- **CI-crosses-zero caution guards:** preflight ceiling redesign and noisy A/B delta interpretation. These protect against overclaiming weak or noisy evidence.
- **Discriminative wins:** workflow-vs-skill boundary, claim lifecycle arbitration, and adversarial proxy-grader rejection show treatment gains with baseline failures.
- **Operational drift:** raw exports now let the dashboard plot per-trial score/pass/error/duration/token distributions and baseline-relative cost deltas instead of relying only on aggregate tables.

## Scenario completeness assessment

The suite is now materially more complete than the original single scenario. It covers:

1. weak/proxy assertions and `k=1` release evidence;
2. preflight ceiling and scenario redesign;
3. grader selection between structural code checks and semantic quality checks;
4. noisy A/B delta interpretation;
5. metric/cost regression separation;
6. workflow/plugin/environment boundary vs prompt-only skill evals;
7. discovered-claims / weak-assertions promotion-retirement workflow with historical grader artifacts;
8. model/human grader calibration for qualitative scoring;
9. adversarial semantic-judgment cases where keyword proxies create false confidence.

Remaining limitations:

- A literal `fully reliable / exhaustive / complete proof` claim still requires more than this dataset; treat it as an aspirational release-gate target.
- Several scenarios are intentionally non-regression guards near baseline ceiling.
- All new scenarios are still code-graded behavioral checks; they do not replace a real human-labeled grader calibration set.
- Cost metrics are token/duration proxies, not dollars; the raw export exposes `cost_proxy_tokens` but model pricing is not encoded yet.

## Benchmark update

The benchmark generator stores richer fields per eval:

- `metrics.duration_ms`, `metrics.input_tokens`, `metrics.output_tokens`
- `compared.baseline`, `compared.treatment`
- `compared.delta`, `compared.delta_ci`, `compared.verdict`, `compared.verdict_policy`
- `compared.metrics.*` with baseline/treatment means, deltas, and regression flags

The raw dashboard export stores one row per scenario-condition-trial in `evals/benchmarks/raw/latest.json` and the matching date snapshot. Rows include scenario/condition/run/trial provenance, behavioral score/pass fields, assertion counts, duration/token metrics, `total_tokens`, `cost_proxy_tokens`, baseline averages, baseline-relative drift/cost deltas, infra/grade errors, and action count while omitting transcript bodies. Transcript path fields are nullable in the committed raw export; full transcripts remain under ignored `evals/results/` artifacts.

## Decision

Status: `PASS` for the expanded `arc-evaluating` non-regression suite.

Do not overclaim literal exhaustive proof. The reportable claim is now: `arc-evaluating` passes a broader regression suite for eval-design review behaviors, with clear treatment advantages in workflow-vs-skill boundary handling, claim-lifecycle arbitration, and adversarial proxy-grader rejection, plus committed per-trial raw metrics for dashboard drift/cost analysis. This is credible major-surface coverage moving toward release-gate reliability, not complete proof of every possible skill behavior.

Post-audit note: `eval-arc-evaluating-model-grader-calibration` was tightened to reject a negated human-review false positive. The versioned scenario was rerun at k=5/side and still passes under the tightened grader.
