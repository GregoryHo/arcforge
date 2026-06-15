# Wrap-Up Sequence

This reference expands SKILL.md Step 8. SKILL.md keeps the three-action
outline; procedural detail, failure handling, and rationale live here.

## Why the order matters

Step 8 has a specific ordering: **Final Report → cleanup accepted
worktrees → shut down teammates → `TeamDelete`**. Reordering breaks
things:

- **Report before cleanup** — the user needs to see the report before
  you start removing artifacts. If you cleanup first and the report
  fails to emit (context truncation, token limit), the user has no
  record of what happened AND no worktrees to inspect. Report first.
- **Cleanup before `TeamDelete`** — you might think `TeamDelete` closes
  everything in one step, but it only tears down the team runtime, not
  the worktree directories. Cleanup is a separate operation that only
  the lead can safely run (see "Why the lead runs cleanup" below).
- **Shutdown before `TeamDelete`** — per Agent Teams docs: "When the
  lead runs cleanup, it checks for active teammates and fails if any
  are still running, so shut them down first."

## 8a — Emit the Final Report

This is the user-facing hand-off, emitted after every dispatched epic
reaches a terminal state (accepted or permanently failed). Use this full
format:

```
🏁 Dispatch session complete

Dev branch: <branch-name> (current HEAD is the deliverable)

Epics:
  ✅ epic-yaml-output  — accepted on attempt 1
       spec-reviewer: PASS (10/10 ACs verified)
       verifier:      PASS (42/42 tests, exit 0)
  ✅ epic-stats        — accepted on attempt 2 (retry 1)
       Attempt 1 rejected: getStats() missing perCollection breakdown
       (fr-stats-001 AC #5). Retry fixed it.
       spec-reviewer: PASS (5/5 ACs)
       verifier:      PASS (38/38 tests, exit 0)
  ❌ epic-history      — permanently failed after 4 attempts (3 retries)
       Final rejection: query_history migration fails on existing DBs.
       Last spec-reviewer: FAIL (fr-hist-002 AC #3)
       Worktree: <absolute-path> (retained for debugging)

Spec defects recorded for follow-up:
  - epic-history, epic-bookmark: spec references src/db.ts but codebase
    convention is src/store.ts — override-accepted, spec needs revision
  - (or: none observed)

Cleanup performed:
  - Accepted worktrees removed: epic-yaml-output, epic-stats
  - Team torn down (TeamDelete)
  - Failed worktrees retained: epic-history

Next actions you may consider:
  - Inspect dev branch HEAD: git log --oneline <branch-name>
  - Promote successful work: merge/cherry-pick to main
  - Debug the failed epic: /arc-debugging on epic-history
  - Discard the session: git branch -D <branch-name>
```

**Required evidence per accepted epic** — `spec-reviewer: PASS (<X>/<Y>
ACs verified)` and `verifier: PASS (<X>/<Y> tests, exit 0)`. The evidence
lines are not optional decoration — they are the self-audit that catches
inline rationalization. **Missing evidence = you skipped Step 6.** If you
cannot fill them in with concrete numbers from a subagent report, you did
not dispatch the subagent.

**For failed epics**, include the worktree path so the user can cd into it
without needing to derive the canonical path themselves. "Next actions"
lists user options — you don't execute them.

## 8b — Clean up accepted worktrees

From the project root (NOT from inside a teammate's worktree):

```bash
node "${ARCFORGE_ROOT}/scripts/cli.js" cleanup <epic-id-1> <epic-id-2> ...
```

Pass only epic IDs whose acceptance check passed. The CLI's
`cleanupWorktrees()` with explicit `epicIds` bypasses the default
status filter and removes the worktree directories directly, then runs
`git worktree prune` once.

### Why the lead runs cleanup, not teammates

Three reasons:

1. **Race condition with the DAG.** The DAG's `status` field is
   updated when each epic is merged. If teammate A runs `cleanup` right
   after its merge, it sees the default filter `status === COMPLETED`
   and tries to remove ALL completed epics' worktrees — including
   teammate B's and C's, which may still be in use. Explicit epic-id
   cleanup avoids the filter, but it has to be called from outside the
   worktrees being cleaned.
2. **cwd conflict.** `fs.rmSync` cannot remove a directory that
   contains the current working directory. A teammate running
   `cleanup` on its own worktree will fail or behave erratically
   depending on the node version.
3. **Agent Teams docs explicit guidance.** Quoting:
   > "Always use the lead to clean up. Teammates should not run
   > cleanup because their team context may not resolve correctly,
   > potentially leaving resources in an inconsistent state."

### Failed epics stay

Do **not** pass permanently-failed epic IDs to cleanup. The user may
need to `cd` into the worktree to inspect the failed code, read the
teammate's test output, or manually revert the commits on the dev
branch. The final report already tells them which worktrees were
retained and where.

If the user later decides to discard a failed epic, they can run
cleanup manually — `node "${ARCFORGE_ROOT}/scripts/cli.js" cleanup <failed-epic-id>`
from the project root.

## 8c — Shut down teammates, then `TeamDelete`

### Step 1: Shut down each teammate

Per Agent Teams docs, graceful shutdown:

> "To gracefully end a teammate's session: `Ask the researcher
> teammate to shut down`. The lead sends a shutdown request. The
> teammate can approve, exiting gracefully, or reject with an
> explanation."

In practice, a teammate that finished its epic and ran `arc-finishing-epic`
is already idle and will approve shutdown immediately. Iterate over
the team members; shut down each one.

### Step 2: `TeamDelete`

Call the `TeamDelete` tool with the team name. This:

- Closes the tmux panes associated with team members
- Releases the team's runtime state (mailbox, task list, team config)
- Removes the team's entry from `~/.claude/teams/`

**Without `TeamDelete`:**

- Tmux panes remain as orphans. The next time the user opens their
  terminal, they see 5–7 idle panes from the completed dispatch.
- The team config at `~/.claude/teams/<team-name>/` persists
  indefinitely, accumulating across sessions.
- On a future session with the same team name (unlikely but possible),
  stale state can cause dispatch failures.

### If `TeamDelete` fails with "active teammates"

Agent Teams docs explicitly say cleanup fails if any teammate is
still running. If you see this error:

1. Check which teammate is still active (read team config or check
   tmux pane state).
2. If the teammate is truly idle but runtime thinks otherwise, the
   shutdown step in 8c.1 didn't complete — re-ask that specific
   teammate to shut down.
3. If the teammate is genuinely still running (probably a retry that
   hasn't finished), you should not be at Step 8 yet — go back to
   Step 5 (monitor) and wait for terminal state.

## Known limitation: dag.yaml is race-prone during active dispatch

dag.yaml is a shared mutable file in the base worktree. During an
active dispatch, it can be read/written by:

- The lead (editing status, adding epics, etc.)
- Each teammate's `arcforge sync --direction to-base`
- Each teammate's `arcforge merge` (via the Coordinator)
- `arcforge expand` for queued epics
- `arcforge cleanup` at wrap-up

The `_dagTransaction` helper serializes Coordinator-to-Coordinator races
via file locking. But it does **NOT** protect against:

1. **Lead editing dag.yaml directly in a text editor** while a
   Coordinator write is in flight. The text editor doesn't know about
   the lock file.
2. **Non-Coordinator scripts** that write dag.yaml directly (e.g., a
   custom hook that updates status via `fs.writeFileSync`).

These dag.yaml conflicts during expand/cleanup/lead-edit interplay are
resolvable but can surprise a lead who doesn't expect the file to be a
shared concurrent resource.

### Practical advice for the lead

- **Avoid manually editing dag.yaml while teammates are actively
  finishing.** If you need to change a status, use `arcforge` CLI
  commands (which go through the Coordinator and respect the lock).
- **If you must hand-edit**, save, then immediately run
  `arcforge status` to verify the file parses correctly. A malformed
  dag.yaml will break every subsequent Coordinator operation.
- **During the monitoring phase (Step 5)**, the lead's main
  interaction with the dag is read-only (`arcforge status --json`).
  Reads are safe and don't race.
