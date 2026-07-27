---
name: arc-executing-tasks
description: Run a prepared task list yourself with human-in-the-loop checkpoints. Use when tasks are already broken down and you implement them in-session; for isolated subagent-per-task execution use arc-agent-driven instead.
category: sdd
status: promoted
argument-hint: "<task-list-name>"
---

# Executing Tasks

## Overview

Human-in-the-loop execution with checkpoints. For when you want control over each batch.

**Announce at start:** "I'm using the arc-executing-tasks skill to implement this task list."

## vs arc-agent-driven

| Aspect | execute-tasks | agent-driven |
|------|---------------|--------------|
| Executor | main session | fresh subagent |
| Review | human checkpoints | automated task-reviewer (both verdicts) |
| Control | high | low |
| Best for | needs human judgment | automated execution |

## The Process

### Step 1: Load and Review Tasks

1. Read task file from `docs/tasks/<name>-tasks.md`
2. Review critically for gaps or ambiguity
3. If concerns: raise them with the user before starting
4. If no concerns: confirm the plan is approved, then proceed

### Step 2: Choose Execution Context

This skill is designed for **parallel session execution** (separate from planning). If already in a planning/design session, confirm handoff before starting.

### Step 3: Execute Batch

**Default: 3 tasks per batch.** For each task: mark in_progress → follow TDD steps exactly → run verifications → mark completed.

### Step 4: Checkpoint Report (Required)

```
─────────────────────────────────────────────────
Batch 1/3 complete (tasks 1-3)

Implemented:
- Task 1: [description] ✓
- Task 2: [description] ✓
- Task 3: [description] ✓

Verification:
- Tests: 12/12 passing
- Build: Success

Ready for feedback. Continue to next batch? (y/n)
─────────────────────────────────────────────────
```

### Step 5: Continue or Adjust

Based on feedback: apply changes if needed, execute next batch, repeat until complete.

### Step 6: Finish

After all tasks: use arc-finishing (Step 0 discriminates on `.arcforge-epic`).

## Core Rules

1. **Execute in order** - Follow task dependencies
2. **Verify each** - Run test command, confirm expected output
3. **Commit atomic** - One commit per logical unit
4. **Stop on failure** - Don't continue if test fails
5. **Don't break working code** - Changes must not break existing functionality

### Durable Progress Ledger

Per-task progress in TodoWrite and checkpoint reports lives only in context — a
compaction or fresh session can lose it and re-execute a completed task. Persist
completion to a ledger file using the same format `arc-agent-driven` writes:
after each task's verification passes, append one line to
`.arcforge/sdd/progress.md` (a self-ignoring runtime recovery artifact; or tick
the checkbox in `docs/tasks/<name>-tasks.md` if you want it tracked):
`Task N: complete (commits <base7>..<head7>, review clean)`. At skill start,
check the ledger and resume AFTER the last task it marks complete — never
re-execute a ledger-complete task; reconcile it against `git log` first.

## Commit Strategy

| Scope | Message |
|-------|---------|
| Feature complete | `feat(auth): implement login flow` |
| Single task | `feat(auth): add password validation` |
| Small step (WIP) | `wip: add basic validation` |

Commit at small steps: easy rollback to a known working state, and you can tell which change caused an issue. Uncertain whether a change affects other code? Commit first.

### Rationalizations

| Excuse | Reality |
|--------|---------|
| "Finish all changes then test together" | Small steps easier to debug |
| "Shouldn't affect other code" | Uncertain = commit first |
| "Rollback is too much trouble" | No commit = more trouble |

## Completion Format

✅ Execution complete
- Tasks: 8/8 passed
- Files created: 4
- Files modified: 2
- Commit: abc123

## Blocked Format

⚠️ Execution blocked
- Task: 5/8 (add session storage)
- Error: ImportError: redis not installed
- Action: Install dependency, then resume

## Integration

- **Required:** arc-using-worktrees (set up isolated workspace before starting)
- **Alternative:** arc-agent-driven (automated mode)
- **After:** arc-finishing (Step 0 discriminates on `.arcforge-epic`)

## Red Flags - STOP

- "Start implementation on main/master branch without explicit user consent"
- "Skip failing test and continue" / "Test failed but code looks right"
- "Commit now, fix test later"
- "Broke existing code but keep going"
- "Too many changes to track, just commit all"

**Failing test = stop and fix before continuing. Broke working code = rollback and rethink.**
