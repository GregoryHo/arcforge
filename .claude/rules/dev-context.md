# Dev Context

Facts about the local development environment for arcforge that are easy
to forget or rediscover incorrectly. Read this whenever you're contributing
to arcforge itself, not when using arcforge as a toolkit on another
project.

## The arcforge plugin is disabled in this repo

Scope: this rule is about the **arcforge plugin specifically** — other
plugins (skill-creator, obsidian, etc.) load normally in this repo. Don't
over-apply this rule to skill-authoring workflows that read a skill via
an explicit `--skill-path` argument rather than through arcforge's plugin
loader.

`.claude/settings.json` sets `"arcforge@arcforge-dev": false` deliberately
to avoid local↔global conflicts during plugin development. Without this
override, a contributor editing plugin internals would be working in a
session where the plugin's own skills, hooks, and injections are loading
from a cached version — meaning your edits don't reflect, the session is
guided by stale rules, and you can't tell whether observed behavior comes
from your edit or from the cache.

The disablement keeps the dev session clean: contributor edits the source,
contributor's session sees no plugin, contributor opts in to plugin loading
explicitly when they want to verify an edit (see next section).

## How to load the plugin during development

Spawn Claude Code with `--plugin-dir .` from inside the repo:

```bash
cd <arcforge-repo>
claude --plugin-dir .
```

This loads the plugin from the source tree (bypassing both the
project-level disablement and the marketplace cache). Use it when you want
to verify that an edit actually changed real session behavior.

For unit tests in `hooks/__tests__/`, `tests/`, etc., no `--plugin-dir` is
needed — those exercise logic in isolation, independent of plugin loading.

For live-session diagnostics where you want to observe how the plugin
behaves for a normal user (e.g., reproducing a user report), test from a
neutral cwd outside the repo (`/tmp/<test>/` or similar). That cwd has no
project-level override, so the plugin loads from its installed version
exactly as any user would see.

## Everything you ship is for users, not contributors

arcforge is a **toolkit** distributed to many users via marketplace
install. **Anything in the shipped surface area is for users.** This is
not a "skills only" rule — it covers every layer of the project that
ends up in a user's installed copy.

| Layer | Ships? | Audience |
|---|---|---|
| `skills/` | Yes | arcforge users on their own projects |
| `hooks/` | Yes | users (loaded into their sessions) |
| `commands/` | Yes | users (CLI surface) |
| `agents/` | Yes | users (delegated by skills) |
| `templates/` | Yes | users (prompt scaffolding) |
| `scripts/lib/`, `scripts/cli.js` | Yes | users (the engine) |
| `docs/guide/` | Yes | users (how-to documentation) |
| `.claude-plugin/` | Yes | plugin manifest |
| `.claude/rules/` (this file) | **No** | contributors editing arcforge |
| `docs/plans/` (design docs) | **No** | contributors planning features |
| `tests/`, `hooks/__tests__/` | **No** | contributors verifying code |
| Auto-memory | **No** (per-user) | the assistant working on arcforge |

When you're writing or editing anything in the "Ships = Yes" rows, the
audience is a fresh user installing arcforge tomorrow on their own
project. Contributor-specific quirks, dev-environment warnings, footnotes
about the local repo, and "this only matters when you're editing arcforge"
caveats DO NOT belong in the shipped surface — they pollute the toolkit
with concerns that don't apply to its actual audience.

When tempted to add a footnote, warning, or special-case to anything in
the "Ships = Yes" rows, ask: *"would a fresh user installing arcforge
tomorrow benefit from this, or is it only relevant to people editing
arcforge itself?"* If contributor-only, it belongs in this file (or
another rule, or memory, or a `docs/plans/` design note) — never in
shipped surface.

Concrete example: "don't run arc-looping from inside the arcforge dev
repo because the plugin is disabled here" is a contributor fact. It
belongs in this file, not in `arc-looping`'s SKILL.md, not in
`scripts/lib/loop.js`, not in `docs/guide/`. The shipped audience never
encounters that situation.
