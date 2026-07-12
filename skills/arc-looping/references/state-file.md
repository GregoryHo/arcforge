# `.arcforge-loop.json` state file

Tracks loop state across iterations. `pattern`, `max_runs`, `max_cost`, and a
fresh `run_id` are stamped at the start of each run. Stall and retry-storm
detection count only the current run's errors (scoped by `run_id`), so resuming a
loop is not penalized by a previous run's failures.

```json
{
  "iteration": 12,
  "pattern": "sequential",
  "started_at": "2026-03-17T22:00:00Z",
  "max_runs": 20,
  "max_cost": 10,
  "run_id": "a1b2c3d4-0000-0000-0000-000000000000",
  "run_started_iteration": 0,
  "completed_tasks": ["feat-001-01", "feat-001-02"],
  "failed_tasks": ["feat-002-03"],
  "errors": [
    {
      "task_id": "feat-002-03",
      "iteration": 11,
      "error": "tests failed",
      "timestamp": "2026-03-17T23:10:00Z",
      "attempt": 2,
      "run_id": "a1b2c3d4-0000-0000-0000-000000000000"
    }
  ],
  "verifier_attempts": [
    {
      "task_id": "feat-001-02",
      "iteration": 6,
      "attempt": 1,
      "verdict": "PASS",
      "feedback": "",
      "cost_usd": 0.04,
      "timestamp": "2026-03-17T22:40:00Z",
      "run_id": "a1b2c3d4-0000-0000-0000-000000000000"
    }
  ],
  "total_cost": 0,
  "last_progress_at": "2026-03-17T23:15:00Z",
  "status": "running",
  "finished_at": null
}
```
