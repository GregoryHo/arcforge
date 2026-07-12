---
name: arc-coordinating
description: Coordinate multi-epic worktrees and cross-epic DAG state. Use when specs/<id>/dag.yaml exists and epics run in parallel worktrees needing sync and merge orchestration; to build a single epic's features use arc-implementing.
category: orchestration
status: promoted
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

**If already in a worktree:** Use arc-implementing, except for `merge` and `sync` (both allowed).

**DAG requirement:** `specs/<spec-id>/dag.yaml` must exist and be committed before running coordinator commands. In base-side sessions with multiple specs, commands that cannot aggregate (`next`, `parallel`, `expand`, `loop`) require `--spec-id <id>`; `merge` / `cleanup` accept positional epic ids as disambiguator.

## Commands

| Command | Purpose | CLI Mapping |
|---------|---------|-------------|
| `expand` | Create worktrees for ready epics | `arcforge expand` |
| `merge` | Merge completed epics | `arcforge merge` |
| `status` | Show workflow progress | `arcforge status` |
| `cleanup` | Remove merged worktrees | `arcforge cleanup` |
| `sync` | Synchronize worktree ↔ DAG state | `arcforge sync` |
| `next` | Show next ready task | `arcforge next` |
| `parallel` | Show parallelizable tasks | `arcforge parallel` |
| `block` | Mark a task blocked in DAG | `arcforge block` |
| `reboot` | Generate 5-Question context | `arcforge reboot` |

## CLI Usage

Set `SKILL_ROOT` from `ARCFORGE_ROOT` (fallback when unset), then run every
command as `node "${SKILL_ROOT}/scripts/coordinator.js" <command>`; add `--json`
for machine-readable output. If the CLI exits 1, report the blocked format and
stop — never fall back to manual git operations.

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
: "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-coordinating}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
node "${SKILL_ROOT}/scripts/coordinator.js" status        # add --json for machine-readable output
node "${SKILL_ROOT}/scripts/coordinator.js" expand
node "${SKILL_ROOT}/scripts/coordinator.js" merge
```

## Merge From Worktree (Auto-Detect)

If the current directory is an arcforge-managed worktree (contains
`.arcforge-epic`):

1. **Infer epic id** from `.arcforge-epic`
2. **Find base worktree** via `git worktree list --porcelain` — the coordinator
   automatically recognizes which entries are arcforge-managed worktrees and
   picks the base for you
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
