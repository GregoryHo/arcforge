---
name: arc-dispatching-teammates
description: Use when dag.yaml has 2+ epics in a ready state, the user is staying at their keyboard to monitor (not walking away), and the context is epic-level parallel work where arc-looping's unattended mode is a wrong fit. Use when the user mentions agent teams or teammates in the context of multi-epic work, asks what to do after arc-planning produces multiple ready epics, or is in an arcforge session where epic-level parallelism has arisen and the lead can stay present. For walk-away overnight execution, use arc-looping instead.
---

# arc-dispatching-teammates

## Overview

Dispatch one Claude Code **agent teammate** per ready epic so the lead session stays in control while multiple epics progress in parallel. The lead remains present, messages teammates via SendMessage, and intervenes on blockers — teammates do the implementation work inside isolated worktrees.

**Core principle:** Teammates are the arcforge-supported substrate for lead-present multi-epic parallelism. Manual "open N Claude windows and tab between them" is a fallback when teammates are unavailable, not the default.

## When to Use

| Condition | Route to |
|---|---|
| 2+ ready epics, lead staying present ("I'll watch", "step in if needed") | **arc-dispatching-teammates** (this skill) |
| 2+ ready epics, lead walking away ("overnight", "going to bed") | arc-looping `--pattern dag` |
| 1 ready epic | arc-coordinating expand + arc-implementing |
| Feature-level parallelism inside one worktree | arc-dispatching-parallel |
| No `dag.yaml` | arc-planning first |

**The boundary vs arc-looping is attendance, not risk.** A risky epic with the lead watching is still teammates; a safe epic with the lead walking away is still arc-looping.

**REQUIRED BACKGROUND:** arc-using (injected at SessionStart).
**REQUIRED PRECEDENT:** arc-planning must have produced `dag.yaml`.

## Preconditions

1. **2+ ready epics.** Run `node scripts/cli.js status --json`. Count epics with `status: pending`, `worktree: null`, and all `depends_on` completed. If < 2, this skill does not apply.
2. **Agent tool supports `team_name` and `name` parameters.** If teammate dispatch errors with "unknown parameter team_name", the Claude Code version lacks agent teammates — report blocked.
3. **Lead session is in the project root**, not inside a worktree. If `.arcforge-epic` is in cwd, move to the base worktree first.

Precondition failure = hard fail. Do not silently fall back to arc-looping or manual session juggling.

## Core Workflow

1. **Identify ready epics.** From `arcforge status --json`, collect every epic with `status: pending` and `worktree: null`. Call this set R.

2. **Cap team size at 5.** If `|R| > 5`, take the first 5 as the initial team and queue the rest. ≤5 teammates is Anthropic's documented best practice; beyond 5 coordination overhead exceeds benefit.

3. **Create or reuse a team.** Use the team creation tool available in your environment (e.g. `TeamCreate`) with a descriptive name like `dispatch-<project>-<timestamp>`, or pass `team_name` to the first Agent dispatch. The team is the shared namespace for SendMessage and TaskList.

4. **Expand worktrees and spawn teammates in a single pass.** For each epic in the initial 5:
   - Run `node scripts/cli.js expand --epic <epic-id>` from the project root. This creates the canonical worktree and stamps `.arcforge-epic`. Do NOT pre-batch-expand; per-epic auto-expand keeps failures attributable.
   - Read the new absolute worktree path from `arcforge status --json` — do not reconstruct it from hash knowledge.
   - Dispatch a teammate via the Agent tool with `team_name=<the team>`, `name=worker-<epic-id>`, and the Spawn Prompt Template below.

5. **Monitor.** The lead stays present. Read TaskList and mailbox periodically, respond to teammate questions via SendMessage, intervene on genuinely stuck teammates. When a teammate completes, dispatch the next queued epic into the freed slot (continuous dispatch, not waves).

6. **Wrap up.** Teammates each run their own `arc-finishing-epic` as part of `/arc-implementing` — the lead does not merge on their behalf. When all done, report completion.

## Spawn Prompt Template

Use verbatim. The inject-skills hook synchronously loads arc-using into teammate context (commit `10b61a0`), so no belt-and-suspenders inlining is needed.

```
You are teammate worker-<epic-id> implementing epic <epic-id>.

1. cd to <absolute-worktree-path>
2. Invoke /arc-implementing to execute this epic per arcforge's workflow.
3. Report progress and completion via SendMessage to team-lead. Your plain
   text output is NOT visible to the lead — always use SendMessage for
   anything the lead needs to see.

If you hit a blocker you cannot resolve, report it via SendMessage describing
the blocker, then stop. The lead will continue with other epics and present
a summary. Do not attempt to work on epics other than <epic-id>.
```

Replace `<epic-id>` and `<absolute-worktree-path>` per teammate. The SendMessage instruction is not optional — teammate plain text is invisible to the lead (PoC verified).

## Red Flags

Rationalizations observed in baseline testing. If you catch yourself saying any of these, stop and re-check routing:

- **"You become the coordinator, just open N Claude windows and tab between them."** Papering over the gap. With this skill, the lead session *is* the coordinator via teammates — the user does not juggle windows.
- **"Agent teammates are a generic Claude Code feature, not an arcforge pattern."** They are an arcforge pattern now. Don't bucket them as external.
- **"I'll use arc-looping since it handles dag parallelism."** arc-looping is walk-away. Re-read the user's attendance signal.
- **"`arc-dispatching-parallel` already covers this."** No — that skill is feature-level inside one worktree. This is epic-level across worktrees.
- **"Let me spawn 8 teammates since there are 8 ready epics."** Cap at 5. Queue the rest. Continuous dispatch.
- **"Worktrees already exist, so I'll just dispatch."** Fine — skip the expand step for epics whose worktree is non-null. Do not re-expand.

## Completion Format

```
✅ Teammate dispatch: team ready
- Team: dispatch-<project>-<timestamp>
- Teammates spawned: 3 (worker-epic-auth, worker-epic-api, worker-epic-ui)
- Queued: 0
- Lead: monitoring via SendMessage
```

## Blocked Format

```
⚠️ Teammate dispatch: blocked
- Issue: <precondition that failed, e.g. only 1 ready epic, Agent team_name unsupported>
- Checked: <exact command or tool invocation>
- Action: <specific remediation — e.g. use arc-coordinating for 1 epic,
  enable agent teammates per Claude Code release notes, or fall back to
  arc-looping if unattended is acceptable>
```

## After This Skill

- **Each teammate** hands off to `arc-finishing-epic` as part of `/arc-implementing`.
- **Lead session** runs `arc-verifying` once all teammates are done.
- **Blocked teammates** → route to `arc-debugging` on the specific epics. Do not auto-retry.
