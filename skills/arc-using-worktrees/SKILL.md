---
name: arc-using-worktrees
description: Use when work needs an isolated workspace — a parallel branch, an experiment, a review checkout, or scoping to one epic — in ANY git repo, even if the user never says "worktree". Epic context auto-escalates to the coordinator; everything else uses the generic worktree CLI.
---

# arc-using-worktrees

Isolated git worktrees for any repo. Two tiers: a **generic tier** for any
branch, experiment, or review checkout, and a **composition tier** that hands
epic work to the coordinator. Both derive the canonical path at runtime — you
never invent one.

## Which Tier Am I In?

Evaluate top-down; first match wins.

| # | Signal | Tier / Route |
|---|--------|--------------|
| 1 | `.arcforge-epic` exists in cwd | Already inside an epic worktree. Never create a nested worktree. Work → `arc-implementing`; integration → `arc-finishing-epic`. Raw `git merge` here is denied by arc-guard — that refusal is correct; don't fight it. |
| 2 | `specs/<spec-id>/dag.yaml` exists AND the work matches an epic id in it | Composition tier — escalate to the coordinator (below). |
| 3 | `dag.yaml` exists but the work is NOT an epic (experiment, hotfix, review checkout) | Generic tier. Legitimate inside an arcforge project. |
| 4 | No arcforge state at all | Generic tier. Full standalone value. |

A user-stated custom path overrides everything — honor it via raw git;
`worktree list` will still show it, annotated `external`.

## Generic Tier (any git repo)

Invoke the CLI through the blessed convention. Put this header at the top of
the shell block (under Claude Code the SessionStart hook already exports
`ARCFORGE_ROOT`, so the fallback is a harmless no-op):

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
if [ ! -d "$ARCFORGE_ROOT" ]; then
  echo "ERROR: ARCFORGE_ROOT=$ARCFORGE_ROOT does not exist. Set ARCFORGE_ROOT to your arcforge checkout." >&2
  exit 1
fi
```

### add

```bash
node "${ARCFORGE_ROOT}/scripts/cli.js" worktree add <name> [--branch <b>] [--from <ref>] [--setup] --json
```

The command prints JSON. Read the `path` field for the worktree location — do
not reconstruct it from pattern knowledge, and do not hardcode it.

Conventions:
- Branch defaults to `<name>`. An existing branch is checked out as-is.
- A missing branch is created from `--from` (default: base HEAD).
- `--setup` auto-detects and runs the project installer in the new worktree.

### list

```bash
node "${ARCFORGE_ROOT}/scripts/cli.js" worktree list --json
```

The generic status surface. Each entry is annotated `kind`:
`base` | `epic` | `generic` | `external`. (Use this, not `status --json` —
`status` is the epic-tier surface.)

### switch

There is no `switch` subcommand. To move into a worktree, `cd` to the `path`
field from the `add` or `list` JSON.

### remove

```bash
node "${ARCFORGE_ROOT}/scripts/cli.js" worktree remove <name> [--force]
```

A dirty worktree refuses removal without `--force`. A worktree carrying an
`.arcforge-epic` marker is refused outright and redirected to the coordinator —
that one is epic-tier state, not yours to remove here.

## Composition Tier (epic context)

When the work matches an epic id in `specs/<spec-id>/dag.yaml`, do **not** use
the generic tier. Escalate to the coordinator with one command:

```bash
node "${ARCFORGE_ROOT}/scripts/cli.js" expand --epic <id> --project-setup
```

The branch is `<spec-id>/<epic-id>` (engine-derived — do not pass `-b`). Read
the absolute `path` from the JSON output. The full epic lifecycle is owned by
`arc-coordinating`; this skill only points you there.

## Finishing (both tiers)

- `.arcforge-epic` present → `/arc-finishing-epic` (coordinator integrates;
  arc-guard enforces).
- Absent → `/arc-finishing` (4-option gate). Its cleanup step removes the
  generic worktree via `node "${ARCFORGE_ROOT}/scripts/cli.js" worktree remove <name>`.

## Red Flags

Stop immediately if you catch yourself thinking:

1. **"I'll just `git worktree add` it directly"** — NO. The CLI derives the
   canonical path; raw git loses list/remove/finish coherence, and in epic
   context it breaks the `.arcforge-epic` marker + dag.yaml update that the
   coordinator depends on.
2. **"I'll put it somewhere convenient like `./worktrees/`"** — NO. The
   canonical path is derived at runtime; putting it elsewhere makes every
   downstream tool fail to find it.
3. **"I'll hardcode the worktree path in my output"** — NO. Read the `path`
   field from the CLI's JSON output.
4. **"It's epic work but `expand` refused"** — NO. The refusal is correct
   (epic not in DAG, dependencies incomplete). Report blocked; do not drop to
   the generic tier to route around it.
5. **"The CLI failed, so I'll do it manually"** — NO. A CLI failure is a real
   problem, not a prompt to bypass the mechanism. Report blocked and stop.

## Stage Completion Format

```
─────────────────────────────────────────────────
✅ Worktree ready: <name>

Path: <absolute path from CLI JSON>
Branch: <branch from CLI JSON>
Kind: <generic | epic>

Next: cd to the path, then /arc-finishing (generic) or /arc-finishing-epic (epic) when work is complete
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

Report the exact CLI error and stop.
─────────────────────────────────────────────────
```

## Related Skills

- **Called by:** `arc-coordinating` (single-epic expansion), `arc-agent-driven`, `arc-executing-tasks`
- **Composition tier:** `arc-coordinating` (full epic lifecycle)
- **After this skill:** Work in the created worktree, then `/arc-finishing` (generic) or `/arc-finishing-epic` (epic) to integrate
