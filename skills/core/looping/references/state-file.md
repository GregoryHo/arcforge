# `.arcforge-loop.json` state file

The loop's own bookkeeping, rewritten after every iteration and again when the
run ends. It lives in the project root, beside the task list it is working
through — the list holds task state, this file holds run state, and neither
duplicates the other.

`pattern`, `max_runs`, `max_cost`, and a fresh `run_id` are stamped at the start
of each run. Stall and retry-storm detection count only the current run's errors
(scoped by `run_id`), so a resumed loop is not stopped on entry by a previous
run's failures.

`status` is `running` until the run ends. A file whose `status` is still
`running` while `finished_at` is `null` and nothing is progressing is a killed
run, not a live one — start the next run with `--reset`.

```json
{
  "iteration": 12,
  "pattern": "tasks",
  "started_at": "2026-03-17T22:00:00Z",
  "max_runs": 20,
  "max_cost": 10,
  "run_id": "a1b2c3d4-0000-0000-0000-000000000000",
  "run_started_iteration": 0,
  "tasks_file": "tasks.md",
  "completed_tasks": ["T1", "T2"],
  "failed_tasks": ["T3"],
  "errors": [
    {
      "task_id": "T3",
      "iteration": 11,
      "error": "verify-cmd failed: 1 failing",
      "timestamp": "2026-03-17T23:10:00Z",
      "attempt": 2,
      "run_id": "a1b2c3d4-0000-0000-0000-000000000000"
    }
  ],
  "verifier_attempts": [
    {
      "task_id": "T2",
      "iteration": 6,
      "attempt": 1,
      "verdict": "PASS",
      "feedback": "",
      "cost_usd": 0.04,
      "timestamp": "2026-03-17T22:40:00Z",
      "run_id": "a1b2c3d4-0000-0000-0000-000000000000"
    }
  ],
  "total_cost": 3.62,
  "last_progress_at": "2026-03-17T23:15:00Z",
  "status": "running",
  "finished_at": null
}
```
