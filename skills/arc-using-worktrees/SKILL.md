---
name: arc-using-worktrees
description: Use when setting up an isolated workspace for a single epic, when starting work on a specific epic id from dag.yaml, or when any task mentions creating a branch or checkout for epic-level work. Use this skill even if the user doesn't say "worktree" — if they're scoping work to one epic, this applies. For batch (multi-epic) expansion, use arc-coordinating expand instead.
---

# arc-using-worktrees

## When to Use

Create an isolated workspace for a single epic. This skill is a thin wrapper
around `arcforge expand --epic <id>` — it does not create worktrees by hand.

For multi-epic batch expansion, use `arc-coordinating expand` instead.

**REQUIRED BACKGROUND:** `arc-using` — read the Worktree Rule for the three
norms (no hardcoded paths, no manual `git worktree add`, enter via
`arcforge status --json`).

## Core Workflow

### Step 1: Identify the epic

Read the epic id from `dag.yaml` or the user's request. Abort if the epic id
is unknown — you cannot create a worktree for an epic that is not in the DAG.

### Step 2: Delegate to coordinator

```bash
node "${SKILL_ROOT}/scripts/coordinator.js" expand --epic <epic-id> --project-setup
```

What this does (single authoritative implementation in `scripts/lib/coordinator.js`):

- Derives the canonical worktree path via `scripts/lib/worktree-paths.js`
  (`~/.arcforge-worktrees/<project>-<hash>-<epic>/`).
- Runs `git worktree add <path> -b <epic-id>`.
- Writes the `.arcforge-epic` marker with base worktree + base branch.
- Auto-detects the project installer (`package.json` → `npm install`,
  `pyproject.toml` → `pip install -e .`, `Cargo.toml` → `cargo build`,
  `go.mod` → `go mod download`) when `--project-setup` is passed.
- Updates `dag.yaml` epic status and worktree field.

### Step 3: Read the returned path

The command prints JSON. Read the `path` field — do not reconstruct it from
pattern knowledge, and do not hardcode it in subsequent messages.

### Step 4: Report to the user

Use the completion format below, filling the absolute path from the command
output.

## Red Flags

Stop immediately if you catch yourself thinking:

1. **"I'll just `git worktree add` it directly"** — NO. Bypasses the
   `.arcforge-epic` marker and dag.yaml update that `arc-coordinating sync`
   depends on, producing silently broken state.
2. **"I'll put it somewhere convenient like `./worktrees/`"** — NO. The
   canonical path is derived at runtime; putting it elsewhere makes every
   downstream tool fail to find it.
3. **"I'll hardcode `~/.arcforge-worktrees/...` in my output"** — NO. Read
   the `path` field from the CLI's JSON output. The derivation rule has
   evolved before and will evolve again.
4. **"I'll skip the dag.yaml check"** — NO. If the epic is not in the DAG,
   `arcforge expand` will refuse and that refusal is correct.
5. **"The CLI failed, so I'll do it manually"** — NO. A CLI failure is a
   real problem, not a prompt to bypass the mechanism. Report blocked.

## Stage Completion Format

```
─────────────────────────────────────────────────
✅ Worktree created for <epic-id>

Path: <absolute path from arcforge expand JSON>
Branch: <epic-id>
Tracking: .arcforge-epic

Next: cd to the path, then use `/arc-finishing-epic` when work is complete
─────────────────────────────────────────────────
```

## Blocked Format

```
─────────────────────────────────────────────────
⚠️ Worktree creation blocked

Epic: <epic-id>
Reason: <stderr from arcforge expand>

Common causes:
- Epic not in dag.yaml
- Epic not ready (dependencies incomplete)
- Git worktree add failed (uncommitted changes, branch conflict)

Report the exact CLI error and stop.
─────────────────────────────────────────────────
```

## Related Skills

- **Called by:** `arc-coordinating` (when a single epic needs expansion), `arc-agent-driven`, `arc-executing-tasks`
- **After this skill:** Work in the created worktree, then `/arc-finishing-epic` to integrate
- **Alternative:** `arc-coordinating expand` (batch mode — all ready epics at once, no `--epic` flag)
