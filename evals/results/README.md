# Eval Results

This directory is for raw eval run output produced by `arc eval run` and `arc eval ab`.

Raw outputs are intentionally ignored by git:

- JSONL trial records
- transcripts
- grading artifacts
- temporary run directories

If a run is important enough to preserve in reviewable history, summarize it in a curated report instead of committing the raw output. Include:

- scenario or benchmark name
- commit SHA
- command used
- model/runner details when relevant
- pass/fail summary
- notable failures or interpretation

Generated raw files should stay local unless a reviewer explicitly needs an artifact.
