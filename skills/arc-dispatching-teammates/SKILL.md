---
name: arc-dispatching-teammates
description: Use when dag.yaml has 2+ epics in a ready state, the user is staying at their keyboard to monitor (not walking away), and the context is epic-level parallel work where arc-looping's unattended mode is a wrong fit. Use when the user mentions agent teams or teammates in the context of multi-epic work, asks what to do after arc-planning produces multiple ready epics, or is in an arcforge session where epic-level parallelism has arisen and the lead can stay present. For walk-away overnight execution, use arc-looping instead.
---

# arc-dispatching-teammates

## Overview

Dispatch one Claude Code **agent teammate** per ready epic so the lead session stays in control while multiple epics progress in parallel. The lead remains present, messages teammates via SendMessage, and intervenes on blockers — teammates do the implementation work inside isolated worktrees.

**Core principle:** Teammates are the arcforge-supported substrate for lead-present multi-epic parallelism. Manual "open N Claude windows and tab between them" is a fallback when teammates are unavailable, not the default.

**Dev-branch mental model:** The lead operates from a short-lived dev branch where the session's commits accumulate. Teammates branch off and merge back. Intermediate noise (retries, failed attempts, fix-forward commits) is fine — the deliverable is **stability at HEAD**, not clean history. The user decides promotion afterward. Don't over-protect the dev branch, don't pre-identify conflicts — let runtime handle runtime.

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

3. **Create the team BEFORE any Agent dispatch.** Use `TeamCreate` with a descriptive name like `dispatch-<project>-<timestamp>`. Per [official Agent Teams docs](https://code.claude.com/docs/en/agent-teams), `TeamCreate` must precede every `Agent` call — passing `team_name` to Agent does NOT auto-create and triggers a state-sync bug requiring `TeamDelete` recovery.

4. **Expand worktrees and dispatch teammates in parallel.** For each epic in the initial 5:
   - Run `node scripts/cli.js expand --epic <epic-id>` from the project root. This creates the canonical worktree and stamps `.arcforge-epic`. Do NOT pre-batch-expand; per-epic auto-expand keeps failures attributable.
   - Read the new absolute worktree path from `arcforge status --json` — do not reconstruct it from hash knowledge.
   - Dispatch a teammate via the Agent tool with `team_name=<the team>`, `name=worker-<epic-id>`, and the spawn prompt from `references/spawn-prompt-template.md`.

   **Dispatch in parallel, not sequentially.** Parallel spawn is the documented good pattern — sequential spawn is an explicit anti-pattern per Agent Teams docs and external teammate skills. If some spawns fail with `Failed to create teammate pane: no space for new pane`, you hit [GH #40168](https://github.com/anthropics/claude-code/issues/40168) — retry the failed ones sequentially. See `references/tmux-timing-race.md` for the fallback playbook.

5. **Monitor.** The lead stays present. Read TaskList and mailbox periodically, respond to teammate questions via SendMessage, intervene on genuinely stuck teammates. When a teammate completes, go to Step 6 for that teammate. When a teammate is accepted (Step 6 passes) and the queue has more epics waiting, dispatch the next queued epic into the freed slot (continuous dispatch, not waves).

6. **Acceptance check (per teammate completion).** Do NOT implicitly accept. When a teammate reports done, run both checks before considering the epic complete:

   - **Spec compliance**: Read `epics/<epic-id>/epic.md` and each `features/*.md` it references. For every acceptance criterion, locate the code in the merged dev branch and verify it actually implements the behavior — not just references it in test names or commit messages.
   - **Fresh-eyes verification**: Run `arc-verifying` or the project test command from the lead's own context. Teammate already ran it; your fresh context catches different failures (stale caches, uncommitted state, flakiness).

   Both must pass → accept (implicit — no ack needed). Either fails → Step 7. See `references/acceptance-and-retry.md` for common defect patterns, why fresh-eyes verify is not redundant, and feedback formulation rules.

7. **Retry loop (on rejection).** Up to **3 retries per epic** (max 4 total attempts). On rejection:
   - Formulate specific feedback naming the failed criterion, quoting spec text verbatim, and stating current-vs-required behavior.
   - Run `node scripts/cli.js expand --epic <epic-id>` — fresh worktree, fix-forward from the current dev HEAD (which already contains the rejected attempt's commits; the retry teammate may build on top or revert, per feedback).
   - Dispatch a new teammate via Agent with `name=worker-<epic-id>-retry<N>`. Use the standard template from `references/spawn-prompt-template.md` with a `## Previous Attempt Feedback` section prepended containing all prior rejection feedback cumulatively.
   - Track retry count in lead session memory (no persistence).
   - Resume monitoring (Step 5). If retry 3 also fails → mark **permanently failed** and record the final rejection reason for Step 8.

   **Retries are for acceptance failures only.** Mid-work blockers and merge-conflict escalations are arbitration flows, not retries — counter does not increment. See `references/acceptance-and-retry.md` for retry mechanics, edge cases, and when to pause retries to revise the spec instead.

8. **Wrap up with final report.** When every epic is in a terminal state (accepted or permanently failed), emit the Final Report (format below). The dev branch IS the deliverable — do NOT auto-merge to main, revert failed epics, or clean up. Those are user decisions.

## Spawn Prompt Template

The template lives in `references/spawn-prompt-template.md` with three sections: **Your Authority** (explicit autonomous end-to-end execution grant — closes the qmd worker-epic-history failure where a terse prompt left the teammate waiting for phase approval), **Your Workspace** (cd + invoke `/arc-implementing` or `/arc-agent-driven`), **Coordination** (SendMessage-only channel, narrow exception list). Read that file before dispatching, fill in `<epic-id>` and `<absolute-worktree-path>`, paste into each Agent call. SendMessage is not optional — teammate plain text is invisible to the lead.

## Red Flags

Rationalizations observed in baseline testing. If you catch yourself saying any of these, stop and re-check routing:

- **"You become the coordinator, just open N Claude windows and tab between them."** Papering over the gap. With this skill, the lead session *is* the coordinator via teammates — the user does not juggle windows.
- **"Agent teammates are a generic Claude Code feature, not an arcforge pattern."** They are an arcforge pattern now. Don't bucket them as external.
- **"I'll use arc-looping since it handles dag parallelism."** arc-looping is walk-away. Re-read the user's attendance signal.
- **"`arc-dispatching-parallel` already covers this."** No — that skill is feature-level inside one worktree. This is epic-level across worktrees.
- **"Let me spawn 8 teammates since there are 8 ready epics."** Cap at 5. Queue the rest. Continuous dispatch.
- **"Worktrees already exist, so I'll just dispatch."** Fine — skip the expand step for epics whose worktree is non-null. Do not re-expand.
- **"I'll dispatch all teammates in a single rapid burst to save a turn."** Fine — parallel is the default. But if any spawn returns `Failed to create teammate pane`, you hit GH #40168. Retry those sequentially — do NOT rationalize as "pane budget exhausted" and downscale the team. See `references/tmux-timing-race.md`.
- **"I need to tell teammates which shared files not to touch / what ownership boundaries apply."** No. The dev-branch mental model says: let teammates work, let conflicts happen, handle them at finishing time via the arc-finishing-epic escalation path. Trying to statically predict cross-epic file conflicts at dispatch time is over-engineering — the lead doesn't have ground truth and will misjudge. Let runtime handle runtime.
- **"Let me pin the arcforge version defensively: `ARCFORGE_ROOT=.../x.y.z node "${ARCFORGE_ROOT}/scripts/cli.js" ...`"** POSIX shell footgun — `"${VAR}"` is expanded before the inline `VAR=x` assignment takes effect, so the override is silently ignored on the command path. Use plain relative `node scripts/cli.js ...` and trust cwd.

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
  ✅ epic-stats        — accepted on attempt 2 (retry 1)
       Attempt 1 rejected: getStats() missing perCollection breakdown
       (fr-stats-001 AC #5). Retry fixed it.
  ❌ epic-history      — permanently failed after 4 attempts (3 retries)
       Final rejection: query_history migration fails on existing DBs;
       teammate kept producing variants that broke the migration test.

Next actions you may consider:
  - Inspect dev branch HEAD: git checkout <branch-name>
  - Promote successful work: merge/cherry-pick from <branch-name> to main
  - Debug the failed epic: /arc-debugging on epic-history
  - Discard the session: git branch -D <branch-name> && arcforge cleanup
```

Keep per-epic details accurate (attempt count, rejection reasons). "Next actions" lists options — the user picks, not you.

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
