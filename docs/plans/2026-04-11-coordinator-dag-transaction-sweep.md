# Coordinator DAG Transaction Sweep (follow-up)

**Status:** Deferred
**Context:** Follow-up to the 4-commit fix series on `feature/study-enhancement` that introduced `_dagTransaction` and applied it to the dispatch hot path (merge, expand, syncs).
**Trigger:** Run this sweep when another race is observed on a cold-path method, OR proactively before the next major dispatch-heavy release.

## Background

The qmd 2026-04-11 dispatch exposed a read-modify-write race in
`_mergeEpicsInBase` where `_loadDag` happens outside `withLock` but
`_saveDag` happens inside it. Two teammate processes would load a
stale dag snapshot, mutate their own epic, and the second save would
clobber the first.

Commits `09cbd39` → `9debfbf` fixed this by introducing `_dagTransaction(fn)`
(lock + fresh read + mutation + unlocked write, all under the same lock)
and applying it to the mutation paths in the dispatch hot path:

- `_mergeEpicsInBase` — proven reproducer in qmd
- `expandWorktrees` — parallel expansion race on different epics
- `_syncBase` — scans all worktrees and pushes to base dag
- `_syncWorktree` (to_base branch) — pushes teammate-local state to base
- `syncEpicStatusesFromBase` — pulls base state to local

## Remaining cold-path methods (this sweep)

The following `Coordinator` methods still use the old pattern
(`this._saveDag()` at the end, with `_loadDag` implicitly on first
`this.dag` access) and retain the structural race:

| Method | Line | Mutates | Why deferred from hot-path fix |
|---|---|---|---|
| `completeTask(taskId)` | ~142 | feature status, parent epic status | Not in dispatch concurrency window; usually called by hooks/CLI one task at a time |
| `blockTask(taskId, reason)` | ~172 | task status → blocked | Low concurrency; CLI-initiated |
| `cleanupWorktrees(options)` | ~383 | epic.worktree → null | Called once at end of dispatch session |

Each is a ~5-line mechanical conversion: wrap the body in
`this._dagTransaction(() => { ... })` and remove the trailing
`this._saveDag()` call.

## Test approach

Mirror the pattern in `tests/scripts/coordinator-merge-race.test.js`
and `coordinator-expand-race.test.js`:

1. Set up a tempdir repo with `git init` + a dag.yaml containing 2+ tasks.
2. Instantiate two `Coordinator`s on the same root.
3. Force both to lazy-load their dag (triggering `_loadDag` upfront).
4. Call the target method directly on each (not the public API, to
   avoid any delegation path that would auto-refresh).
5. Assert both mutations persist on disk after the second save.

Each method needs its own race test; one per commit is OK.

## Do NOT include in this sweep

- **`_runGit` / `_runSubprocess`** — not DAG mutations, don't touch
  the lock. Leave alone.
- **Read-only methods** (`status`, `nextTask`, `parallelTasks`,
  `taskContext`, `rebootContext`) — no mutation, no write race. Leave
  alone even though they access `this.dag`.
- **`_syncWorktree` from_base branch** — reads base dag, writes to
  local `.arcforge-epic` marker file (not the local dag.yaml).
  Slightly stale reads are tolerable for sync.
- **`expandWorktrees`'s projectSetup/verify blocks** — intentionally
  run OUTSIDE the transaction because `npm install` and full test
  suites can take minutes and would block every concurrent dispatch
  operation if held under lock. This is already correct in the hot-
  path fix and should stay that way.

## Commit plan (one branch, 3 small commits)

1. `fix(coordinator): serialize completeTask dag transaction` + test
2. `fix(coordinator): serialize blockTask dag transaction` + test
3. `fix(coordinator): serialize cleanupWorktrees dag transaction` + test

Keep each surgical to one method. If any turn out to have subtler
structure (e.g. `completeTask` cascades to parent epic status), take
the time to add tests for the cascade behavior — don't just blanket-
wrap and hope.

## When to actually do this

Not urgent. The cold-path methods have the structural vulnerability
but haven't manifested in any observed incident. Good triggers to
schedule the sweep:

- Another concurrency bug surfaces on one of these methods (then at
  least fix that one immediately, bundle the rest).
- A user adds parallel automation on top of arcforge that rapidly
  calls `completeTask` or `cleanupWorktrees` (e.g. a hook that
  auto-completes features).
- Preparing a release called out as "dispatch reliability" improvements.

Until then, the hot-path fix covers the 80% case and keeps the PR
scope reviewable.
