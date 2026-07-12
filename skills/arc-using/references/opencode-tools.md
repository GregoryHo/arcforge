# OpenCode Tool Mapping

arcforge skills speak in vendor-neutral actions ("dispatch a subagent", "track
task progress", "search the web"). On OpenCode these resolve to the tools below.
Skills are discovered natively via the symlink from `.opencode/plugins/arcforge.js`
(see `.opencode/INSTALL.md`); the actions below use OpenCode's own tools, not any
arcforge-provided tool.

| Action a skill requests | OpenCode equivalent |
|---|---|
| Dispatch a subagent | OpenCode's native subagent/task dispatch — consult your harness's tool list for the exact name. If none is available, execute the role sequentially in the current session. |
| Track task progress / todo list | Durable: arcforge's `.arcforge/sdd/progress.md` ledger. Ephemeral: OpenCode's native task-list tool if present, else a Markdown checklist. |
| Search the web | OpenCode's native web-search/fetch tool if present, else consult your harness. |

## Subagents

OpenCode exposes subagent dispatch through its own tool set, but the exact tool
name is a harness detail — consult your OpenCode tool list rather than assuming a
Claude tool name. When a skill says "dispatch one implementer/reviewer per task"
(`arc-agent-driven`, `arc-dispatching-parallel`, `arc-executing-tasks`,
`arc-looping`), dispatch one subagent per role using whatever your harness
provides. If no subagent tool is available, do not fabricate one — run the roles
sequentially, or tell the user the capability is not installed.

## Task progress

Prefer arcforge's own durable ledger over any harness todo tool for progress that
must survive a compaction or a fresh session: `arc-agent-driven` and
`arc-executing-tasks` append per-task completion to `.arcforge/sdd/progress.md`
(a self-ignoring runtime file), paired with `git log`. Older arcforge wording
that names Claude's `TodoWrite` refers to this task-tracking action — on OpenCode,
use the ledger for durable progress and a native task-list tool (or a Markdown
checklist) for ephemeral in-session tracking.
