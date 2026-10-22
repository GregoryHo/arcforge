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

## Everything user-facing is for users, not contributors

arcforge is a **toolkit** distributed to many users via marketplace
install. **Anything a user can read or run is for users.** This is not a
"skills only" rule — it covers every layer of the project that reaches
them, whether through the installed plugin or the public repo.

| Layer | User-facing? | Audience |
|---|---|---|
| `skills/` | Yes | arcforge users on their own projects |
| `hooks/` | Yes | users (loaded into their sessions) |
| `scripts/cli.js`, `scripts/lib/` | Yes | users (the engine) |
| `.claude-plugin/`, `.codex-plugin/`, `.agents/`, `bin/` | Yes | plugin manifests (both hosts) and CLI shim |
| `README.md`, `CHANGELOG.md` | Yes | users deciding whether to install |
| `docs/guide/` | Yes | users (how-to documentation) |
| `website/` | Yes | prospective users |
| `.claude/rules/` (this file) | **No** | contributors editing arcforge |
| `docs/plans/` (design docs) | **No** | contributors planning features |
| `tests/`, `hooks/__tests__/` | **No** | contributors verifying code |
| `evals/` | **No** | contributors measuring behavior |
| Auto-memory | **No** (per-user) | the assistant working on arcforge |

The axis here is **audience**, not packaging. `package.json`'s `files` array is
narrower — it controls the npm/plugin payload, so `docs/guide/` and `website/`
are read on GitHub rather than installed — but everything in the Yes rows is
written for a user, wherever they read it.

One exception: `CHANGELOG.md` is the one user-facing surface that also
carries contributor-only entries, each opening `Contributor-only:` after its
bold lead, because it is the release's full history and the GitHub Release
body. The label is what keeps the audience rule intact — a user can skip
those entries. The procedure is the *Keep contributor-only changes,
labelled* paragraph in step 4 of `.claude/skills/releasing/SKILL.md`.

When you're writing or editing anything in a "User-facing = Yes" row, the
audience is a fresh user installing arcforge tomorrow on their own
project. Contributor-specific quirks, dev-environment warnings, footnotes
about the local repo, and "this only matters when you're editing arcforge"
caveats DO NOT belong there — they pollute the toolkit with concerns that
don't apply to its actual audience.

When tempted to add a footnote, warning, or special-case to a user-facing
layer, ask: *"would a fresh user installing arcforge tomorrow benefit from
this, or is it only relevant to people editing arcforge itself?"* If
contributor-only, it belongs in this file (or another rule, or memory, or a
`docs/plans/` design note) — never in the user-facing surface.

Concrete example: "don't run `/looping` from inside the arcforge dev
repo because the plugin is disabled here" is a contributor fact. It
belongs in this file, not in the `looping` skill, not in
`scripts/lib/loop-session.js`, not in `docs/guide/`. The user-facing
audience never encounters that situation.

## Running a live eval from this checkout

Write nothing inside the repository checkout while a live eval
(`arcforge eval preflight`, `eval ab`, `eval run`) is running. The trial
write guard (`scripts/lib/eval-trial-guard.js`) snapshots the project
around every trial and attributes any change to that trial: the row comes
back `trial_wrote_repo` with `infraError`, and the run stops. In the 6.6.0
round this cost a rerun when the operator saved ledger notes into
`docs/plans/` mid-trial (`docs/plans/v6.6/wp-d/round.md` run 3, D-069
clause (4) in `product/ROADMAP.md`). Keep notes in a scratch directory
outside the repo, or write them after the run ends. The guard skips only
`.git`, `node_modules`, `.eval-trials/` and `evals/results/`; the engine
writes `evals/preflight/` itself, between trials.

A scenario Setup that runs `git commit` in its fixture must run
`git config commit.gpgsign false` first. The trial environment forwards
only a whitelist of variables, and `SSH_AUTH_SOCK` is not on it (#286).
So if your `~/.gitconfig` turns signing on for `~/GitHub/` through an
`includeIf`, the fixture under `.eval-trials/` inherits it, the Setup
fails asking for a signing passphrase, and every trial comes back `setup_failed`
before a session starts. That was 3/3 rows in 6.6.0's run 1, fixed in
#317 (`evals/scenarios/eval-executing-dispatch-acceptance.md`) with the
line `evals/scenarios/eval-sessions-handover-and-resume.md` already had.
As measured on 2026-10-22, 16 scenario files contain `git commit` and 2
set `commit.gpgsign false`; not every one of the 16 commits in its
Setup. The engine-side idea is the `eval-trial-no-commit-signing` wish in
`product/BACKLOG.md`.

An observation, not a problem to fix: Claude Code 2.1.296, installing
the plugin from the GitHub-sourced marketplace, puts a `node_modules`
directory (208 entries, per `docs/plans/v6.6/PLAN.md`) in the cache
payload under `plugins/cache/arcforge-dev/arcforge/<version>/`. Neither
the repo nor the marketplace clone has one, and arcforge needs no runtime
dependency (*Zero External Dependencies* in
`.claude/rules/architecture.md`). If you find it while inspecting a
cached install, it is the host's doing, not ours.
