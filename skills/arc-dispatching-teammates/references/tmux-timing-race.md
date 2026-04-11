# tmux Timing Race — GH #40168 Fallback Playbook

SKILL.md Core Workflow tells you to dispatch teammates in parallel. In most
cases this is correct and matches the documented good pattern for Claude
Code Agent Teams. However, a known issue can cause some teammate spawns to
fail on a single-burst parallel dispatch.

## The issue

GitHub [anthropics/claude-code#40168](https://github.com/anthropics/claude-code/issues/40168):

> Agent Teams tmux split-pane: command sent via send-keys before shell is
> ready, teammates fail to start.

When `Agent` is called in rapid succession (typically 4+ calls within a
short window), tmux split-pane creation and shell startup can lose the
race against `send-keys` delivering the spawn prompt. The result: the
failing teammate(s) return errors like:

```
Failed to create teammate pane: no space for new pane
```

or silently fail to start (the tool call returns but the teammate never
processes its spawn prompt).

This is a timing race in the harness, NOT a tmux pane count limit and NOT
a hard cap on team size. The documented good pattern is still parallel
dispatch; this failure is a workaround condition, not the default.

## Detection

After dispatching N teammates in parallel, check each Agent tool result:

- Success: `Spawned successfully. agent_id: worker-<epic-id>@<team>...`
- Failure to watch for:
  - `Failed to create teammate pane: no space for new pane`
  - `Failed to create teammate pane: ...` (any variant)
  - Tool returns no `agent_id` or a `null` agent_id
  - No `Spawned successfully` text in the result

## Fallback: sequential retry for failed spawns only

When you detect failures in a parallel batch:

1. **Identify the failed teammates.** Record which epic-ids did not
   successfully spawn.

2. **Do NOT abort successful spawns.** The teammates that DID start are
   already running — leave them alone.

3. **Re-dispatch the failed ones sequentially.** For each failed epic:
   - Call `Agent` with the same `team_name`, `name`, and `prompt`
   - Read the tool result
   - Confirm `Spawned successfully` before moving to the next failed epic
   - If it fails again, log it and move on — do not loop more than twice

4. **If sequential retry also fails:** Report blocked for those specific
   epics. Do NOT stall the entire team — the already-running teammates
   continue their work. Present:

   ```
   Teammate dispatch: partial
   - Team: <team_name>
   - Spawned: <N-F> / <N>  (N total, F failed)
   - Failed: <list of epic-ids>
   - Reason: GH #40168 timing race — retry did not recover
   - Action: use arc-looping `--pattern dag` for the failed epics, or
     wait for all running teammates to finish and dispatch failed ones
     into freed slots per Core Workflow step 6 continuous dispatch
   ```

## Why not dispatch sequentially by default

Two reasons:

1. **Parallel is the documented good pattern** for Agent Teams per
   [official Agent Teams docs](https://code.claude.com/docs/en/agent-teams)
   and external skills like coleam00's `build-with-agent-team`. Sequential
   dispatch defeats the purpose of parallelism and is listed as an
   explicit anti-pattern in both sources.

2. **The issue may not trigger.** GH #40168 is a race condition — it
   depends on tmux state, terminal speed, shell startup time, and the
   number of simultaneous dispatches. Many dispatch waves never hit it.
   Slowing down every dispatch to avoid a condition that may not occur is
   pessimistic optimization.

**Policy:** parallel first, sequential only on observed failure.

## Red flag: sequential-by-default rationalization

If you catch yourself thinking:

> "I'll just dispatch them one by one from the start to be safe."

STOP. This is the anti-pattern. Parallel is the default. Sequential is
the fallback when you observe a specific failure, not a pre-emptive
defensive stance.

If you genuinely need sequential dispatch as the default (e.g., the project
has a known long shell startup time making the race more likely), document
the reason in the session and proceed — but be aware you are violating the
documented good pattern and accept the loss of parallelism.
