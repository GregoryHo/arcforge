---
name: executing
description: Break work into a checkbox task list and run it to completion. Use when a change needs more than one step, when a task list is already waiting to be executed, or when you are picking between working alongside the user and running unattended.
argument-hint: "[task list file]"
---

# Executing

Two things happen here: the work gets written down as a task list, and the list
gets run. Both halves lean on the same rule — **the list file is the state**.

## The list is the only progress record

Your context does not survive a compaction, a new session, or a handoff to a
fresh subagent. A file in the repository survives all three, so completion is
recorded there and nowhere else.

That means: no second ledger file, no "done so far" summary that outlives the
turn, no todo tool standing in as the source of truth. A todo tool is fine as a
scratchpad for the current turn; it is not the record. If two places can
disagree about what is finished, one of them eventually will, and the expensive
failure — redoing work that was already done — comes from believing the wrong
one.

## Format

```markdown
# Tasks: parser rewrite

> arcforge task list v1 — status markers: `[ ]` pending, `[~]` in-progress,
> `[x]` done, `[!]` blocked. Every task has a stable id (`T1`, `T2`, …) that is
> never renumbered or reused. An indented `verify:` line is the command that
> proves the task done; a `note:` line explains a block. Edit markers in place —
> this file is the only state.

- [x] T1 — Write the failing test for the header parser
  - verify: `npm run test:scripts`
- [~] T2 — Implement the parser
- [ ] T3 — Wire it into the loop
  - verify: `npm test`
- [!] T4 — Publish the package
  - note: registry credentials are not available in this environment
```

Rules that are not negotiable, because a reader with no context depends on them:

- The banner line stays. It is how a fresh worker learns the notation.
- Ids are stable. A deleted task does not renumber its neighbours; gaps are fine.
- Four markers, no fifth. `[!]` **requires** a `note:` saying why — a block with
  no stated reason is unactionable.
- Markers are edited in place. Everything else in the file — a human's comments,
  ordering, extra prose — is left byte for byte alone.
- No nested checkboxes. Sub-structure belongs in its own list.

## Writing the list

One task is one behavior, small enough to finish and check in a few minutes.

| Too vague | Just right |
|---|---|
| "Set up auth" | "Add the `User` dataclass to `src/types.py`" |
| "Add tests" | "Write `test_login_rejects_bad_password` in `tests/auth/`" |
| "Implement login" | "Check the password hash inside `login()`" |

Give every task a `verify:` line whenever a command can decide it. That line is
what makes the list runnable by someone who was not in the conversation — it
replaces your judgment about whether a task is finished with a command that
answers the same question. A task with no command that could ever prove it done
is usually a task that is still too vague.

If the goal itself is not settled yet, stop writing tasks and use
`/brainstorming` first. A list built on an unsettled design just schedules the
rework.

## Pick a mode before the first task

| | Attended | Unattended |
|---|---|---|
| Who runs the tasks | you, in this session | subagents, or a loop with nobody watching |
| Between tasks | you report and wait | you continue on the file's evidence alone |
| Fits when | tasks carry judgment calls, the design may shift, the blast radius is wide | tasks are mechanical, well-scoped, and independently verifiable |
| Costs | the user's attention, one checkpoint at a time | tokens and commits while nobody is looking |

Ask which one the user wants; do not assume. If the work is going to run
unattended, say so out loud before it starts — that is the point at which the
user can still say no.

**Attended.** Work a small batch (three tasks is a good default), then report:
what landed, what the verify commands said, what you want a decision on. Then
wait. A checkpoint the user never gets a chance to answer is not a checkpoint.

**Unattended.** Mark `[~]` before starting a task and `[x]` only after its
verify passes, so a crash leaves the file honest. Nobody is going to answer a
question, so a task that needs a decision is `[!]` with the question in its
`note:`, not a guess. Handing individual tasks to subagents is a dispatch
problem — the `dispatching` skill covers fan-out, isolation, and model tier. If
the user wants the whole list driven unattended in a loop, that is theirs to
start, not yours.

## Running a task

1. Mark it `[~]`.
2. Do the work. Implementation code goes through `/tdd`.
3. Run the `verify:` command and read the output.
4. Passed → mark `[x]` and commit. Failed → fix it and rerun, or mark `[!]`
   with a `note:` naming the failure. Never `[x]` on a command you did not run
   or whose output you did not read.
5. Move on. One commit per task keeps the rollback cheap.

## Resuming

Read the list; do not reconstruct progress from memory or from what feels
familiar.

- `[x]` — done. Do not redo it, do not "quickly verify by rewriting it".
  Re-running its verify command is fine; re-implementing it is not.
- `[~]` — someone was interrupted mid-task. Reconcile against `git log` and the
  working tree before deciding whether to continue or restart it.
- `[!]` — read the `note:`. If the block is gone, clear it back to `[ ]`.

## Rationalizations

| What you are about to say | What is actually true |
|---|---|
| "I'll update the file at the end" | The end is exactly when the context is gone. |
| "It obviously works, no need to run verify" | Then running it costs nothing and proves it. |
| "The test is flaky, close enough" | `[!]` with a note. A flaky verify is a finding, not a pass. |
| "I'll track this in my todo list instead" | That list dies with the turn. The file does not. |
| "Re-doing task 2 is faster than reading git log" | It is not, and it can silently revert task 3. |
| "The user is away, I'll pick the reasonable option" | Blocked plus a written question. Guessing unattended is how a run goes wrong quietly. |
| "One big commit at the end is cleaner" | It removes the only cheap rollback point you had. |

## Before claiming the list is done

- [ ] Every task is `[x]` or `[!]` — none silently skipped
- [ ] Every `[x]` had its verify command run, with the output read
- [ ] Every `[!]` carries a `note:` a stranger could act on
- [ ] The file on disk matches reality, not your summary of it
- [ ] The work is committed

Then hand off: `/code-review` for the diff, `/finishing` for the branch.
