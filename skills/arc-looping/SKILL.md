---
name: arc-looping
description: Run an autonomous unattended loop that executes DAG tasks across sessions without human intervention. Use when walk-away execution is needed; for a present lead monitoring epic teammates use arc-dispatching-teammates instead.
category: orchestration
status: promoted
---

# arc-looping

Run arcforge workflows overnight without human intervention. Each iteration spawns a fresh Claude session; DAG + git persist state across sessions.

**Core principle:** Fresh session per task + file-based state = reliable cross-session execution with full auditability.

## When to Use

You have a verified DAG whose tasks can run unattended (no per-task human judgment).

**vs. arc-agent-driven:** that skill runs subagents within ONE session (shared
context, human available); arc-looping spawns a fresh session per task
(cross-session, unattended). Need human judgment per task within a session →
arc-agent-driven; need a human checkpoint → arc-executing-tasks; no DAG yet →
arc-planning first.

## Loop Patterns

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
# Sequential (default, safest) — one task at a time, stop on failure
node "${ARCFORGE_ROOT}/scripts/cli.js" loop --pattern sequential --max-runs 20
# DAG (parallel-aware) — parallelTasks() finds independent epics, continues past failures
node "${ARCFORGE_ROOT}/scripts/cli.js" loop --pattern dag --max-runs 50
# Scoped to one epic; add --max-cost to bound spend
node "${ARCFORGE_ROOT}/scripts/cli.js" loop --epic epic-001 --pattern sequential --max-runs 20
```

Sequential is best for linear/dependent task lists and first-time use; DAG for
independent epics, large DAGs, and overnight runs. Add `--reset` to archive prior
state and start fresh (see Resume vs Reset).

## Before Starting

1. **DAG must exist** — run `arc-planning` first to create `specs/<spec-id>/dag.yaml`. In multi-spec repos pass `--spec-id <id>`; cross-spec loops are unsupported.
2. **Verify baseline** — `npm test` to confirm a clean state.
3. **Choose pattern** — sequential for safety, DAG for throughput.
4. **Set limits** — `--max-runs` and `--max-cost` to bound execution.

## Worktree Awareness

**Run loops from the project root**, not from inside a worktree. In a worktree
(`.arcforge-epic` present) the loop auto-detects the epic and spec from the marker
(`spec_id` field) and scopes to that spec's `dag.yaml` — but project-root
`--pattern dag` is the correct approach for multi-epic execution (it handles
parallelism internally via `parallelTasks()`).

**Never run separate loops in separate worktrees** against the same spec — each
marker points back to the same `dag.yaml`, so they pick up the same tasks and do
duplicate work.

## During Execution

Each iteration: read `dag.yaml` → find the next task (via coordinator) → build a
prompt → spawn `claude -p` → on success `completeTask(taskId)`; on failure log,
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
| Sequential failure | task fails after retry → stops (sequential only) |

### Monitoring

Spawn the `loop-operator` agent to check a running loop — it reads
`.arcforge-loop.json` and reports progress (completed/remaining/failed), problems
(stalls, retry storms, cost), and a recommendation (continue/pause/intervene).

## Flag Reference

The loop's functional flags (the `loop` command's built-in help prints the live list):

| Flag | Purpose |
|------|---------|
| `--pattern` | `sequential` (default) or `dag` |
| `--max-runs` | Maximum iterations (default 50) |
| `--max-cost` | Cost ceiling in dollars (default unlimited) |
| `--epic` | Scope loop to a single epic (auto-detected in worktrees) |
| `--max-parallel` | Max concurrent epics per round in dag mode (default 5) |
| `--no-project-setup` | Skip the per-worktree installer in dag mode |
| `--task-timeout` | Per-session timeout in seconds (default 600) |
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
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
node "${ARCFORGE_ROOT}/scripts/cli.js" loop --pattern dag --max-runs 50 \
  --permission-mode acceptEdits --allowed-tools "Bash,Edit,Write,Read"
```

A task that times out with no progress is the headless permission-stall signature
— widen `--allowed-tools` or raise `--permission-mode` rather than the timeout.

## Launching Overnight

A dag loop is many sessions back-to-back — each capped at `--task-timeout` (default
600s), so wall-clock is `N × 600s`. **Never launch the loop in the foreground of a
tool-driven session**: the Bash-tool timeout kills the parent long before the loop
finishes, and the loop dies with it. Launch detached so the loop outlives the
launching shell:

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
nohup node "${ARCFORGE_ROOT}/scripts/cli.js" loop --pattern dag --max-runs 50 \
  --permission-mode acceptEdits > loop.log 2>&1 &
disown
```

Then walk away and check progress with the `loop-operator` agent — don't hold a
foreground session open waiting on it.

**If a launched loop is killed** (terminal closed without `disown`, machine sleep,
OOM): the last `.arcforge-loop.json` is left with `status: "running"` and no
`finished_at`, which keeps the SDD ratify gate closed. This self-heals — the gate
keys off the state file's mtime and reopens once the heartbeat is stale (30 minutes
with no write). To clear it immediately, start the next run with `--reset` or run
the ratify command after the staleness window.

**Plugin root:** under Claude Code the SessionStart hook exports `ARCFORGE_ROOT`, so
the blessed `node "${ARCFORGE_ROOT}/scripts/cli.js"` form works as-is. On platforms
with no SessionStart hook (or any detached shell where the hook env didn't
propagate), the `: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"` fallback header
resolves it — the `:=` only assigns when unset, so the hook value still wins. See
`docs/guide/cli-invocation.md` for the full resolution rules.

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

1. **arc-verifying** — confirm all requirements are met and tests pass across the completed work.
2. **arc-finishing** — its Step 0 detects the `.arcforge-epic` marker and auto-selects the epic close-out path; from a plain project root it runs the standard finish. This is the single finishing handoff — there is no separate epic-finishing skill.

## Red Flags

**Never:**
- Run loops without a verified DAG, or without `--max-runs` on unfamiliar projects
- Launch a dag loop in the foreground of a tool-driven session — detach it (see Launching Overnight)
- Ignore stall detection — it means something is fundamentally wrong
- Skip monitoring for loops > 10 iterations
- Run separate loops in separate worktrees — causes duplicate work

**If a loop is failing:** check `.arcforge-loop.json` errors (same error repeating?),
`specs/<spec-id>/dag.yaml` (blocked tasks?), `npm test` (project broken?), and git
log (commits landing?). Ratify gate stuck after a killed loop — `status: "running"`
— wait out the 30-minute staleness window or start the next run with `--reset`.

## Integration

- **Before:** arc-planning creates the dag.yaml the loop executes.
- **Works with:** loop-operator agent (monitors running loops), arc-evaluating (evals between iterations). arc-compacting is not needed — each iteration is a fresh session.
- **After:** arc-verifying, then arc-finishing (see After the Loop).
