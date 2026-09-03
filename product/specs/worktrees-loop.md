# worktrees-loop — spec

> Status: shipped v6.0.0 · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose

The substrate for parallel and unattended work: isolated checkouts so several
branches (or several agents) can work at once without touching each other, and a
loop that runs a task list to completion across fresh sessions after the user
walks away. Both are stateless in the same deliberate way — git holds the work,
one markdown file holds the task state, and nothing lives in memory that a
crash, a compaction, or a closed laptop could lose.

## Scope

- **In scope:** the worktree isolation and ownership contract; the loop's
  execution model, ceilings, and verification gate; the task-list carrier.
- **Out of scope:** the task-list grammar itself — frozen in
  [`docs/decisions/task-list-format.md`](../../docs/decisions/task-list-format.md);
  the skills that drive these (`dispatching`, `looping`, `executing`,
  `finishing` — [skill-system](skill-system.md)); command flags
  (`docs/guide/worktree-workflow.md`, `docs/guide/cli-invocation.md`).

## Behavior

### Worktrees
- **B-1 Worktrees live outside the repository.** Managed checkouts go under
  `~/.arcforge/worktrees/<project>-<hash>-<name>/`, never inside the project —
  a nested worktree pollutes `git status`, test globs, and file watchers. The
  hash comes from the project's absolute path so same-named projects never
  collide. Paths are derived by the engine and reported by `worktree list`;
  nothing else constructs them by hand.
- **B-2 Removal respects ownership and dirt.** arcforge removes only what it
  created: external trees and trees another lifecycle owns are refused. A
  worktree with uncommitted changes refuses removal without `--force`, so a
  forgotten edit cannot vanish silently. Removing a worktree reclaims the
  checkout and MUST NOT delete the branch — the work survives.
- **B-3 Flags fail honestly.** A base ref passed alongside an already-existing
  branch is refused, not silently ignored — an existing branch has a history,
  and there is nothing honest for the flag to mean.

### The loop
- **B-4 One task per fresh session, files as the only memory.** Each iteration
  spawns a clean session, works one task, and ends. Nothing carries between
  iterations except what is on disk: the task list holds what is left, git
  holds the work. That is what makes a run restartable across a crash or an
  interruption — resuming is just reading the file again.
- **B-5 Every run is bounded.** Iteration, cost, and per-session-time ceilings
  cap an unattended run; an unbounded loop is not offered.
- **B-6 Done is decided by a command, not a claim.** A task's `verify:` line
  (or the run-level verify command) is executed to prove completion — the loop
  never accepts the model's self-report. An optional independent verifier adds
  a second gate: a FAIL retries with the verifier's feedback, bounded retries,
  and an exhausted or unreadable verdict **blocks** the task rather than
  passing it.

### The task list
- **B-7 One format, one owner, strict parsing.** The markdown checkbox list is
  the single task-state format, and only the engine parses it — skills never
  hand-parse the file. The grammar, the strict-parser rationale, and the
  self-description contract that keeps the file readable by a fresh subagent
  are all frozen in the format doc cited above.
- **B-8 Automation preserves the human's file.** An automated run leaves a
  human's comments, ordering, and formatting intact, and a task can never be
  marked blocked without a stated reason — the write-path guarantees behind
  both live in the frozen format doc.

## Data / domain model

Two formats, two owners. The task list is the markdown checkbox grammar frozen in
`docs/decisions/task-list-format.md` and owned by `scripts/lib/task-list.js` — four
marker states, stable ids, no nesting, and no second task-state format (B-7). Loop
run state is a separate JSON file owned by `scripts/lib/loop-state.js`, holding the
bounds of B-5 and the retry bookkeeping of B-6; it is orchestration bookkeeping,
never task state. Worktree paths are derived by `scripts/lib/worktree-paths.js` and
never constructed by hand (B-1).

## Decisions

The four-state marker set, stable ids, and no-nesting rules carry their own
"decisions worth not re-litigating" section in
`docs/decisions/task-list-format.md`. The isolation-outside-the-repo and
verify-over-self-report choices predate this log; rationale inline above.
