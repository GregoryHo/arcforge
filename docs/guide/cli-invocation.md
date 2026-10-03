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

That mechanism is Claude Code's, and it is the whole discovery story — which is
why it is also the boundary. **Codex CLI does not put a plugin's `bin/` on
`PATH`**, so on a Codex install the bare `arcforge` command does not resolve and
the seven CLI-backed skills report `command not found` at their first engine
step. Nothing is silently degraded: the failure is a missing command, at the
moment the skill reaches for it. Fixing it needs a discovery mechanism arcforge
does not have yet, not a workaround inside a skill — a skill never builds a path
to the CLI (see *Calling the CLI from a skill* below).

To confirm it resolved:

```bash
arcforge --help
```

That prints the full command list. This guide is the same surface, organized by
what you would want to do with it.

## The six command groups

| Group | What it does | Guide |
|-------|--------------|-------|
| `worktree` | Isolated checkouts for parallel work | [worktree-workflow.md](worktree-workflow.md) |
| `loop` | Unattended execution over a task list | below |
| `eval` | Measure whether a change alters agent behavior | [eval-system.md](eval-system.md) |
| `learn` | The opt-in session-learning loop | [learning-dashboard.md](learning-dashboard.md) |
| `obsidian` | Register the Obsidian vaults the toolkit may write to | below |
| `session` | Save, list, alias and resume session archives | below |

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

A task's `verify:` line, or `--verify-cmd` for a task without one, is that
task's floor: it runs after the session exits 0, and a failing floor sends the
task to its retry and then to blocked, never to done. A task with neither has no
floor and is done when its session exits 0 — a clean exit says the session
ended, not that the work happened. The loop prints a warning at start naming
every such task, so you can add a floor before it runs.

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
arcforge eval report [name] [--since <ISO>] [--json]
arcforge eval history
arcforge eval audit [--top N]
arcforge eval dashboard [--port N]
```

| Flag | Applies to | Effect |
|------|-----------|--------|
| `--k` | `run`, `ab` | Trials per condition |
| `--model` | `run`, `ab`, `preflight` | Model to run trials on |
| `--effort` | `run`, `ab`, `preflight` | Reasoning effort passed to every spawned trial |
| `--no-isolate` | `run` | Keep plugins and MCP servers loaded in the trial session (stripped by default); the clean trial directory is used either way |
| `--plugin-dir` | `run`, `ab` | Load a plugin directory into the trial session |
| `--max-turns` | `run`, `ab` | Turn budget, overriding the scenario's own |
| `--skill-file` | `ab` | The skill body injected into the treatment arm |
| `--interleave` | `ab` | Alternate baseline and treatment trials instead of running each arm in a block |
| `--since` | `report` | Bound the report to results at or after an ISO timestamp |
| `--json` | `report` | Print the benchmark as JSON |
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
applies to every project is reviewed. That queue is machine-wide, so
`--project` also means *this* project — another project's candidates are not
listed and cannot be acted on from here. They offer only the transitions legal
from a candidate's current state, and `materialize`/`activate` handle instinct
candidates — the artifact the engine can build today. Every command takes
`--json` for machine-readable output; with it, a refusal comes back as
`{"error": "..."}` and a non-zero exit. There are four
further subgroups — `learn diary`, `learn reflect`, `learn instinct`, and
`learn recall` — which the `/learning` skill drives. The
[learning guide](learning-dashboard.md) walks the whole loop.

The subgroups take their entity id positionally and everything else as a flag.
Here `--project` is a value — a project name, defaulting to the current
directory's — not the scope switch the candidate commands take.

```bash
arcforge learn diary path [--draft] [--project P] [--date D] [--session S]
arcforge learn diary save --content "..." [--project P] [--date D] [--session S]
arcforge learn diary finalize [--project P] [--date D] [--session S]
arcforge learn reflect scan [--project P] [--json]
arcforge learn reflect record <reflect-id> [--diaries "a,b"] [--reflection FILE] [--summary "..."]
arcforge learn instinct status [--project P] [--json]
arcforge learn instinct save <id> --trigger "..." --action "..." [--source manual|reflection] [--domain D] [--evidence "..."] [--evidence-count N]
arcforge learn instinct confirm|contradict <id> [--project P] [--json]
arcforge learn instinct deactivate <id> --project [--json]
arcforge learn instinct restore <name> --project [--json]
arcforge learn recall record <recall-id> [--query "..."] [--instinct-ids "a,b"] [--summary "..."]
```

`--date` defaults to today and `--session` to the current Claude Code session.

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

## `session`

```bash
arcforge session save <alias> --from <path|-> [--session <id-prefix>] [--force]
arcforge session resume <alias|path>
arcforge session list [--limit N] [--json]
arcforge session alias set <name> <archive-path> [--force]
arcforge session alias remove <name>
arcforge session alias list [--json]
```

A session archive is your own record of where a piece of work stands, kept
under `~/.arcforge/sessions/<project>/<date>/archive-<alias>-<YYYYMMDDTHHMMSSZ>.md`
(the UTC time of the `save`) — outside the repository, so it never shows in
`git status`. It holds the same five sections
as a `.handovers/` file — `Where it stands`, `Done`, `Unfinished`, `Decisions`,
`Next` — under a header arcforge fills in from its session record: the session
id, when the record started, duration, tool calls, user messages, and files
modified. It never holds the text of your messages.

`save` reads the five sections from `--from`, which is required: a file —
usually the `.handovers/<date>-<slug>.md` just written — or `-` for stdin. All
five headings must be there, in that order, and none may be empty (write `none`
in a slot with nothing in it); otherwise nothing is written. An optional `# `
title line names the archive; a second title line, or any other text above the
first section, is refused.
Each section is kept verbatim, indentation included. The `sessions` skill writes the sections for you.
Every `save` writes a new file and never replaces one: a second `save` under the
same alias, with `--force`, points the alias at the new archive, and the old
file stays.

```bash
arcforge session save parser-work --from .handovers/2026-10-03-parser.md
```

The header's counts are as the session-tracker record holds them at its
`lastUpdated` stamp, and a line of the header names that stamp. The record
restarts its counts at each diary capture and its start time at each resume, so
the counts run since the last of those, not since the session began. The record
is stamped when a turn ends, so a `save` during a turn leaves that turn out, and
below the diary threshold the record carries no files — the header then reads
`none recorded`; when the project has no session record at all, every count
reads `unknown`. `--session <id-prefix>` reads a named record instead of the
project's most recent one. If two sessions run in the same project at once, the
most recent record may be the other session's — name yours with `--session`.

`resume` takes an alias or a path — an archive or a `.handovers/` file — and
prints its five sections for you to pick the work back up. An archive written by
arcforge 5.x, in its Summary / What Worked / What Failed / Blockers / Next Step
sections, is refused with an error naming that format; nothing converts one.

`list` shows the project's archives newest first (default 20), each with every
alias that points at it. `save` sets its alias for you; `alias set` points
another name at an archive — only a file `save` wrote under this project's
`~/.arcforge/sessions/<project>/`, so a `.handovers/` file is refused (read one
with `resume <path>`). Aliases are per project and live in
`~/.arcforge/sessions/<project>/aliases.json`. A name is letters, digits, `-`
and `_`, at most 128 characters; anything else is refused, never rewritten, and
no name is reserved. Replacing a name that already exists, through `save` or
`alias set`, needs `--force`. `<project>` is the project directory's name, so
two projects with the same directory name share their archives and aliases.
Commands that change aliases at the same time take turns on
`~/.arcforge/sessions/<project>/aliases.lock`; one that waits more than 2
seconds fails with `alias index is locked` and that path.

| Flag | Effect |
|------|--------|
| `--from` | Where `save` reads the five sections: a file, or `-` for stdin (required) |
| `--session` | Read the session record whose id starts with this prefix |
| `--force` | Repoint an alias that already exists |
| `--limit` | Maximum archives to list, a positive integer (default: 20) |
| `--json` | Machine-readable `list` or `alias list` |

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
| `CLAUDE_SESSION_ID` | Session a `learn diary` entry belongs to when `--session` is not given (Claude Code sets it) |
| `ARCFORGE_HOME` | Where arcforge keeps its state (default: `~/.arcforge`) |
| `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS` | Per-trial ceiling for `eval` runs, in milliseconds (default: 900000) |
| `CLAUDE_PACKAGE_MANAGER` | Installer `worktree add --setup` runs, ahead of lock-file detection |
| `EVAL_DEBUG` | When set, `eval` prints each trial's `claude` command and exit details to stderr |
| `NO_COLOR` | When set, stderr output is never colored |

None of them is required: every one has a default, and everything else the CLI
needs it derives — you do not point it at its own installation, and there is no
configuration file to create before first use.

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
