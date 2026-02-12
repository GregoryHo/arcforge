---
name: arc-implementing
description: Use when orchestrating large project implementation in a worktree
---

# arc-implementing

## Overview

Orchestrator for large projects. Automatically expands epic → features → tasks → execution.

**Use when:**
- project has dag.yaml
- in a worktree session
- epic.md or features/*.md present

**Do not use when:**
- small projects (use writing-tasks + agent-driven directly)
- tasks without a structured spec

## Role

Implementer is the Orchestrator. It calls other skills and does not write code itself.

## Trigger

- in a worktree session
- `.arcforge-epic` marker exists
- or `epic.md` / `features/*.md` present

## The Process

1. For each epic in the worktree, run the following phases in order.
2. Phase 0: Sync and check dependencies.
   - Run `arc-coordinating` to sync from base and check `blocked_by`.
   - If `blocked_by` is not empty: STOP and use the blocked format.
   - If ready: continue to Phase 1.
3. Phase 1: Epic → Features.
   - Call `arc-writing-tasks`
   - Input: `epic.md`
   - Output: features list (may already exist in `features/*.md`)
4. Phase 2: Per Feature.
   - 2a: Feature → Tasks.
     - Call `arc-writing-tasks`
     - Input: `feature.md`
     - Output: `docs/tasks/<feature>-tasks.md`
     - Quality gate: If tasks are vague or missing tests/commands, STOP and re-run `arc-writing-tasks` to refine. **Max 2 refinement cycles** — if still vague, escalate to human.
   - 2b: Execute Tasks.
     - Call `arc-agent-driven`
     - Input: tasks file
     - Output: completed code + commits
5. Phase 3: Feature complete.
   - Move to next feature, or finish the epic.

## Skills Called

| Phase | Skill | Input | Output |
|-------|-------|-------|--------|
| 0 | arc-coordinating | worktree | sync + blocked status |
| 1 | arc-writing-tasks | epic.md | features breakdown |
| 2a | arc-writing-tasks | feature.md | tasks file |
| 2b | arc-agent-driven | tasks file | completed code |
| 2b | arc-dispatching-parallel | (via arc-agent-driven, if review finds multiple issues) | parallel fixes |
| End | arc-finishing-epic | completed epic | merge decision |

## What Implementer Does NOT Do

- ❌ Write code directly (delegate to agent-driven)
- ❌ Split tasks manually (delegate to writing-tasks)
- ❌ Perform reviews (handled inside agent-driven)
- ❌ Run TDD cycle (handled inside agent-driven)

## Completion Format

```
─────────────────────────────────────────────────
✅ Epic complete: <epic-name>

Features implemented:
- feature-1: 4 tasks, all passing
- feature-2: 6 tasks, all passing
- feature-3: 3 tasks, all passing

Total: 13 tasks, 0 failures
Commits: 13

Next: Use arc-finishing-epic to decide merge/PR/keep/discard
─────────────────────────────────────────────────
```

## Blocked Format

### Dependencies Not Ready

```
─────────────────────────────────────────────────
⚠️ Implementer blocked: waiting for dependencies

Epic: <epic-name>
Blocked by: <dep-1>, <dep-2>

To resolve:
1. Complete blocking epics first
2. Run `arc-coordinating` sync from base
3. Verify `blocked_by` is empty

Then resume implementer
─────────────────────────────────────────────────
```

### Task Failure

```
─────────────────────────────────────────────────
⚠️ Implementer blocked

Epic: <epic-name>
Feature: <feature-name>
Task: <task-id>
Issue: [description]

To resolve:
1. [action]

Then resume implementer
─────────────────────────────────────────────────
```

## Integration

- **Before:** arc-coordinating (creates worktrees), arc-planning (creates DAG)
- **Uses:** arc-writing-tasks, arc-agent-driven, arc-dispatching-parallel
- **After:** arc-finishing-epic
