# cli — spec

> Status: shipped v6.0.0 · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose

One executable, `arcforge`, is the entire engine surface: everything the toolkit
can do that is not a skill happens through this command. It is the black-box
boundary the whole architecture leans on — skills, users, and scripts all reach
the engine the same way, through a subprocess, so the engine can change
underneath without breaking anything written against it.

## Scope

- **In scope:** the invocation contract (bare command on PATH); the command-group
  surface; the single-manifest rule; output and exit-code contracts; the
  zero-dependency stance.
- **Out of scope:** what each command group *does* domain-wise — owned by
  [learning](learning.md), [eval](eval.md), [obsidian](obsidian.md), and
  [worktrees-loop](worktrees-loop.md); the skills that drive the CLI
  ([skill-system](skill-system.md)).

## Behavior

### Invocation
- **B-1 Bare command, no setup.** `arcforge <command>` resolves anywhere once
  the plugin is installed — no path construction, no `node` prefix, no
  environment variable, no config file before first use. The host puts the
  plugin's `bin/` on PATH; that mechanism is the whole discovery story. A skill
  or script that needs the engine MUST shell out to the bare command and treat
  everything behind it as opaque.
- **B-2 One environment input.** The CLI reads `CLAUDE_PROJECT_DIR` for the
  project root (defaulting to the current directory) and derives everything
  else. It MUST NOT require being pointed at its own installation.

### Surface
- **B-3 Five independent command groups.** `worktree`, `loop`, `eval`, `learn`,
  `obsidian`. Independence is a contract: any group is usable without ever
  touching the others — worktrees without learning, evals without loops.
- **B-4 One manifest, no copies.** The command surface is defined once in the
  engine's CLI manifest; documentation checks and linters read it, and a second
  hardcoded copy of the command list is forbidden
  (`.claude/rules/architecture.md`, "Docs Are the Contract"). `--help` prints
  the full list; the guides describe the same surface and `npm run check:docs`
  holds them to it.

### Output contracts
- **B-5 Exit codes are the API.** `0` on success and non-zero on any failure,
  so `cmd || handle` works from any shell. For a command that runs and fails,
  the reason travels with the invocation style: a single-line message on
  stderr, or a machine-readable error object on stdout under `--json`. Usage
  errors — no command, or an unknown one — print help and exit non-zero
  whatever the flags. Failures are user-facing
  messages, never stack traces (`.claude/rules/coding-standards.md`, error
  tiers).
- **B-6 `--json` where scripting is expected.** Commands that take `--json`
  emit a stable shape suitable for `jq`. `worktree list --json` has its shape
  pinned by a test that runs the live command; other shapes are stable but
  unpinned — the guide says so rather than overpromising.

### Implementation stance
- **B-7 Zero external runtime dependencies.** The engine runs on the Node.js
  standard library alone; `devDependencies` are for contributors. Nothing a
  user installs pulls a dependency tree.
- **B-8 State is files, never a database.** Each format has a single engine
  owner, and skills reach state only through the CLI — ownership and format
  rules per `.claude/rules/architecture.md` (File-Based State).

## Data / domain model

This area owns no on-disk format of its own: each command group's state belongs to
the area behind it, and the CLI is only the door to it (B-8). What it does own is
the command surface — command groups, flags, and the `--json` field promises — held
once in `scripts/lib/cli-manifest.js`, with a second copy forbidden (B-4). A contract
test holds that manifest against the live CLI, but not uniformly: command labels and
pinned `--json` shapes match in both directions, while flags are checked one way —
every flag the live CLI reads must be declared, and the manifest may declare more
(the global `--json` is listed per command yet never derived live). Its structural
invariants are the exit-code API (B-5) and the stability of a `--json` shape once a
command offers one (B-6).

## Decisions

- **D-002** — the bare-command discovery contract (B-1) leans on the host
  harness putting plugin `bin/` on PATH; 6.0.0 commits to Claude Code as that
  host. See the [ROADMAP Decision Log](../ROADMAP.md#decision-log).

The single-executable and single-manifest choices predate this log; rationale
inline above, mechanical enforcement in `npm run check:docs` /
`check:cli-consumers`.
