# The arcforge CLI

arcforge ships one executable, `arcforge`. It is the whole engine surface —
everything the toolkit can do that is not a skill happens through this command.

## Calling it

```bash
arcforge <command> [options]
```

No path, no `node`, no environment variable. Claude Code puts every loaded
plugin's `bin/` directory on `PATH`, so once arcforge is installed the bare
command resolves anywhere — in your project, in a worktree, in a subshell.
(Installation is in the README.)

To confirm it resolved:

```bash
arcforge --help
```

That prints the full command list. This guide is the same surface, organized by
what you would want to do with it.

## The five command groups

| Group | What it does | Guide |
|-------|--------------|-------|
| `worktree` | Isolated checkouts for parallel work | [worktree-workflow.md](worktree-workflow.md) |
| `loop` | Unattended execution over a task list | below |
| `eval` | Measure whether a change alters agent behavior | [eval-system.md](eval-system.md) |
| `learn` | The opt-in session-learning loop | [learning-dashboard.md](learning-dashboard.md) |
| `obsidian` | Register the Obsidian vaults the toolkit may write to | below |

Every group is independent. You can use worktrees and never touch learning, or
run evals without ever starting a loop.

## `worktree`

```bash
arcforge worktree add <name> [--branch <b>] [--from <ref>] [--setup]
arcforge worktree list [--json]
arcforge worktree remove <name> [--force]
```

| Flag | Effect |
|------|--------|
| `--branch` | Branch to check out; defaults to `<name>`, created if it does not exist |
| `--from` | Base ref when the branch has to be created (default: `HEAD`) |
| `--setup` | Detect the project's package manager and run its installer |
| `--json` | Machine-readable listing |
| `--force` | Remove even when the worktree has uncommitted changes |

Worktrees are created under `~/.arcforge/worktrees/`, outside your repository,
so they never show up in your working tree. See the
[worktree guide](worktree-workflow.md) for the full workflow.

## `loop`

```bash
arcforge loop --tasks <file> [options]
```

Runs a markdown task list to completion across fresh Claude Code sessions — one
task per session, restartable, with a cost and iteration ceiling.

| Flag | Effect |
|------|--------|
| `--tasks` | The task list to work through (required); this file is the only task state |
| `--max-runs` | Maximum iterations (default: 50) |
| `--max-cost` | Maximum spend in dollars (default: unlimited) |
| `--task-timeout` | Per-session timeout in seconds (default: 600) |
| `--model` | Passed through to each spawned session |
| `--permission-mode` | Passed through to each spawned session |
| `--allowed-tools` | Passed through to each spawned session |
| `--verify-cmd` | Acceptance floor for tasks that carry no `verify:` line of their own |
| `--verifier` | After the floor passes, spawn an independent verifier; a FAIL retries with feedback, and an exhausted or unreadable verdict blocks |
| `--max-retries` | Verifier feedback retries before blocking (default: 2) |
| `--reset` | Archive prior loop state and start fresh |

The loop keeps its own bookkeeping next to your project so an interrupted run
picks up where it stopped. Nothing carries between iterations except files: the
task list holds what is left and git holds the work.

```bash
arcforge loop --tasks TASKS.md --max-runs 10 --verify-cmd "npm test"
```

The `/looping` skill drives this end to end — start there rather than composing
flags by hand.

## `eval`

```bash
arcforge eval list
arcforge eval lint <name>
arcforge eval preflight <name>
arcforge eval run <name> [--k N] [--model <m>]
arcforge eval ab <name> [--skill-file <path>]
arcforge eval compare <name>
arcforge eval report [name] [--since <ISO>]
arcforge eval history
arcforge eval audit [--top N]
arcforge eval dashboard [--port N]
```

| Flag | Applies to | Effect |
|------|-----------|--------|
| `--k` | `run`, `ab` | Trials per condition |
| `--model` | `run`, `ab`, `preflight` | Model to run trials on |
| `--no-isolate` | `run` | Keep plugins and MCP servers loaded in the trial session (stripped by default); the clean trial directory is used either way |
| `--plugin-dir` | `run`, `ab` | Load a plugin directory into the trial session |
| `--max-turns` | `run`, `ab` | Turn budget, overriding the scenario's own |
| `--skill-file` | `ab` | The skill body injected into the treatment arm |
| `--interleave` | `ab` | Alternate baseline and treatment trials instead of running each arm in a block |
| `--since` | `report` | Bound the report to results at or after an ISO timestamp |
| `--top` | `audit` | How many candidates to surface |
| `--port` | `dashboard` | Port for the live dashboard (default: 3333) |

See the [eval guide](eval-system.md) for scenario format and how to read a
verdict.

## `learn`

Learning is off until you turn it on, and nothing it proposes changes behavior
until you activate it.

```bash
arcforge learn status [--json]
arcforge learn enable --project
arcforge learn disable --project
arcforge learn inbox --project
arcforge learn inspect <candidate-id> --project
arcforge learn approve <candidate-id> --project
arcforge learn materialize <candidate-id> --project
arcforge learn activate <candidate-id> --project
arcforge learn dashboard [--port N]
```

`learn status`, `learn enable` and `learn disable` take `--project` or
`--global`. The candidate commands — `inbox`, `review`, `inspect`, `drafts`,
`approve`, `reject`, `materialize`, `accept`, `activate` — work the same queue
the dashboard does, and are **project-scope only**: the engine refuses
`--global` and points at `arcforge learn dashboard`, where a candidate that
applies to every project is reviewed. They offer only the transitions legal
from a candidate's current state, and `materialize`/`activate` handle instinct
candidates — the artifact the engine can build today. Every command takes
`--json` for machine-readable output; with it, a refusal comes back as
`{"error": "..."}` and a non-zero exit. There are four
further subgroups — `learn diary`, `learn reflect`, `learn instinct`, and
`learn recall` — which the `/learning` skill drives. The
[learning guide](learning-dashboard.md) walks the whole loop.

## `obsidian`

```bash
arcforge obsidian register --path <p> --name <n> [--default] [--preset <p>]
arcforge obsidian list-vaults [--json]
arcforge obsidian set-default <name>
arcforge obsidian unregister <name>
```

The registry lives at `~/.arcforge/obsidian-vaults.json` and the first vault you
register becomes the default. `--scope`, `--search-preferred`, and
`--qmd-collection` tune how a vault is searched; the `/maintaining-obsidian`
skill sets them for you during vault setup.

## JSON output

Commands that take `--json` emit a stable shape you can pipe into `jq`:

```bash
arcforge worktree list --json | jq '.worktrees[] | select(.kind == "generic") | .path'
```

Prefer `--json` for anything scripted. `worktree list` has its shape pinned by a
test that runs the live command, so the fields named in this guide are the fields
it emits; the other commands are stable but not pinned that way, so check the
output once before you build on a specific field.

## Environment

| Variable | Effect |
|----------|--------|
| `CLAUDE_PROJECT_DIR` | Project root the CLI operates on (defaults to the current directory) |

Everything else the CLI needs it derives — you do not point it at its own
installation, and there is no configuration file to create before first use.

## Calling the CLI from a skill

Skills reach the engine exactly one way: by running the bare command in a shell.

```bash
arcforge worktree list --json
```

That is the entire contract. A skill never imports engine code, never builds a
path to the CLI, and never depends on an environment variable being set for it.
If you are writing your own skill, the same rule applies — shell out to
`arcforge`, read its output, and treat everything behind it as a black box. That
is what lets the engine change underneath without breaking what you wrote.

## Exit codes

`0` on success, non-zero on any failure, so the usual shell idiom works:

```bash
arcforge worktree remove stale-branch || echo "removal refused"
```

Where the reason goes depends on how the command failed. When a command runs
and fails, a plain invocation prints a single-line reason to stderr, while
`--json` returns a machine-readable `{"error": "..."}` object on stdout — so a
script parsing stdout reads the reason in the shape it already expects.

Usage errors are the exception: naming no command, or one that does not exist,
prints the help text and exits non-zero regardless of `--json`.
