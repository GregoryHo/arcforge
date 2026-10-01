# Eval Reports

This directory is for curated, human-readable summaries of important eval or benchmark runs.

Use reports when a raw run in `evals/results/` should be preserved for PR review or future comparison without committing bulky transcripts and JSONL artifacts.

Recommended report content:

- date and commit SHA
- scenarios or benchmark suite covered
- claim type for each scenario/report:
  - `discriminative-lift` — A/B evidence that treatment beats baseline
  - `non-regression` — treatment still satisfies the contract; not a lift claim
  - `self-improvement-smoke` — learning/self-improvement path smoke coverage; not end-to-end self-evolution proof
  - `infra` — harness/plugin/session/infrastructure behavior
- exact command(s)
- runner/model details when relevant
- pass/fail table
- interpretation and follow-up actions

`arc eval report` groups scenario output by claim type and writes `claim_type` plus `by_claim_type` into benchmark JSON. A `SHIP` verdict only applies within the listed claim type; do not cite `SHIP` from non-regression, self-improvement-smoke, or infra scenarios as evidence of discriminative value lift.

Scenario authors may add a minimal metadata section when inference would be ambiguous:

```md
## Claim Type
non-regression
```

Accepted values are `discriminative-lift`, `non-regression`, `self-improvement/smoke` (normalized to `self-improvement-smoke`), and `infra`/`infra/harness`.

Raw run artifacts remain in `evals/results/` and are ignored by git by default.
