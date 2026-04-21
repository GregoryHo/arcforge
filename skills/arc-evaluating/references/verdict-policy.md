# Verdict Policy Reference

The verdict is the programmatic conclusion produced by the eval harness after all trials complete. It is computed from numeric metrics — pass rate, delta, confidence intervals — never from subjective interpretation. This document defines every verdict, when it applies, and what it requires.

## Verdict Enum

| Verdict | Meaning | Conditions |
|---------|---------|------------|
| **SHIP** | Consistently passes threshold | Code-graded: pass rate = 100%. Model-graded: CI95 lower bound ≥ 0.8 (noise-tolerant) |
| **NEEDS WORK** | Partial or flaky | 60% ≤ pass rate < SHIP threshold |
| **BLOCKED** | Fundamental failure | pass rate < 60% |
| **IMPROVED** | A/B treatment significantly better | delta CI95 lower bound > 0 (i.e., positive improvement with statistical confidence) |
| **REGRESSED** | A/B treatment significantly worse | delta CI95 upper bound < 0 (i.e., negative delta with statistical confidence) |
| **NO_CHANGE** | A/B delta not statistically significant | CI95 spans zero — cannot distinguish improvement from noise |
| **INSUFFICIENT_DATA** | Too few trials for statistical verdict | k < 5 — CI95 cannot be computed reliably |

## INSUFFICIENT_DATA: Why k < 5 Triggers It

A 95% confidence interval requires enough data points for the t-distribution to produce a meaningful interval. With k = 4 or fewer trials, the interval is too wide to distinguish a real improvement from sampling noise. The verdict system enforces a minimum of k = 5 before computing CI95 for statistical verdicts (IMPROVED, REGRESSED, NO_CHANGE).

**k = 4 is not close enough.** The difference between k=4 and k=5 is not arbitrary: it is the boundary below which the t-test degrees of freedom (n-1 = 3) produce confidence intervals so wide they overlap virtually every plausible effect size. Running one more trial is the correct response, not rationalizing that k=4 is sufficient.

INSUFFICIENT_DATA is not a soft warning — it is a hard gate. When a verdict reads INSUFFICIENT_DATA:

1. The harness cannot determine whether the change is IMPROVED, REGRESSED, or NO_CHANGE.
2. Shipping based on INSUFFICIENT_DATA is equivalent to shipping without evidence.
3. Run additional trials until k ≥ 5, then re-evaluate.

## Asymmetric Delta Thresholds

IMPROVED and REGRESSED use the CI95 of the delta (Welch's t-test), not the point estimate:

- **IMPROVED**: The lower bound of the 95% CI for delta is > 0. This means even the pessimistic estimate of the improvement is positive. You need the full CI lower bound above zero, not just a positive point estimate.
- **REGRESSED**: The upper bound of the 95% CI for delta is < 0. This means even the optimistic estimate is negative — a real regression, not noise.
- **NO_CHANGE**: The CI spans zero. The effect may exist, but the data doesn't support a confident direction.

The asymmetry between IMPROVED and REGRESSED is intentional: both require the CI to be fully on one side of zero. A marginally positive delta with a CI of [-0.05, +0.20] is NO_CHANGE, not IMPROVED. The full CI lower bound must clear zero.

## Preflight Exemption

Preflight (see **REQUIRED BACKGROUND:** references/preflight.md) runs before the trial loop. INSUFFICIENT_DATA is evaluated after the trial loop completes. These are distinct phases:

- Preflight cannot produce INSUFFICIENT_DATA — it does not run trials.
- INSUFFICIENT_DATA cannot block preflight — it is evaluated after trials finish.
- A new scenario with no history passes preflight; if you then run only k=3 trials, the verdict is INSUFFICIENT_DATA.

This means you can pass preflight and still get INSUFFICIENT_DATA. Passing preflight is not permission to stop at k=3. Run the required trial count (k=5 minimum for statistical verdicts).

## When Each Verdict Applies by Grader

| Grader | Run type | Verdicts used |
|--------|----------|---------------|
| code | single run | SHIP / NEEDS WORK / BLOCKED |
| model | single run | SHIP (CI95 lower ≥ 0.8) / NEEDS WORK / BLOCKED / INSUFFICIENT_DATA |
| code | A/B | IMPROVED / REGRESSED / NO_CHANGE |
| model | A/B | IMPROVED / REGRESSED / NO_CHANGE / INSUFFICIENT_DATA |

Code-graded single runs do not produce INSUFFICIENT_DATA because pass rate is deterministic — there is no statistical interval to compute. Model-graded runs produce INSUFFICIENT_DATA when k < 5 because the CI requires enough samples to be meaningful.

## Verdict Authority

The eval harness computes all verdicts. The eval-analyzer agent does qualitative analysis only — it does not produce or override verdicts. If the harness says INSUFFICIENT_DATA, the analyzer cannot override it to IMPROVED. If the harness says REGRESSED, the analyzer's commentary does not change the verdict.

Do not conflate qualitative analysis (what the results mean, which assertions drove failure, what to try next) with verdict authority (the binary gate on shipping). Only the harness has verdict authority.

## Acting on Verdicts

| Verdict | Correct response |
|---------|----------------|
| SHIP | Ship — meet your quality bar |
| NEEDS WORK | Fix the skill/agent and re-run |
| BLOCKED | Fundamental redesign needed before re-evaluating |
| IMPROVED | A/B confirms improvement — proceed |
| REGRESSED | Revert or fix the change before shipping |
| NO_CHANGE | Change has no measurable effect — reconsider whether the change is worthwhile |
| INSUFFICIENT_DATA | Run more trials (reach k ≥ 5), then re-evaluate |
