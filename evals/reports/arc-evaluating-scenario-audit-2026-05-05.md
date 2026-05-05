# arc-evaluating scenario suite eval — 2026-05-05

## Scope

- Commit at evaluation start: `a43b5e1` (`chore/arcforge-eval-observation-audit`)
- Skill under eval: `skills/arc-evaluating/SKILL.md`
- Harness: ArcForge eval harness through `node scripts/cli.js eval ...`
- Claim type: `non-regression`
- Verdict policy: `non-regression`
- Grader: deterministic `code`
- Benchmark snapshots updated: `evals/benchmarks/latest.json`, `evals/benchmarks/2026-05-05.json`

This suite evaluates whether `arc-evaluating` gives disciplined eval-design review rather than rubber-stamping weak release evidence. It now covers the original weak-scenario audit plus five focused boundary scenarios.

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

Raw per-trial rows remain ignored under `evals/results/`; this report and the benchmark snapshots are the reviewable committed summaries.

## Result summary

| Scenario | Eval id | Trials/side | Baseline pass | Baseline avg | Treatment pass | Treatment avg | Delta | Delta CI95 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Original weak-scenario audit | eval-arc-evaluating-scenario-audit | 30 | 97% | 0.99 | 100% | 1.00 | +0.01 | [-0.01, 0.02] | PASS |
| Preflight ceiling redesign | eval-arc-evaluating-preflight-ceiling-redesign | 5 | 60% | 0.90 | 100% | 1.00 | +0.10 | [-0.07, 0.27] | PASS |
| Grader selection boundary | eval-arc-evaluating-grader-selection-boundary | 5 | 100% | 1.00 | 100% | 1.00 | +0.00 | [0.00, 0.00] | PASS |
| Noisy A/B delta interpretation | eval-arc-evaluating-ab-noisy-delta-interpretation | 5 | 40% | 0.85 | 100% | 1.00 | +0.15 | [-0.02, 0.32] | PASS |
| Metric regression separation | eval-arc-evaluating-metric-regression-separation | 5 | 100% | 1.00 | 100% | 1.00 | +0.00 | [0.00, 0.00] | PASS |
| Workflow-vs-skill boundary | eval-arc-evaluating-workflow-vs-skill-boundary | 5 | 0% | 0.75 | 100% | 1.00 | +0.25 | [0.25, 0.25] | PASS |

## Metrics

| Scenario | Baseline duration ms | Treatment duration ms | Duration delta | Baseline input tok | Treatment input tok | Input delta | Baseline output tok | Treatment output tok | Output delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Original weak-scenario audit | 16404.33 | 18799.00 | +2394.67 | 6.00 | 6.00 | +0.00 | 844.93 | 986.47 | +141.53 |
| Preflight ceiling redesign | 8416.60 | 12795.20 | +4378.60 | 6.00 | 6.00 | +0.00 | 379.80 | 544.60 | +164.80 |
| Grader selection boundary | 12746.80 | 13309.20 | +562.40 | 6.00 | 6.00 | +0.00 | 574.40 | 617.00 | +42.60 |
| Noisy A/B delta interpretation | 18142.20 | 14748.20 | -3394.00 | 6.00 | 6.00 | +0.00 | 784.40 | 734.80 | -49.60 |
| Metric regression separation | 17486.00 | 18968.40 | +1482.40 | 6.00 | 6.00 | +0.00 | 794.80 | 992.40 | +197.60 |
| Workflow-vs-skill boundary | 11977.20 | 14760.00 | +2782.80 | 6.00 | 6.00 | +0.00 | 531.80 | 725.20 | +193.40 |

No metric regression flag tripped in the benchmark helper. Treatment is generally slower and more verbose than baseline except for the noisy-delta scenario; these are reported separately from behavioral correctness.

## Drift / compared interpretation

- **Original weak-scenario audit:** treatment remains stable at 100% pass over 30 trials; baseline is near ceiling at 97%, so this remains a non-regression gate, not proof of broad lift.
- **Preflight ceiling redesign:** treatment now passes 5/5 on v2 after grader wording was tightened to accept semantically correct “treatment 5/5 proves nothing / zero discriminative power” language. Delta CI still crosses zero, so this is non-regression evidence only.
- **Grader selection boundary:** both baseline and treatment pass 5/5. This scenario validates the behavior but has no discriminative lift; keep it as regression protection.
- **Noisy A/B delta interpretation:** treatment passes 5/5 on v2 and correctly rejects overclaiming CI-crosses-zero deltas. Delta CI crosses zero; do not cite as lift.
- **Metric regression separation:** both conditions pass; scenario confirms metrics are surfaced as a separate risk from behavior. Treatment is +1.48s and +197.6 output tokens on average.
- **Workflow-vs-skill boundary:** treatment improves from baseline 0% pass to 100% pass, with delta +0.25 and CI [0.25, 0.25]. This is the strongest discriminative signal in the suite.

## Scenario completeness assessment

The suite is now materially more complete than the original single scenario. It covers:

1. weak/proxy assertions and `k=1` release evidence;
2. preflight ceiling and scenario redesign;
3. grader selection between structural code checks and semantic quality checks;
4. noisy A/B delta interpretation;
5. metric/cost regression separation;
6. workflow/plugin/environment boundary vs prompt-only skill evals.

Remaining limitations:

- The suite is still mostly non-regression evidence; several scenarios are near ceiling for baseline.
- It does not yet directly exercise discovered-claims / weak-assertions promotion-retirement workflow with historical grader artifacts.
- Cost metrics are duration/input/output tokens only because current raw JSONL rows do not store dollars or turn counts.

## Benchmark update

The benchmark generator now stores richer fields per eval:

- `metrics.duration_ms`, `metrics.input_tokens`, `metrics.output_tokens`
- `compared.baseline`, `compared.treatment`
- `compared.delta`, `compared.delta_ci`, `compared.verdict`, `compared.verdict_policy`
- `compared.metrics.*` with baseline/treatment means, deltas, and regression flags

## Decision

Status: `PASS` for the expanded `arc-evaluating` non-regression suite.

Do not overclaim broad discriminative lift. The reportable claim is now: `arc-evaluating` passes a broader regression suite for eval-design review behaviors, and one scenario (`workflow-vs-skill-boundary`) shows a clear treatment advantage. Add discovered-claims / weak-assertions lifecycle scenarios before claiming full coverage of the entire skill.
