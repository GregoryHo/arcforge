---
name: arc-looping
description: Run an autonomous unattended loop that executes task-list tasks across sessions without human intervention. Use when walk-away execution is needed; for a present lead monitoring epic teammates use arc-dispatching-teammates instead.
category: orchestration
status: promoted
---

# arc-looping

Run arcforge workflows overnight without human intervention. Each iteration spawns a fresh Claude session; the task list + git persist state across sessions.

**Core principle:** Fresh session per task + file-based state = reliable cross-session execution with full auditability.

## When to Use

You have a verified task list whose tasks can run unattended (no per-task human judgment).

**vs. in-session execution:** `executing` runs its tasks within ONE session (shared
context, human available); arc-looping spawns a fresh session per task
(cross-session, unattended). Need human judgment per task within a session →
executing (unattended mode); need a human checkpoint → executing (attended mode);
no task list yet → executing writes one first.

## Loop Patterns

```bash
# One task at a time from the task list, stop on failure
arcforge loop --tasks tasks.md --max-runs 20
# Add --max-cost to bound spend
arcforge loop --tasks tasks.md --max-runs 50 --max-cost 20
```

Add `--reset` to archive prior state and start fresh (see Resume vs Reset).

## Before Starting

1. **Task list must exist** — run `executing` first to produce the markdown checkbox task list the loop consumes.
2. **Verify baseline** — `npm test` to confirm a clean state.
3. **Set limits** — `--max-runs` and `--max-cost` to bound execution.

## Worktree Awareness

**Run loops from the project root**, not from inside a worktree, unless the task
list itself belongs to that worktree.

**Never run separate loops against the same task list** — they pick up the same
tasks and do duplicate work.

## During Execution

Each iteration: read the task list → find the next unchecked task → build a
prompt → spawn `claude -p` → on success mark the task done; on failure log,
retry once, then block the task. Repeat until all done, max-runs hit, or a stop
condition fires.

### Stop Conditions

| Condition | What Happens |
|-----------|-------------|
| All tasks complete | status "complete" |
| Max runs reached | status "max_runs" |
| Cost limit hit | status "cost_limit" |
| Stall detected | no progress in 2+ iterations → stops |
| Retry storm | same error 3+ times → stops |
| Task failure | task fails after retry → stops |

### Monitoring

To check a running loop, read `.arcforge-loop.json`: progress
(completed/remaining/failed), problems (stalls, retry storms, cost), and whether
to continue, pause, or intervene.

## Flag Reference

The loop's functional flags (the `loop` command's built-in help prints the live list):

| Flag | Purpose |
|------|---------|
| `--tasks` | Path to the markdown checkbox task list |
| `--max-runs` | Maximum iterations (default 50) |
| `--max-cost` | Cost ceiling in dollars (default unlimited) |
| `--task-timeout` | Per-session timeout in seconds (default 600) |
| `--model` | Model for spawned sessions |
| `--permission-mode` | Pass `--permission-mode` through to spawned sessions |
| `--allowed-tools` | Pass `--allowed-tools` through to spawned sessions |
| `--verify-cmd` | Acceptance floor run after each session exits 0; non-zero fails the task |
| `--verifier` | After the floor passes, spawn an independent verifier agent (opt-in) |
| `--max-retries` | Verifier feedback retries before blocking (default 2) |

## Headless Permissions

Spawned sessions run as headless `claude -p` — they **cannot** answer interactive
permission prompts. A session that hits one runs silently until `--task-timeout`
kills it, surfacing as a timeout, not a permission error. No code path ever
auto-appends `--dangerously-skip-permissions`; permission posture is yours to set.

Pre-authorize so unattended sessions never block — `--permission-mode` and
`--allowed-tools` pass straight through to each spawned session:

```bash
arcforge loop --tasks tasks.md --max-runs 50 \
  --permission-mode acceptEdits --allowed-tools "Bash,Edit,Write,Read"
```

A task that times out with no progress is the headless permission-stall signature
— widen `--allowed-tools` or raise `--permission-mode` rather than the timeout.

## Launching Overnight

A loop is many sessions back-to-back — each capped at `--task-timeout` (default
600s), so wall-clock is `N × 600s`. **Never launch the loop in the foreground of a
tool-driven session**: the Bash-tool timeout kills the parent long before the loop
finishes, and the loop dies with it. Launch detached so the loop outlives the
launching shell:

```bash
nohup arcforge loop --tasks tasks.md --max-runs 50 \
  --permission-mode acceptEdits > loop.log 2>&1 &
disown
```

Then walk away and check progress by reading `.arcforge-loop.json` — don't hold a
foreground session open waiting on it.

**If a launched loop is killed** (terminal closed without `disown`, machine sleep,
OOM): the last `.arcforge-loop.json` is left with `status: "running"` and no
`finished_at`. Start the next run with `--reset` to clear it.

## State File

`.arcforge-loop.json` tracks loop state across iterations (`iteration`,
`completed_tasks`, `failed_tasks`, `errors[]`, `verifier_attempts[]`, `total_cost`,
`last_progress_at`, `status`, `finished_at`). A fresh `run_id` is stamped per run
and scopes stall/retry-storm counters, so resuming isn't penalized by a prior run's
failures. Field-by-field layout with a sample record: `references/state-file.md`.

## Resume vs Reset

Both reuse the same `.arcforge-loop.json`; the difference is whether prior history carries forward.

- **Resume (default):** re-run the same loop command with no `--reset`. The state file loads, `iteration` keeps climbing, `completed_tasks` are not re-run, and a fresh `run_id` zeroes the new run's stall/retry-storm counters.
- **Reset:** `--reset` archives the current state to `.arcforge-loop.archive/<started_at>.json` and starts fresh from `iteration: 0`. Use it when the prior run is stale or wedged, or for a clean audit boundary. `--reset` is a deliberate pre-run action — never mid-run.

## After the Loop

Hand off in order:

1. **`/code-review`** — confirm all requirements are met and tests pass across the completed work.
2. **arc-finishing** — the single finishing handoff; there is no separate epic-finishing skill.

## Red Flags

**Never:**
- Run loops without a verified task list, or without `--max-runs` on unfamiliar projects
- Launch a loop in the foreground of a tool-driven session — detach it (see Launching Overnight)
- Ignore stall detection — it means something is fundamentally wrong
- Skip monitoring for loops > 10 iterations
- Run separate loops against the same task list — causes duplicate work

**If a loop is failing:** check `.arcforge-loop.json` errors (same error repeating?),
the task list (blocked tasks?), `npm test` (project broken?), and git
log (commits landing?).

## Integration

- **Before:** executing creates the task list the loop executes.
- **Works with:** `/evaluating` (evals between iterations). compaction is not needed — each iteration is a fresh session.
- **After:** `/code-review`, then arc-finishing (see After the Loop).
