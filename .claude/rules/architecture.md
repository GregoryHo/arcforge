# Architecture

arcforge is being rewritten as v6 (see `docs/plans/v6/PLAN.md`). This file
describes the **v6 architecture that binds all new work**. Where v5 structures
are still physically on disk, they are listed under [Transition](#transition)
with the phase that removes them — do not build on anything listed there.

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

- No file under `skills/<name>/` may `require` / `import` / `source` anything
  outside its own skill directory. Not `scripts/lib/`, not a sibling skill.
- Engine functionality is reached exactly one way: a **subprocess call to the
  CLI** via `${CLAUDE_PLUGIN_ROOT}`. That is the black-box boundary.
- Skill prose must not name engine internals (`scripts/lib/...`) or rely on
  injected environment (`ARCFORGE_ROOT`).

The payoff is that a skill can be read, tested, moved, or deleted without
reading the engine, and the engine can be refactored without breaking skills.

## D8 — The Dependency Arrow Points One Way

`scripts/**` and `hooks/**` must not reference `skills/`. Combined with D1:

```
skills/  ──(subprocess: ${CLAUDE_PLUGIN_ROOT} CLI)──▶  scripts/cli.js  ──▶  scripts/lib/
                                                        ▲
                                                  hooks/ ┘   (no arrow back to skills/)
```

Existing violations live in an **explicit allowlist**, which is a debt counter,
not a design option — every entry is scheduled for removal, and the allowlist
must reach zero by the end of P5. Adding an entry requires an explicit decision,
never a convenience.

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

- ~14 self-contained skills, no `arc-` prefix (D7); `name` == directory name.
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

v6 targets Claude Code only. There is no platform-agnostic / platform-specific
split to maintain, and no second packaging target.

## Directory Layout

```
scripts/          # CLI (scripts/cli.js) and core engine (scripts/lib/)
hooks/            # Claude Code event hooks
skills/           # Self-contained skill definitions
tests/            # Contributor test suites
evals/            # Behavioral eval corpus
docs/             # Guides, design docs, plans
```

## Transition

These are true **today** and untrue by design — each is scheduled for removal.
Treat anything here as read-only legacy; do not extend it.

| Still on disk | Removed in |
|---|---|
| 30 v5 `arc-*` skills (grandfathered, see below) | P3–P6, replaced by ~14 rewritten skills |
| SDD pipeline, DAG/coordinator engine + `dag.yaml`, epic-scoped worktree framing | P2 |
| `agents/`, `templates/` | P2 |
| `.codex*` / `.agents/` multi-platform packaging | P2 |
| `ARCFORGE_ROOT` injection (`inject-skills` hook) | P2 |
| D8 allowlist entries (engine/hook code reading `skills/`) | P2 shrinks it, P5 zeroes it |

**Grandfather list — `docs/plans/v6/legacy-skills.json` is the single source of
truth.** New enforcement (frozen frontmatter schema, D1 self-containment, naming)
exempts the skills listed there and applies in full to every skill not listed.
A **ratchet** test asserts each entry still exists as `skills/<name>/`: when a
legacy skill is deleted or rewritten, prune its entry in the **same commit**.
The list must be empty by the end of P6. Never add an entry to it.

Plan: `docs/plans/v6/PLAN.md`. Progress: `docs/plans/v6/progress.md`.
