---
name: arc-implementing
description: Use when orchestrating large project implementation in a worktree
---

# arc-implementing

## Overview

Orchestrator for large projects. Automatically expands epic → features → tasks → execution. It calls other skills and does not write code itself.

**Use when** in a worktree session with `specs/<spec-id>/dag.yaml`, an `.arcforge-epic` marker (supplies both `epic` and `spec_id`), and `specs/<spec-id>/epics/<epic-id>/epic.md` or `.../features/*.md` present.

**Do not use** for small projects (use writing-tasks + agent-driven directly) or tasks without a structured spec.

## The Process

For each epic in the worktree, run these phases in order:

1. **Phase 0 — Sync and check dependencies.** Run `arc-coordinating` to sync from base and check `blocked_by`. If `blocked_by` is not empty: STOP and use the blocked format. If ready: continue.
2. **Phase 1 — Confirm features exist.** `specs/<spec-id>/epics/<epic-id>/features/*.md` was produced by `arc-planning` Phase 3 and already exists. Read the feature files directly; no skill call here.
3. **Phase 2 — Per feature:**
   - **2a: Feature → Tasks.** Call `arc-writing-tasks`. Input: `specs/<spec-id>/epics/<epic-id>/features/<feature>.md`. Output: `docs/tasks/<feature>-tasks.md`. Quality gate: if tasks are vague or missing tests/commands, STOP and re-run to refine — **max 2 refinement cycles**, then escalate to human.
   - **2b: Execute Tasks.** Call `arc-agent-driven`. Input: tasks file. Output: completed code + commits. Model tiers: arc-agent-driven's Model Selection ladder governs per-dispatch model choice (never inherit).
4. **Phase 3 — Feature complete.** Move to next feature, or finish the epic.

## Skills Called

| Phase | Skill | Input | Output |
|-------|-------|-------|--------|
| 0 | arc-coordinating | worktree | sync + blocked status |
| 2a | arc-writing-tasks | `specs/<spec-id>/epics/<epic-id>/features/<feature>.md` | tasks file |
| 2b | arc-agent-driven | tasks file | completed code |
| 2b | arc-dispatching-parallel | (via arc-agent-driven, if review finds multiple issues) | parallel fixes |
| End | arc-finishing | completed epic | merge decision |

## What Implementer Does NOT Do

- ❌ Write code directly (delegate to agent-driven)
- ❌ Split tasks manually (delegate to writing-tasks)
- ❌ Perform reviews or run the TDD cycle (handled inside agent-driven)

## Durable Progress

Phase 2b runs through `arc-agent-driven`, which records each completed task to
the `.arcforge/sdd/progress.md` ledger (a self-ignoring runtime recovery
artifact) as `Task N: complete (commits <base7>..<head7>, review clean)`. If a
compaction or fresh session drops your place mid-epic, read that ledger plus
`git log` and resume AFTER the last task marked complete — never re-dispatch a
feature or task the ledger already records as done.

## Completion Format

```
─────────────────────────────────────────────────
✅ Epic complete: <epic-name>

Features implemented:
- feature-1: 4 tasks, all passing
- feature-2: 6 tasks, all passing

Total: N tasks, 0 failures
Commits: N

Next: Use arc-finishing to decide merge/PR/keep/discard
─────────────────────────────────────────────────
```

## Blocked Format

```
─────────────────────────────────────────────────
⚠️ Implementer blocked

Epic: <epic-name>
[Dependencies] Blocked by: <dep-1>, <dep-2>
  → Complete blocking epics, run `arc-coordinating` sync from base, verify `blocked_by` empty
[Task failure] Feature: <feature-name>  Task: <task-id>  Issue: [description]
  → [action]

Then resume implementer
─────────────────────────────────────────────────
```

## Integration

- **Before:** arc-coordinating (creates worktrees), arc-planning (creates DAG)
- **Uses:** arc-writing-tasks, arc-agent-driven, arc-dispatching-parallel
- **After:** arc-finishing (Step 0 selects the epic path)
