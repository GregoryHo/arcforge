# Architecture

This file describes the architecture that binds all work in this repo. The
rewrite that produced it is documented in `docs/plans/v6/PLAN.md`; that plan is
history, this file is the standing rule.

## Zero External Dependencies

No external runtime dependencies — Node.js standard library only.
`devDependencies` (Jest, Biome, etc.) are OK.

## Component Responsibilities

| Directory | Role | Error Strategy |
|-----------|------|----------------|
| `scripts/cli.js` | The engine's only public surface — what skills are allowed to call | Exit with user-facing message |
| `scripts/lib/` | Core engine — canonical source. Serves the CLI and hooks, nothing else | Throw with context |
| `hooks/` | Event-driven extensions | Silent catch |
| `skills/` | Self-contained markdown (+ skill-local scripts) | N/A |
| `docs/` | Design docs, guides, plans | N/A |

**Exception:** two local dashboard control planes (HTTP server + inline HTML)
live in `scripts/lib/` as intentional exceptions to the engine-only role —
the learning dashboard (`scripts/lib/learning-dashboard-http.js` +
`scripts/lib/learning-dashboard.html`) and the eval dashboard
(`scripts/lib/eval-dashboard/`). They are local review/control surfaces, but
they ship in the canonical lib directory.

## Canonical Source Rule

`scripts/lib/` is canonical. Hooks import directly from it (e.g.
`require('../../scripts/lib/utils')`) — there is no `hooks/lib/` re-export
layer. Never duplicate logic — import from the canonical location.

## D1 — Skills Are Self-Contained Black Boxes

A skill directory is a closed unit:

- No file under `skills/<bucket>/<name>/` may `require` / `import` / `source`
  anything outside its own skill directory. Not `scripts/lib/`, not a sibling
  skill.
- Engine functionality is reached exactly one way: a **subprocess call to the
  bare `arcforge` CLI** (D9). Claude Code puts every loaded plugin's `bin/` on
  PATH, and `bin/arcforge` is the shim. That is the black-box boundary.
- Skill prose must not name engine internals (`scripts/lib/...`) or rely on
  environment variables that are not actually set in skill Bash —
  `ARCFORGE_ROOT` (removed) and `CLAUDE_PLUGIN_ROOT` (hooks-only; spike-verified
  UNSET in skill-triggered Bash) are both forbidden in skills.

The payoff is that a skill can be read, tested, moved, or deleted without
reading the engine, and the engine can be refactored without breaking skills.

## D8 — The Dependency Arrow Points One Way

`scripts/**` and `hooks/**` must not reference `skills/`. Combined with D1:

```
skills/  ──(subprocess: bare `arcforge` CLI, plugin bin/ on PATH)──▶  scripts/cli.js  ──▶  scripts/lib/
                                                                       ▲
                                                                 hooks/ ┘   (no arrow back to skills/)
```

The allowlist that once carried the exceptions is **empty, and the test asserts
both the constant and the live scan are empty**. It is a debt counter, not a
design option — an addition is a maintainer decision about the boundary, never
a convenience.

## File-Based State

No database. All state as YAML, JSON, JSONL, or Markdown files. Every on-disk
format has a **single owner in `scripts/lib/` plus a schema test**; skills read
and write those formats through the CLI, never by hand-parsing engine files.

**D3 — task lists**: the one task-list format is a markdown checkbox list, owned
by `scripts/lib/`. There is no second task-state format in v6.

## Worktrees

The generic worktree layer is retained (D2). Worktree paths are derived by
`scripts/lib/worktree-paths.js` — never hardcode a worktree path in skills,
rules, or tests.

## Skill Set and Routing

- 15 self-contained skills, no name prefix (D7); `name` == directory name.
- Invocation is **prose**: a skill fires because its description register
  matches the situation and the router maps that condition to it. There is no
  skill-type taxonomy (no Workflow / Discipline / Meta tiers) and no mandatory
  global routing preamble.
- The router is a **bounded router** and skill index, not an always-on global
  invocation rule. SessionStart injects a minimal bootstrap only; it does not
  inject the router's full content or mandatory routing language.
- The router table and the shipped skill set are a **bidirectional contract**
  (every shipped skill in the table, every table row resolvable), asserted by
  test. Adding or removing a skill means editing the router in the same commit.
- Use the smallest useful workflow. Respect user constraints, higher-priority
  instructions, and harness/eval isolation. For simple answers, read-only
  inspection, grading, or single-skill evals, do not force routing.

## Single Platform

arcforge targets Claude Code only. There is no platform-agnostic /
platform-specific split to maintain, and no second packaging target.

## Directory Layout

```
scripts/          # CLI (scripts/cli.js) and core engine (scripts/lib/)
hooks/            # Claude Code event hooks
skills/core/      # Self-contained skill definitions (the one bucket that ships)
tests/            # Contributor test suites
evals/            # Behavioral eval corpus
docs/             # Guides, design docs, plans
```

## What Is Gone

These structures existed in v5 and were removed by the rewrite. They are named
here so a stale reference is recognizable as stale, not as something to restore:
the SDD pipeline and its DAG/coordinator engine (`dag.yaml`), epic-scoped
worktree framing, `agents/` and `templates/`, the `.codex*` / `.agents/`
multi-platform packaging, the `inject-skills` hook and its `ARCFORGE_ROOT`
injection, and the `arc-` skill-name prefix.

The **grandfather list** that exempted v5 skills from the new enforcement
(`docs/plans/v6/legacy-skills.json`) reached zero and is **closed**: the tests
assert it stays empty, so no skill can buy an exemption from the frozen
frontmatter schema, D1 self-containment, or the naming rule.

History: `docs/plans/v6/PLAN.md`, `docs/plans/v6/progress.md`.
