---
name: arc-coordinating
description: Use when managing worktrees for multi-epic projects, when dag.yaml exists, or when coordinating parallel development
---

# Coordinator

## Overview

Use the Node.js CLI (`scripts/coordinator.js`) for worktree lifecycle and cross-session coordination.

## When to Use

- Multi-epic projects needing parallel development
- Worktree creation/merge automation
- DAG status tracking across sessions
- Merging from an epic worktree when `.arcforge-epic` exists and epic id should be inferred

**Single-epic projects:** Use arc-implementing directly (except `merge` in a worktree).

**If already in a worktree:** Use arc-implementing, except for `merge` (allowed).

**DAG requirement:** `dag.yaml` must exist and be committed before running coordinator commands.

## Commands

| Command | Purpose | CLI Mapping |
|---------|---------|-------------|
| `expand` | Create worktrees for ready epics | `arcforge expand` |
| `merge` | Merge completed epics | `arcforge merge` |
| `status` | Show pipeline progress | `arcforge status` |
| `cleanup` | Remove merged worktrees | `arcforge cleanup` |
| `sync` | Synchronize worktree ↔ DAG state | `arcforge sync` |
| `next` | Show next ready task | `arcforge next` |
| `parallel` | Show parallelizable tasks | `arcforge parallel` |
| `block` | Mark a task blocked in DAG | `arcforge block` |
| `reboot` | Generate 5-Question context | `arcforge reboot` |

## CLI Usage

**IMPORTANT**: Set `SKILL_ROOT` to the absolute path from the skill loader header (`# SKILL_ROOT: ...`).

```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-coordinating}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
```

Then use `node "${SKILL_ROOT}/scripts/coordinator.js" <command>` for all commands:
```bash
node "${SKILL_ROOT}/scripts/coordinator.js" status
node "${SKILL_ROOT}/scripts/coordinator.js" expand
node "${SKILL_ROOT}/scripts/coordinator.js" merge
```

**JSON output:** Add `--json` flag for machine-readable output:
```bash
node "${SKILL_ROOT}/scripts/coordinator.js" status --json
```

## Standard Workflow

Workflow:

1. **Set SKILL_ROOT**: From the skill loader header
2. **Check Exit Code**: If exit 1, report blocked format and stop
3. **Execute Command**: Use `node "${SKILL_ROOT}/scripts/coordinator.js" <command>`
4. **Never Fallback**: Do NOT attempt manual operations if CLI fails

## Merge From Worktree (Auto-Detect)

If inside `.worktrees/<epic-id>` with `.arcforge-epic`:

1. **Infer epic id** from `.arcforge-epic`
2. **Find base worktree** via `git worktree list --porcelain` (path without `.worktrees/`)
3. **Infer base branch** from the base worktree `HEAD`
4. **Merge** the epic into base, and mark epic completed in `dag.yaml`

If base worktree cannot be found or base branch cannot be inferred → report blocked and STOP.

## Completion Format

✅ Coordinator: expand complete
- Worktrees created: 3
- Ready for development: epic-auth, epic-api, epic-ui

## Blocked Format

⚠️ Coordinator: merge blocked
- Epic: epic-auth
- Conflict: src/types.py
- Action: Manual resolution required

⚠️ Coordinator: blocked
- Issue: Node.js CLI not available
- Checked: `${SKILL_ROOT}/scripts/coordinator.js`
- Action: Ensure Node.js is available, then retry

⚠️ Coordinator: merge blocked
- Issue: Base worktree not found or base branch not inferred
- Checked: `git worktree list --porcelain`, base worktree HEAD
- Action: Ensure a main worktree exists and has a valid branch checked out, then retry

## When NOT to Use

- Single feature implementation → arc-implementing
- No dag.yaml → arc-planning first
- Already in worktree → stay in arc-implementing
