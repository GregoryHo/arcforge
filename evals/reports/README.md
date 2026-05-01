# Eval Reports

This directory is for curated, human-readable summaries of important eval or benchmark runs.

Use reports when a raw run in `evals/results/` should be preserved for PR review or future comparison without committing bulky transcripts and JSONL artifacts.

Recommended report content:

- date and commit SHA
- scenarios or benchmark suite covered
- exact command(s)
- runner/model details when relevant
- pass/fail table
- interpretation and follow-up actions

Raw run artifacts remain in `evals/results/` and are ignored by git by default.
