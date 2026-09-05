# Architecture

This file describes the architecture that binds all work in this repo.

## Docs Are the Contract

Documentation outranks implementation: what the docs promise is what the
project owes, and a doc↔engine mismatch is a **build failure**, not a cleanup
chore. The working rules:

- A behavior change ships **with its doc change in the same commit** — a PR
  that changes what the engine does but not what the docs say is incomplete.
- When docs and engine disagree, first decide which one lied: if the doc made
  the promise deliberately, fix the engine; if the doc was wrong, fix the doc
  and say so in the commit message. Never silently pick whichever is cheaper.
- Sync is mechanical wherever possible, prose only where it can't be:
  `check:docs` (paths/commands/flags/skills in every scanned doc resolve
  against the engine), `check:versions`, `check:cli-consumers`, the router
  bijection, and the CLI manifest (`scripts/lib/cli-manifest.js` — docs and
  linters read it; a second hardcoded copy is forbidden).
- A norm written in prose that could be a check is a drift risk — when you add
  a rule, ask what would mechanically fail if someone broke it.

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

There are no exceptions: the test asserts both the exception constant and the
live scan are empty. An addition is a maintainer decision about the boundary,
never a convenience.

## File-Based State

No database. All state as YAML, JSON, JSONL, or Markdown files. Every on-disk
format has a **single owner in `scripts/lib/` plus a schema test**; skills read
and write those formats through the CLI, never by hand-parsing engine files.

**D3 — task lists**: the one task-list format is a markdown checkbox list, owned
by `scripts/lib/`. There is no second task-state format.

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

## Packaging Targets

One codebase, two manifests, no source split. Claude Code installs over
`.claude-plugin/`; Codex CLI installs over `.codex-plugin/plugin.json` +
`.agents/plugins/marketplace.json`. That manifest pair, plus the hook registry's
filename (below), is the *entire* difference — there is no platform-agnostic /
platform-specific source tree, no per-target copy of a skill, and no build step
that emits one target from the other.

What each target gets is not symmetric, and that asymmetry is the contract:

- **Skills port; nothing else does.** All 15 skills load on both hosts. Hooks,
  learning, eval, and loop are Claude Code only — they depend on Claude Code's
  hook protocol and on `claude` being spawnable, neither of which Codex offers.
  Hooks go further than "do not run": the registry is named
  `hooks/claude-code.json` precisely so Codex's hook auto-discovery cannot see
  it, and `check:hooks` keeps it that way.
- **The D9 bare-`arcforge` boundary is Claude Code's.** Codex does not put a
  plugin's `bin/` on PATH (spike-verified), so on Codex the CLI-backed skills
  report `command not found` rather than silently misbehaving. D1/D9 do not
  bend for this: a skill still never builds a path to the engine.

Details and rationale: `.claude/rules/plugin.md` (the manifest pair) and
`product/specs/codex-harness.md` (why the boundary sits here).

## Directory Layout

```
scripts/          # CLI (scripts/cli.js) and core engine (scripts/lib/)
hooks/            # Claude Code event hooks
skills/core/      # Self-contained skill definitions (the one bucket that ships)
tests/            # Contributor test suites
evals/            # Behavioral eval corpus
docs/             # Guides, design docs, plans
```

## Recognizing Stale References

External material (old wiki pages, blog posts, cached docs) may still mention
an SDD pipeline, a DAG engine, `agents/` or `templates/` directories, an
`ARCFORGE_ROOT` variable, or `arc-`-prefixed skill names. None of those exist in
this project — treat such a reference as stale, not as something to restore.

`.codex-plugin/` and `.agents/` are the exception that used to be on that list:
they are shipped files as of 6.1.0 (see *Packaging Targets* above), so material
calling them stale is itself the stale reference.
