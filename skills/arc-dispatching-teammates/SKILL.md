---
name: arc-dispatching-teammates
description: Use when dag.yaml has 2+ epics in a ready state, the user is staying at their keyboard to monitor (not walking away), and the context is epic-level parallel work where arc-looping's unattended mode is a wrong fit. Use when the user mentions agent teams or teammates in the context of multi-epic work, asks what to do after arc-planning produces multiple ready epics, or is in an arcforge session where epic-level parallelism has arisen and the lead can stay present. For walk-away overnight execution, use arc-looping instead.
---

# arc-dispatching-teammates

## Overview

Dispatch one Claude Code **agent teammate** per ready epic. Lead stays present, messages teammates via SendMessage, intervenes on blockers. Teammates implement inside isolated worktrees and merge back to a short-lived dev branch — intermediate noise (retries, fix-forward commits) is fine; the deliverable is stability at HEAD, not clean history. The user decides promotion afterward.

**Core principle:** Teammates are the arcforge-supported substrate for lead-present multi-epic parallelism. Manual "open N Claude windows" is a fallback, not the default. Don't over-protect the dev branch, don't pre-identify conflicts — let runtime handle runtime.

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

1. **2+ ready epics** — `arcforge status --json` shows epics with `status: pending`, `worktree: null`, deps completed. If < 2, skill does not apply.
2. **Agent tool supports `team_name` and `name`.** If dispatch errors with "unknown parameter team_name", report blocked.
3. **Lead is in project root**, not a worktree. Move to base worktree if `.arcforge-epic` is in cwd.

Precondition failure = hard fail. Do not silently fall back to arc-looping or manual juggling.

## Core Workflow

1. **Identify ready epics.** From `arcforge status --json`, collect every epic with `status: pending` and `worktree: null`. Call this set R.

2. **Cap team size at 5.** If `|R| > 5`, take the first 5 as the initial team and queue the rest. ≤5 teammates is Anthropic's documented best practice; beyond 5 coordination overhead exceeds benefit.

3. **`TeamCreate` BEFORE any Agent dispatch.** Use a descriptive name like `dispatch-<project>-<timestamp>`. Per [Agent Teams docs](https://code.claude.com/docs/en/agent-teams), passing `team_name` to Agent does NOT auto-create — it triggers a state-sync bug.

4. **Expand worktrees and dispatch teammates in parallel.** For each epic in the initial 5:
   - `node scripts/cli.js expand --epic <epic-id>` from the project root — creates the canonical worktree and stamps `.arcforge-epic`. Per-epic, not batch.
   - Read the absolute worktree path from `arcforge status --json`; do not reconstruct it.
   - Dispatch via Agent with `team_name=<team>`, `name=worker-<epic-id>`, spawn prompt from `references/spawn-prompt-template.md`.

   **Parallel, not sequential** — documented good pattern. If some spawns fail with `Failed to create teammate pane`, you hit [GH #40168](https://github.com/anthropics/claude-code/issues/40168); retry those sequentially. See `references/tmux-timing-race.md`.

5. **Monitor.** Stay present. Read TaskList and mailbox periodically, answer teammate questions via SendMessage, intervene on stuck teammates. On teammate completion → Step 6. On acceptance → if queue has more epics, dispatch one into the freed slot (continuous, not waves).

6. **Acceptance check (per teammate completion) — delegate, do NOT inline.** The lead dispatches two subagents with fresh context; the lead does NOT locate code or run tests itself. When a teammate reports done:

   - **Spec compliance** — `Agent(subagent_type='arcforge:spec-reviewer')` with the epic's `epic.md` and referenced `features/*.md` attached. It independently locates every acceptance criterion in the merged dev branch and returns PASS/FAIL with file:line evidence.
   - **Fresh-eyes verification** — `Agent(subagent_type='arcforge:verifier')` with the project test command. It runs tests from an empty context and returns raw output.

   Both PASS → accept. Either FAIL → Step 7. **Subagents ARE the gate** — running either check inline defeats the purpose. Baseline testing found the lead rationalizes inline acceptance by mapping test names to acceptance criteria instead of locating code, and by treating its own prior test run as fresh-eyes. A subagent has no prior context to rationalize from. The lead's job is to READ the reports and decide, not execute the checks.

   See `references/acceptance-and-retry.md` for subagent prompt templates, defect patterns, and feedback rules.

7. **Retry loop (on rejection).** Up to **3 retries per epic** (max 4 total attempts). On rejection:
   - Formulate feedback naming the failed criterion, quoting spec text verbatim, stating current-vs-required behavior.
   - `node scripts/cli.js expand --epic <epic-id>` — fresh worktree, fix-forward from current dev HEAD.
   - Dispatch `worker-<epic-id>-retry<N>` using `references/spawn-prompt-template.md` with a prepended `## Previous Attempt Feedback` section (cumulative).
   - Track retry count in session memory. Retry 3 also fails → mark **permanently failed**, record reason for Step 8.

   **Retries are for acceptance failures only.** Mid-work blockers and merge-conflict escalations are arbitration flows, not retries — counter does not increment. See `references/acceptance-and-retry.md` for mechanics and edge cases.

8. **Wrap up (three actions, in order).** When every epic reaches a terminal state:

   - **8a.** Emit the Final Report (format below). The dev branch IS the deliverable — do NOT auto-merge to main or revert failed epics. Those are user decisions.
   - **8b.** Clean up **accepted** worktrees from the project root: `node scripts/cli.js cleanup <accepted-epic-id-1> <accepted-epic-id-2> ...`. The merge commits are already on the dev branch; the worktrees are orphaned scaffolding. **Skip** permanently failed epics — the user may need their worktree to debug. Do NOT call cleanup from inside a teammate's worktree — per Agent Teams docs, teammates should not run cleanup.
   - **8c.** Shut down teammates and call `TeamDelete` with the team name. Without this, tmux panes orphan and the team's runtime state lingers. See `references/wrap-up-sequence.md` for ordering, failure handling, and the rationale.

## Spawn Prompt Template

Lives in `references/spawn-prompt-template.md` with three sections: **Your Authority** (autonomous end-to-end execution grant), **Your Workspace** (cd + invoke `/arc-implementing`), **Coordination** (SendMessage-only). Read that file before dispatching, fill in `<epic-id>` and `<absolute-worktree-path>`, paste into each Agent call. Teammate plain text is invisible to the lead — SendMessage is the only channel.

## Red Flags

Rationalizations observed in baseline testing. If you catch yourself saying any of these, stop and re-check routing:

- **"You become the coordinator, just open N Claude windows and tab between them."** Papering over the gap. With this skill, the lead session *is* the coordinator via teammates — the user does not juggle windows.
- **"Agent teammates are a generic Claude Code feature, not an arcforge pattern."** They are an arcforge pattern now. Don't bucket them as external.
- **"I'll use arc-looping since it handles dag parallelism."** arc-looping is walk-away. Re-read the user's attendance signal.
- **"`arc-dispatching-parallel` already covers this."** No — that skill is feature-level inside one worktree. This is epic-level across worktrees.
- **"Let me spawn 8 teammates since there are 8 ready epics."** Cap at 5. Queue the rest. Continuous dispatch.
- **"Worktrees already exist, so I'll just dispatch."** Fine — skip the expand step for epics whose worktree is non-null. Do not re-expand.
- **"Parallel burst hit `Failed to create teammate pane` — downscale the team."** No. You hit GH #40168. Retry the failed spawns sequentially. See `references/tmux-timing-race.md`.
- **"I need to tell teammates which shared files to avoid."** No. Let conflicts happen; arc-finishing-epic escalates them via the Merge Conflict (Multi-Teammate) path. Static prediction is over-engineering.
- **"Pin arcforge version: `ARCFORGE_ROOT=... node "${ARCFORGE_ROOT}/scripts/cli.js"`."** POSIX footgun — `"${VAR}"` expands before the inline assignment. Use plain `node scripts/cli.js ...`.
- **"I already know what this epic does — I'll skip the spec-reviewer and just map test names to ACs."** This is the qmd baseline failure verbatim. The lead's prior context is precisely what makes inline acceptance unreliable. Always dispatch `arcforge:spec-reviewer` per Step 6; it has fresh context and cannot rationalize.
- **"The teammate already ran tests green — running verifier is redundant."** Same mistake. The verifier runs from an empty context; "redundant" is the rationalization that skips the gate. Dispatch `arcforge:verifier` per Step 6.
- **"I'll close tmux panes manually later, skip `TeamDelete`."** Without TeamDelete, panes orphan and the team's runtime state lingers across sessions. Step 8c is not optional.

## Completion Formats

### Dispatch ready (after Step 4 — initial spawn successful)

```
✅ Teammate dispatch: team ready
- Team: dispatch-<project>-<timestamp>
- Teammates spawned: 3 (worker-epic-auth, worker-epic-api, worker-epic-ui)
- Queued: 0
- Lead: monitoring via SendMessage, will run acceptance check per completion
```

### Final Report (after Step 8 — session end)

Use this after every dispatched epic has reached a terminal state (accepted
or permanently failed). This is the user-facing hand-off — they read this
and decide what to do with the dev branch.

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
       Worktree retained for debugging.

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

Each accepted epic MUST show subagent evidence (spec-reviewer + verifier PASS). Missing = Step 6 was skipped. Failed epics show the last subagent FAIL and are NOT auto-cleaned. "Next actions" lists user options — you don't execute them.

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
- **Lead session** dispatches `arcforge:spec-reviewer` + `arcforge:verifier` per Step 6 on each completion; does NOT run `arc-verifying` inline.
- **Blocked teammates** → route to `arc-debugging` on the specific epics. Do not auto-retry.
