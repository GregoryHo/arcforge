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

Use the format in SKILL.md's "Final Report" completion block.

**Required evidence per accepted epic:**

```
  ✅ epic-<id>  — accepted on attempt <N>
       spec-reviewer: PASS (<X>/<Y> ACs verified)
       verifier:      PASS (<X>/<Y> tests, exit 0)
```

**Missing evidence = you skipped Step 6.** The evidence lines are not
optional decoration — they are the self-audit that catches inline
rationalization. If you cannot fill them in with concrete numbers
from a subagent report, you did not dispatch the subagent.

**For failed epics:**

```
  ❌ epic-<id>  — permanently failed after <N> attempts
       Final rejection: <specific reason>
       Last spec-reviewer: FAIL (<criterion>)
       Worktree retained for debugging: <absolute path>
```

Include the worktree path for failed epics so the user can cd into it
without needing to derive the canonical path themselves.

## 8b — Clean up accepted worktrees

From the project root (NOT from inside a teammate's worktree):

```bash
node scripts/cli.js cleanup <epic-id-1> <epic-id-2> ...
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
cleanup manually — `node scripts/cli.js cleanup <failed-epic-id>`
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

## Rationale recap

The whole wrap-up sequence exists because the observed baseline
(qmd 2026-04-11 dispatch) ended with the lead emitting a Final Report
and stopping. The team was never torn down, panes were never closed,
worktrees were never cleaned. The user manually discovered all three
leaks.

The fix is structural: make Step 8 explicit about the three actions,
put the detailed reasoning in this reference so the SKILL.md body
stays terse, and surface the "evidence per epic" format so the lead
self-audits whether Step 6 actually happened.
