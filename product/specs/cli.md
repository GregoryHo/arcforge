# cli — spec

> Status: shipped v6.2.0 · extended by 6.4.0 (next) · [ROADMAP](../ROADMAP.md)
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
- **B-1 Bare command, no setup.** `arcforge <command>` resolves anywhere on a
  host that puts a loaded plugin's `bin/` on PATH — no path construction, no
  `node` prefix, no environment variable, no config file before first use. That
  host mechanism is the whole discovery story, and it is the host's to provide:
  Claude Code does, Codex CLI does not, so on Codex the bare command does not
  resolve and the CLI-backed skills report `command not found`
  ([codex-harness](codex-harness.md) B-3). A skill or script that needs the
  engine MUST shell out to the bare command and treat everything behind it as
  opaque — the answer to a host without the mechanism is a decision recorded
  here, never a skill that builds its own path.
- **B-2 No required environment.** The CLI runs with no environment variable
  set. It reads `CLAUDE_PROJECT_DIR` for the project root (defaulting to the
  current directory) and derives everything else. It MUST NOT require being
  pointed at its own installation. Every other variable it reads is an
  optional override with a default: `CLAUDE_SESSION_ID` (the session a
  `learn diary` entry belongs to), `ARCFORGE_HOME` (the state root, default
  `~/.arcforge`), `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS` (the eval trial ceiling,
  [eval](eval.md)), `CLAUDE_PACKAGE_MANAGER` (the installer
  `worktree add --setup` runs), `EVAL_DEBUG` (eval trial diagnostics on
  stderr), and `NO_COLOR` (plain stderr). The guide lists the same set, and a
  test holds both to the variables the engine actually reads.

### Surface
- **B-3 Five independent command groups.** `worktree`, `loop`, `eval`, `learn`,
  `obsidian`. Independence is a contract: any group is usable without ever
  touching the others — worktrees without learning, evals without loops.
- **B-4 One manifest, no copies.** The command surface is defined once in the
  engine's CLI manifest; documentation checks and linters read it, and a second
  hardcoded copy of the command list is forbidden
  (`.claude/rules/architecture.md`, "Docs Are the Contract"). `--help` prints
  the full list, and a test holds each command's help flags equal to its
  manifest flags; the guides describe the same surface and
  `npm run check:docs` holds them to it.
- **B-9 A sixth group, `session` (6.4.0).** `arcforge session` takes
  `save <alias>`, `resume <alias|path>`, `list` and `alias`, and is
  independent in B-3's sense: it works with learning off, with no worktree and
  no loop. `save` writes an archive whose metrics header the engine fills from
  the session-tracker record — duration, tool calls, user messages, files
  modified ([hooks](hooks.md) B-8) — and whose five narrative sections
  (`Where it stands`, `Done`, `Unfinished`, `Decisions`, `Next`) the caller
  supplies; the engine writes none of the narrative and calls no model.
  `resume` takes an alias or a path, reads either an archive or a
  `.handovers/` file in the five sections, and prints it for the caller to
  present; an archive in v5's section set is not supported. `list` shows
  the project's archives, and `alias` manages the project's alias index. An
  alias is letters, digits, `-` and `_`, at most 128 characters, and none of
  the alias module's reserved words. The group sits in the one manifest (B-4)
  and under the exit-code API (B-5). Until 6.4.0 ships, B-3 names the five
  groups shipped today (D-055, D-056).

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
  unpinned — the guide says so rather than overpromising. Residual: the
  `--json` shapes of `learn`, `obsidian`, and `eval report` are held by no
  test (their manifest `output` is `null`), so a renamed or dropped field
  there fails nothing. Pinning them needs deterministic fixtures for the
  `~/.arcforge` state they read; until then a script built on one of their
  fields is relying on intent, not on a check.

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
test holds that manifest against the live CLI in both directions: command labels,
pinned `--json` shapes, and each command's flags — every flag a handler reads is
declared, and every declared flag is one a handler reads (`--json` included: a
command declares it exactly when its handler acts on it). Its structural
invariants are the exit-code API (B-5) and the stability of a `--json` shape once a
command offers one (B-6).

The `session` group (B-9) is the exception from 6.4.0, because no other area
stands behind it: the archive is a markdown file under
`~/.arcforge/sessions/<project>/<date>/`, owned by `scripts/lib/session-utils.js`
— an engine-written metrics header, then the five handover sections, and no text
of the user's messages ([learning](learning.md) B-20). The alias index is `~/.arcforge/sessions/<project>/aliases.json`, owned by
`scripts/lib/session-aliases.js`: a `version` and an `aliases` map from name to
`{ sessionPath, createdAt, updatedAt, title }`, written through the shared
atomic-write helper ([learning](learning.md) B-22). `<project>` is the sanitized
directory basename, so two same-named projects share both (D-037, D-056).

## Decisions

- **D-002** — the bare-command discovery contract (B-1) leans on the host
  harness putting plugin `bin/` on PATH; 6.0.0 commits to Claude Code as that
  host.
- **D-013** — 6.1.0 adds a second host that does *not* provide that mechanism,
  and accepts the loud `command not found` rather than bending B-1.
- **D-019** — 6.1.2 repairs the CLI's message and contract drift as a patch that
  touches no eval-backed path (B-4, B-6).
- **D-020** — new commands wait for 6.2.0, a minor (B-3).
- **D-040** — `learn instinct restore` is one of those commands (B-3).
- **D-055** — 6.4.0 is a minor because it adds a command group (B-9).
- **D-056** — that group is `arcforge session`, an engine-written metrics
  header plus the handover's five sections, aliased per project (B-9).

See the [ROADMAP Decision Log](../ROADMAP.md#decision-log).

The single-executable and single-manifest choices predate this log; rationale
inline above, mechanical enforcement in `npm run check:docs` /
`check:cli-consumers`.
