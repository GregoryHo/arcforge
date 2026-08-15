# arcforge

[![Version](https://img.shields.io/badge/version-6.0.0-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![CI](https://github.com/GregoryHo/arcforge/actions/workflows/ci.yml/badge.svg)](https://github.com/GregoryHo/arcforge/actions/workflows/ci.yml)

arcforge is a skill toolkit for Claude Code. It gives your agent 15 self-contained skills, a small CLI engine, and six background hooks — so disciplined workflows are available when the work needs them, and never in the way when it doesn't.

## Why arcforge

Coding agents are capable but uneven. Left to their defaults they skip design, forget to test, and lose the thread between sessions. Bolting an always-on process on top creates the opposite failure: the agent performs workflow ceremony when a two-line answer was the right move.

arcforge takes the middle path. Every skill is a self-contained unit that fires from its own description when the situation matches — and stays quiet otherwise. There is no mandatory routing preamble and no global pipeline you have to enter through.

## How it works

Three pieces, and that is the whole system:

1. **Skills** — 15 markdown skills under `skills/core/`, each a closed unit. A skill is selected because its description matches the situation in front of you, not because a pipeline scheduled it.
2. **CLI engine** — the `arcforge` command, five subcommand groups. Skills reach engine functionality only by calling this CLI; nothing else crosses the boundary.
3. **Hooks** — six background components on Claude Code lifecycle events: session continuity, observation logging, a secrets guard, and compaction handling.

Start anywhere. `/arcforge:using` is a router and index if you want a map; otherwise invoke the skill you already know you need.

## Installation

Register the marketplace:

```bash
/plugin marketplace add GregoryHo/arcforge
```

Install the plugin:

```bash
/plugin install arcforge@arcforge-dev
```

Requires Claude Code. arcforge has zero external runtime dependencies — Node.js standard library only.

### Verify the install

Ask for the router:

```
/arcforge:using
```

It prints a table mapping situations to skills. Every skill is invocable the same way — `/arcforge:<name>`, for example `/arcforge:tdd` or `/arcforge:debugging`.

## Quick start

| You want to | Invoke |
|---|---|
| A map of what's here | `/arcforge:using` |
| Think through an underspecified request | `/arcforge:brainstorming` |
| Turn work into a task list and run it | `/arcforge:executing` |
| Write code test-first | `/arcforge:tdd` |
| Chase down a failure you can't explain | `/arcforge:debugging` |
| Review a change before it merges | `/arcforge:code-review` |

Most skills also fire on their own when their trigger condition shows up. The three marked _user-invoked_ below never do.

## The 15 skills

**Getting oriented**

- **using** — router and index: maps the situation in front of you to the smallest skill that fits

**Doing the work**

- **brainstorming** — structured exploration before a design is settled
- **executing** — break work into a checkbox task list and run it, attended or unattended
- **dispatching** — split work that can run in parallel, isolate each writer, accept on evidence
- **looping** _(user-invoked)_ — hand a task list to an unattended loop that keeps working across fresh sessions
- **finishing** — integrate completed work: merge, PR, keep, or discard

**Quality gates**

- **tdd** — test-first implementation, RED → GREEN → REFACTOR
- **debugging** — root-cause discipline for a failure you cannot yet explain
- **code-review** — review a change before hand-off, then answer the feedback on evidence
- **evaluating** — measurement discipline for claims about agent behavior

**Memory and continuity**

- **sessions** — handover when work stops mid-task, resume when it restarts, decide when to compact
- **learning** _(user-invoked)_ — the opt-in learning loop: session diaries, pattern extraction, review of what activates

**Knowledge base**

- **maintaining-obsidian** — ingest, query, audit, or bootstrap an Obsidian vault
- **diagramming-obsidian** — Excalidraw diagrams inside that vault

**Authoring**

- **writing-skills** _(user-invoked)_ — write an arcforge skill that actually changes agent behavior

Full per-skill detail lives in the **[Skills Reference](docs/guide/skills-reference.md)**.

## Hooks

Six components register on six Claude Code lifecycle events. They run in the background, add at most a few hundred tokens per session, and never block your work.

| Component | Event(s) | What it does |
|---|---|---|
| `session-tracker` | SessionStart, Stop | Creates the session record, injects resume context, finalizes on stop |
| `user-message-counter` | UserPromptSubmit | Counts user messages for the diary threshold |
| `secrets-guard` | PreToolUse | Warn-only scan for hardcoded credentials in edits and commits |
| `observe` | PreToolUse, PostToolUse | Appends tool observations for the opt-in learning subsystem |
| `compact-suggester` | PostToolUse | Suggests `/compact` once a session gets long |
| `pre-compact` | PreCompact | Checkpoints state before compaction |

See the **[Hooks System guide](docs/guide/hooks-system.md)** for per-hook behavior.

## CLI

Skills call the CLI for you; you rarely run it by hand. When you do, the bare `arcforge` form works anywhere Claude Code has loaded the plugin — it puts every plugin's `bin/` on PATH. From a local checkout with no plugin loaded, use `node scripts/cli.js <cmd>`.

Five command groups:

```bash
# 1. worktree — generic isolated workspaces
arcforge worktree add <name> --from main --setup
arcforge worktree list --json
arcforge worktree remove <name> --force

# 2. loop — unattended execution over a markdown task list
arcforge loop --tasks tasks.md --max-runs 10 --verifier

# 3. eval — behavioral measurement harness
arcforge eval list
arcforge eval run <scenario> --k 5
arcforge eval report

# 4. learn — the opt-in learning subsystem (off until you enable it)
arcforge learn status
arcforge learn enable --project
arcforge learn dashboard --port 3334

# 5. obsidian — vault registry
arcforge obsidian register --path <path> --name <name> --default
arcforge obsidian list-vaults --json
```

`arcforge --help` prints the full flag surface for every group.

## Optional subsystems

Three systems ship with arcforge and stay out of your way until you ask for them.

- **Learning** is off until you run `arcforge learn enable --project`. Once on, observations become candidates, candidates need your approval, and approved drafts still need an explicit activation step before they change behavior. The **[Learning Dashboard](docs/guide/learning-dashboard.md)** (`arcforge learn dashboard`) is the review surface for that queue.
- **Eval** measures whether a skill or instruction actually changes what an agent does — trials, behavioral assertions, A/B comparison against a baseline. See the **[Eval System guide](docs/guide/eval-system.md)**.
- **Obsidian** connects a vault so sessions can file knowledge into it and answer from it later. Register a vault, then use `/arcforge:maintaining-obsidian`.

## Development

```bash
npm install
pip install pytest pyyaml    # required for npm run test:skills
```

Run the suites:

```bash
# All 5 test runners
npm test

npm run test:scripts          # Jest — engine (scripts/lib/)
npm run test:hooks            # Node --test — hook behavior
npm run test:node             # Custom — CLI contract, YAML parser, locking
npm run test:skills           # pytest — skill structure validation
npm run test:observer-daemon  # Bash — observer daemon behavior
```

Plus five static checks, all of which run in CI:

```bash
npm run check:versions        # version strings in sync
npm run check:docs            # docs don't promise what the engine lacks
npm run check:cli-consumers   # CLI callers match the CLI surface
npm run check:hooks           # hooks.json schema
npm run check:eval-targets    # eval scenarios target things that exist
npm run lint                  # Biome
```

`npm run dev` starts a Claude Code session with the plugin loaded from your local checkout. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer guide.

## Philosophy

- **Smallest useful workflow** — reach for a skill when it adds leverage; skip the ceremony when a direct answer is enough
- **Evidence over claims** — verify before declaring success
- **Incremental progress** — small changes that compile and pass tests
- **Clear intent** — boring, obvious code

## Documentation

In-repo guides under `docs/guide/`:

| Guide | Link |
|-------|------|
| Skills Reference | [docs/guide/skills-reference.md](docs/guide/skills-reference.md) |
| CLI Invocation Convention | [docs/guide/cli-invocation.md](docs/guide/cli-invocation.md) |
| Hooks System | [docs/guide/hooks-system.md](docs/guide/hooks-system.md) |
| Worktree Workflow | [docs/guide/worktree-workflow.md](docs/guide/worktree-workflow.md) |
| Eval System | [docs/guide/eval-system.md](docs/guide/eval-system.md) |
| Learning Dashboard | [docs/guide/learning-dashboard.md](docs/guide/learning-dashboard.md) |

There is also a published **[Knowledge Base](https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge)** wiki covering architecture and design history.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). It covers the Iron Law (no skill without a failing test first), the test runner map, and the PR process.

## Updating

```bash
/plugin update arcforge
```

## Acknowledgements

arcforge draws inspiration from these excellent projects:

- [superpowers](https://github.com/obra/superpowers) — Skill-based workflow system for Claude Code by Jesse Vincent
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code) — Complete Claude Code configuration collection by Affaan
- [claude-diary](https://github.com/rlancemartin/claude-diary) — Session memory and reflection system by Lance Martin

## License

MIT
