---
name: arc-using-worktrees
description: Create an isolated git worktree in ANY repo — a parallel branch, experiment, or review checkout. Use when work needs isolation even if the user never says 'worktree'; epic context auto-escalates to arc-coordinating, else the generic CLI.
category: orchestration
status: promoted
---

# arc-using-worktrees

Isolated git worktrees for any repo. Two tiers: a **generic tier** for any
branch, experiment, or review checkout, and a **composition tier** that hands
epic work to the coordinator. Both derive the canonical path at runtime — never
invent one.

## Which Tier Am I In?

Evaluate top-down; first match wins.

| # | Signal | Tier / Route |
|---|--------|--------------|
| 1 | `.arcforge-epic` exists in cwd | Already inside an epic worktree. Never create a nested worktree. Work → `arc-implementing`; integration → `arc-finishing` (its Step 0 selects the epic path). Raw `git merge` here is denied by arc-guard — that refusal is correct; don't fight it. |
| 2 | `specs/<spec-id>/dag.yaml` exists AND the work matches an epic id in it | Composition tier — escalate to the coordinator (below). |
| 3 | `dag.yaml` exists but the work is NOT an epic (experiment, hotfix, review checkout) | Generic tier. Legitimate inside an arcforge project. |
| 4 | No arcforge state at all | Generic tier. Full standalone value. |

A user-stated custom path overrides everything — honor it via raw git;
`worktree list` will still show it, annotated `external`.

## Generic Tier (any git repo)

Head each shell block with the fallback (under Claude Code the SessionStart hook
already exports `ARCFORGE_ROOT`, so it's a harmless no-op). Every command prints
JSON — read the `path` field for the worktree location; never reconstruct or
hardcode it.

### add

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
node "${ARCFORGE_ROOT}/scripts/cli.js" worktree add <name> [--branch <b>] [--from <ref>] [--setup] --json
```

- Branch defaults to `<name>`; an existing branch is checked out as-is.
- A missing branch is created from `--from` (default: base HEAD).
- `--setup` auto-detects and runs the project installer in the new worktree.

### list

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
node "${ARCFORGE_ROOT}/scripts/cli.js" worktree list --json
```

The generic status surface. Each entry is annotated `kind`:
`base` | `epic` | `generic` | `external`. (Use this, not `status --json` —
`status` is the epic-tier surface.) There is no `switch` subcommand — `cd` to the
`path` field to move into a worktree.

### remove

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
node "${ARCFORGE_ROOT}/scripts/cli.js" worktree remove <name> [--force]
```

A dirty worktree refuses removal without `--force`. An `.arcforge-epic`-marked
worktree is refused outright and redirected to the coordinator — that is
epic-tier state, not yours to remove here.

## Composition Tier (epic context)

When the work matches an epic id in `specs/<spec-id>/dag.yaml`, do **not** use
the generic tier. Escalate to the coordinator with one command:

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
node "${ARCFORGE_ROOT}/scripts/cli.js" expand --epic <id> --project-setup
```

The branch is `<spec-id>/<epic-id>` (engine-derived — do not pass `-b`). Read
the absolute `path` from the JSON output. The full epic lifecycle is owned by
`arc-coordinating`; this skill only points you there.

## Finishing (both tiers)

Both tiers hand off to `/arc-finishing`; its Step 0 discriminates on
`.arcforge-epic` and runs the right path:

- `.arcforge-epic` present → epic path (coordinator integrates; arc-guard
  enforces).
- Absent → non-epic path (4-option gate). Its cleanup step removes the
  generic worktree via `node "${ARCFORGE_ROOT}/scripts/cli.js" worktree remove <name>`.

## Red Flags

Stop immediately if you catch yourself thinking:

1. **"I'll just `git worktree add` it directly"** — NO. The CLI derives the canonical path; raw git loses list/remove/finish coherence and, in epic context, breaks the `.arcforge-epic` marker + dag.yaml update the coordinator depends on.
2. **"I'll put it somewhere convenient like `./worktrees/`"** — NO. The path is derived at runtime; anywhere else makes downstream tools fail to find it.
3. **"I'll hardcode the worktree path in my output"** — NO. Read the `path` field from the CLI's JSON.
4. **"It's epic work but `expand` refused"** — NO. The refusal is correct (epic not in DAG, deps incomplete). Report blocked; don't drop to the generic tier to route around it.
5. **"The CLI failed, so I'll do it manually"** — NO. A CLI failure is a real problem, not a cue to bypass the mechanism. Report blocked and stop.

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

Common causes:
- Generic: name already exists, dirty tree without --force, branch conflict
- Epic: epic not in dag.yaml, dependencies incomplete, marker'd tree (use the coordinator)
─────────────────────────────────────────────────
```

## Related Skills

- **Called by:** `arc-agent-driven`, `arc-executing-tasks`
- **Composition tier:** `arc-coordinating` (full epic lifecycle)
- **After this skill:** Work in the created worktree, then `/arc-finishing` (Step 0 discriminates on `.arcforge-epic`) to integrate
