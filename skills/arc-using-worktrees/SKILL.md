---
name: arc-using-worktrees
description: Create an isolated git worktree in ANY repo — a parallel branch, experiment, or review checkout. Use when work needs isolation even if the user never says 'worktree'.
category: orchestration
status: promoted
---

# arc-using-worktrees

Isolated git worktrees for any repo — a branch, experiment, or review checkout.
The canonical path is derived at runtime — never invent one.

## Before You Create One

- `.arcforge-epic` exists in cwd → you are already inside a marked worktree.
  Never create a nested worktree; integration goes through `arc-finishing`.
- Otherwise → create a worktree here. This works in any git repo, arcforge
  project or not.

A user-stated custom path overrides everything — honor it via raw git;
`worktree list` will still show it, annotated `external`.

## Commands

Every command prints JSON — read the `path` field for the worktree location;
never reconstruct or hardcode it.

### add

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" worktree add <name> [--branch <b>] [--from <ref>] [--setup] --json
```

- Branch defaults to `<name>`; an existing branch is checked out as-is.
- A missing branch is created from `--from` (default: base HEAD).
- `--setup` auto-detects and runs the project installer in the new worktree.

### list

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" worktree list --json
```

The status surface. Each entry is annotated `kind`:
`base` | `epic` | `generic` | `external`. There is no `switch` subcommand — `cd`
to the `path` field to move into a worktree.

### remove

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" worktree remove <name> [--force]
```

A dirty worktree refuses removal without `--force`. An `.arcforge-epic`-marked
worktree is refused outright — that tree belongs to another lifecycle, not
yours to remove here.

## Finishing

Hand off to `/arc-finishing` (4-option gate). Its cleanup step removes the
worktree via `node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" worktree remove <name>`.

## Red Flags

Stop immediately if you catch yourself thinking:

1. **"I'll just `git worktree add` it directly"** — NO. The CLI derives the canonical path; raw git loses list/remove/finish coherence.
2. **"I'll put it somewhere convenient like `./worktrees/`"** — NO. The path is derived at runtime; anywhere else makes downstream tools fail to find it.
3. **"I'll hardcode the worktree path in my output"** — NO. Read the `path` field from the CLI's JSON.
4. **"The CLI failed, so I'll do it manually"** — NO. A CLI failure is a real problem, not a cue to bypass the mechanism. Report blocked and stop.

## Stage Completion Format

```
─────────────────────────────────────────────────
✅ Worktree ready: <name>

Path: <absolute path from CLI JSON>
Branch: <branch from CLI JSON>
Kind: <generic | epic>

Next: cd to the path, then /arc-finishing (Step 0 discriminates on .arcforge-epic) when work is complete
─────────────────────────────────────────────────
```

## Blocked Format

```
─────────────────────────────────────────────────
⚠️ Worktree operation blocked

Target: <name or epic id>
Reason: <exact stderr from the CLI>

Common causes: name already exists, dirty tree without --force, branch
conflict, or a marker'd tree that belongs to another lifecycle.
─────────────────────────────────────────────────
```

## Related Skills

- **Called by:** `arc-agent-driven`, `arc-executing-tasks`
- **After this skill:** Work in the created worktree, then `/arc-finishing` to integrate
