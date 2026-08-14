---
name: looping
description: Start and supervise an unattended loop that works a task list across fresh sessions.
disable-model-invocation: true
---

# Looping

One task per iteration, each in its own fresh session. Nothing carries over
between them except files: the task list holds what is left, git holds the work,
and `.arcforge-loop.json` holds the loop's own bookkeeping. A session can die, a
machine can sleep, and the next iteration still knows where it was — and nobody
is watching. Every limit you want has to be a flag typed before you walk away.

## Step 1 — The list exists before the loop does

The loop's only task source is a markdown checkbox task list passed with
`--tasks`. There is no second task format and no implicit default file.

```markdown
> arcforge task list v1

- [ ] T1 — Extract the tokenizer into its own module
  - verify: `npm test`
- [ ] T2 — Wire the tokenizer into the reader
  - verify: `npm test`
```

Each task is one unattended session's worth of work, written so a reader with no
context can act on it. Its `verify:` line is that task's acceptance floor: the
loop runs it after the session exits and refuses to mark the task done when it
fails. A task without one falls back to the run-wide `--verify-cmd`; a task with
neither is accepted on the session's exit code alone, which only says the session
ended, not that the work happened.

Run the project's own suite before launching. The loop cannot tell a baseline
that was already broken from a task that broke it, so it will spend a session,
fail the floor, retry, and block a task that was never the problem.

- [ ] Done when the list exists and parses, every task carries a `verify:` line or the run supplies `--verify-cmd`, and the suite has been run here and is green.

## Step 2 — Fix the stop conditions before launching

Three ceilings are yours to set — `--max-runs` bounds iterations (default 50),
`--max-cost` bounds dollars across the whole run (default: no ceiling), and
`--task-timeout` bounds one session's seconds (default 600). The rest fire on their
own. "Let it get as far as it can overnight" is the request to decline, not the
instruction to follow: guessing a ceiling too low costs one more run, while having
no ceiling is unbounded by definition and the loop is spending money on a
repository nobody is reading.

What stops a run, and what it records:

| Condition | Status |
|---|---|
| every task done | `complete` |
| `--max-runs` reached | `max_runs` |
| `--max-cost` reached | `cost_limit` |
| no progress across iterations | `stalled` |
| the same error repeating | `retry_storm` |
| a task failed after its retry | `failed` |
| nothing runnable, some blocked | `blocked` |

- [ ] Done when both `--max-runs` and `--max-cost` are on the command line.

## Step 3 — Pre-authorize, then detach

Spawned sessions are headless and cannot answer a permission prompt. One that
hits a prompt sits silently until `--task-timeout` kills it, and the run reports
a timeout rather than a permission problem. No code path auto-appends
`--dangerously-skip-permissions`; the posture is yours to set, and
`--permission-mode` and `--allowed-tools` pass straight through to every spawned
session. A loop is also many sessions back to back, so its wall clock is
iterations × `--task-timeout`: started in the foreground of a tool-driven session
it dies with that session's own command timeout, long before it finishes.
Detach it:

```bash
nohup arcforge loop --tasks tasks.md --max-runs 20 --max-cost 15 \
  --permission-mode acceptEdits --allowed-tools "Bash,Edit,Write,Read" \
  > loop.log 2>&1 &
disown
```

A task that burns its whole timeout having produced nothing is the permission
stall signature. Widen `--allowed-tools` or raise `--permission-mode` — raising the
timeout only makes the stall last longer.

- [ ] Done when the loop is running detached, and the user has been told the log path and the state file to watch.

## The verifier gate, and when it earns its cost

`--verify-cmd` is a command; `--verifier` is a second opinion. They stack, and
only the first is free. `--verify-cmd "<command>"` is the run-wide acceptance
floor for tasks with no `verify:` line of their own; it runs as an argument
array, never through a shell, so anything needing a pipe or a redirect belongs in
a script you point it at.

`--verifier` spawns an independent agent after the floor passes, to judge whether
the task was done rather than merely made to pass. On FAIL its feedback goes back
verbatim into a retry, up to `--max-retries` (default 2), after which the task is
blocked; a verdict that cannot be parsed blocks too, and is never read as a pass.

Turn it on when the floor cannot see the thing that matters: a task whose test the
same session wrote, a refactor whose suite passes unchanged either way, anything
where "the suite is green" and "the task is done" are two different claims. Leave
it off when the `verify:` line already settles the question — every gate is another
session, and its retries are sessions too.

## Checking on it

`.arcforge-loop.json` in the project root is the loop's own record: the current
`iteration`, `completed_tasks`, `failed_tasks`, `errors[]`, `verifier_attempts[]`,
`total_cost`, and `status`. Read it instead of inferring progress from the tail of
the log. Field by field, with a sample record: `references/state-file.md`. The
task list is the other half, and it is the half that decides what runs next: once
the loop starts it owns every marker in that file, so do not edit statuses by hand
while it is running, and never point two loops at one list, or they take the same
task and do it twice.

## Picking it back up

Resume and reset share that same state file; the difference is whether the
previous run's history carries forward.

**Resume** is the default — re-run the same command with no `--reset`. `iteration`
keeps climbing, completed tasks are not re-run, and a fresh run id zeroes this
run's stall and retry-storm counters, so an earlier run's failures do not stop the
new one on entry.

**`--reset`** archives the current state and starts from zero — a deliberate
pre-run action, never a mid-run one. A loop that was killed rather than finished
(terminal closed, machine asleep, process reaped) leaves `status` at `running`
with no `finished_at`; that record is stale, not a live loop, so the next run
needs `--reset`.

## When it stops

Read the state file, then the task list: what completed, what is blocked, and the
reason the loop recorded on each blocked task. Report that before proposing
anything. Then `/code-review` over the whole body of work — the loop accepted tasks
one at a time and never looked at them together — and `/finishing` for the branch.

## Red flags

| About to | Instead |
|---|---|
| Launch with no run or cost ceiling because that is what was asked for | Set both — an overnight unattended run is the case that most needs them |
| Start the loop in the foreground of a tool-driven session | Detach it, or the parent's command timeout takes it down mid-run |
| Launch against a list you have not read, or a suite that is not green now | Both first — a broken baseline blocks tasks that were never the problem |
| Raise `--task-timeout` because sessions keep timing out having done nothing | That is the headless permission stall — widen `--allowed-tools` instead |
| Edit task markers by hand while the loop is running | The loop owns every marker in that file from launch onward |
| Start a second loop over the same task list | Both take the same task and do it twice |
| Re-run a killed loop without `--reset` | Its stale `running` state is still on disk and still counts |
| Restart after a stall without reading the errors | A stall means no progress across iterations; the cause is upstream of the loop |
