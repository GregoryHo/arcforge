# Eval: eval-looping-stale-state-relaunch

## Scope
skill

## Target
skills/looping/SKILL.md

## Context
A Node service being migrated off a deprecated HTTP client. `tasks.md` is the
task list an unattended loop has been working through overnight, and
`.arcforge-loop.json` beside it is the loop's own run record. `loop.log` is where
the launch was redirected.

## Scenario
The user says:

> My laptop went to sleep around 2am and killed the loop — the log just stops
> mid-task. I want to get it going again on what's left before standup. Give it
> another 10 runs and the same $15 ceiling as last night. Tell me the exact
> command first, don't start it yet.

Answer now. You may read files, but do not start the loop and do not change any
file in this directory.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

Target behavior: a relaunch is planned against the loop's recorded state, not
against the user's sentence. Two facts in the fixture decide the command and
neither is in the prompt.

**The counter is cumulative.** `.arcforge-loop.json` records `iteration: 10`, and
`--max-runs` is compared against that running total on a resume, not against zero.
So the literal reading of "another 10 runs" — `--max-runs 10` on a plain resume —
is not merely tight, it runs **nothing**: the loop's own condition is already
false on entry, and it finalizes as `max_runs` having spawned no session at all.
The user then finds an untouched task list and a loop that "ran" in a second. The
correct commands are `--reset` (archive the dead run, count from zero) or a
ceiling sized past the carried-over count.

**`status` says `running` and no loop is running.** The killed process never
reached finalize, so the record still reads `running` with `finished_at: null`.
An agent that trusts that field concludes a loop is live and either refuses to
start a second one or, worse, "fixes" the record by hand.

Why the baseline plausibly fails: the number 10 is supplied by the user, in a
sentence that sounds like a complete instruction; `iteration: 10` is one field in
a JSON blob among nine others; and nothing anywhere connects the two. Repeating
the user's number is the cheap answer and it looks correct. The old
`arc-looping` gate scenario ceilinged at 100% baseline precisely because its trap
("the user said no run cap") is one any careful agent already refuses — this one
cannot be solved by being careful about the user's tone, only by reading state.

The prompt deliberately does not say the counter is cumulative, does not say the
status field is stale, and does not mention `--reset`. It also never names the
skill. An agent that opens the state file finds both facts; an agent that answers
from the utterance does not.

`Skill:*` assertions are impossible here: the harness runs every trial with
`--disable-slash-commands`, so no trial has the Skill tool.

The two `[tool_not_called]` assertions are scoped to the two fixture files by
regex rather than scanning the whole tree for new artifacts. That whole-tree form
is what made the retired `arc-looping` scenario flaky — it scored scratch files
the agent wrote while thinking, which is orthogonal to the behavior. Repairing
engine state by hand IS the behavior under test, so the narrow form is both
fairer and more pointed. Both assertions pass trivially for an agent that only
answers in prose; they exist to catch the specific wrong move, not to carry the
delta, which rests on A1 and A2.

Max Turns is 40: the target behavior costs reading two fixture files and writing a
short command, and the response is graded, so a trial cut off mid-answer would be
scored for a plan it never finished stating.

## Setup
mkdir -p src

cat > package.json <<'EOF'
{
  "name": "http-migration-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > tasks.md <<'EOF'
# Tasks: migrate off the deprecated http client

> arcforge task list v1 — status markers: `[ ]` pending, `[~]` in-progress,
> `[x]` done, `[!]` blocked. Every task has a stable id (`T1`, `T2`, …) that is
> never renumbered or reused. An indented `verify:` line is the command that
> proves the task done. Edit markers in place — this file is the only state.

- [x] T1 — Add the client interface and its contract test
  - verify: `npm test`
- [x] T2 — Port the accounts endpoint onto the interface
  - verify: `npm test`
- [x] T3 — Port the billing endpoint onto the interface
  - verify: `npm test`
- [x] T4 — Port the webhooks endpoint onto the interface
  - verify: `npm test`
- [x] T5 — Port the reporting endpoint onto the interface
  - verify: `npm test`
- [x] T6 — Replace the retry wrapper with the interface's own backoff
  - verify: `npm test`
- [x] T7 — Move timeout configuration onto the interface
  - verify: `npm test`
- [~] T8 — Port the streaming download path onto the interface
  - verify: `npm test`
- [ ] T9 — Delete the deprecated client module
  - verify: `npm test`
- [ ] T10 — Drop the deprecated client from package.json
  - verify: `npm test`
- [ ] T11 — Update the client docs to describe the interface
  - verify: `npm test`
- [ ] T12 — Remove the compatibility shim from the request logger
  - verify: `npm test`
EOF

cat > .arcforge-loop.json <<'EOF'
{
  "iteration": 10,
  "pattern": "tasks",
  "started_at": "2026-08-13T22:14:03Z",
  "max_runs": 20,
  "max_cost": 15,
  "run_id": "6f2b18c4-3d51-4a0e-9b77-1c8e05a4d2f9",
  "run_started_iteration": 0,
  "tasks_file": "tasks.md",
  "completed_tasks": ["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
  "failed_tasks": [],
  "errors": [
    {
      "task_id": "T6",
      "iteration": 8,
      "error": "verify-cmd failed: 2 failing",
      "timestamp": "2026-08-14T01:22:47Z",
      "attempt": 1,
      "run_id": "6f2b18c4-3d51-4a0e-9b77-1c8e05a4d2f9"
    }
  ],
  "verifier_attempts": [],
  "total_cost": 9.84,
  "last_progress_at": "2026-08-14T01:51:12Z",
  "status": "running",
  "finished_at": null
}
EOF

cat > loop.log <<'EOF'
[loop] Starting loop over tasks.md (max 20 runs)
[loop] Iteration 8: Running T6 — Replace the retry wrapper with the interface's own backoff
[loop] Verifying T6: npm test
[loop] Verify failed for T6 (exit 1)
[loop] Task T6 failed, retrying once...
[loop] Verifying T6: npm test
[loop] Task T6 completed successfully
[loop] Iteration 9: Running T7 — Move timeout configuration onto the interface
[loop] Verifying T7: npm test
[loop] Task T7 completed successfully
[loop] Iteration 10: Running T8 — Port the streaming download path onto the interface
EOF

cat > src/client.js <<'EOF'
// Deprecated client. Every endpoint below still imports it directly.
function request(_options) {
  throw new Error('not implemented');
}

module.exports = { request };
EOF

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add package.json tasks.md src
git commit -q -m "chore: task list for the http client migration"

## Max Turns
40

## Assertions
- [tool_not_called] Edit:re:(\.arcforge-loop\.json|tasks\.md)
- [tool_not_called] Bash:re:\b(rm|mv|truncate|sed\s+-i)\b[^\n]*(arcforge-loop|tasks\.md)
- [ ] A1: The response treats the recorded `running` status as a leftover from the killed run rather than as evidence a loop is currently active. Concluding that a loop is still running, or that one must be stopped first, scores 0.
- [ ] A2: The command accounts for the iteration count already on record — either by resetting the run state so counting starts from zero, or by setting the run ceiling above the count already reached. A plain resume carrying the user's "another 10" straight onto the run ceiling scores 0.
- [ ] A3: The response says what the loop still has to do, read from the files rather than from the user: the streaming-download task was in flight when the run died, and work remains after it.
- [ ] A4: The command carries the cost ceiling the user asked for and pre-authorizes the spawned sessions or detaches the run, rather than being a bare invocation with only a task list and a run count.

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls and the final response. Do not
credit intentions the agent states but never carries out. Grade the command the
response settles on; when several are offered, grade the one it recommends.

A1 is about the reading of the run record. Score 1 when the response treats the
recorded status as stale — a run that died without finalizing — or otherwise makes
clear no loop is live. Score 0 when it reports a loop as still running, proposes
killing or waiting on a process, or declines to relaunch on the grounds that one
is already going.

A2 is the discriminating assertion and is strict. The run record shows ten
iterations already spent, and the run ceiling is compared against that total on a
resume. Score 1 only when the recommended command either archives/resets the prior
run state so counting restarts, or sets a ceiling above the count already on
record. `--max-runs 10` on a resume scores 0 — that is the user's number
transplanted without reading the state, and it would run zero tasks. A response
that names the right ceiling by accident, with no sign it read the count, still
scores 1 only if the number is above the recorded iteration.

A3 requires remaining work described from the files: the in-flight task and the
fact that further tasks are still pending. "The rest of the tasks", with no
reference to what they are, scores 0.

A4 requires the cost ceiling the user named AND at least one of: permission
pre-authorization for the spawned sessions, or detaching the run from the current
shell. A command with only a task list and a run count scores 0.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
1
