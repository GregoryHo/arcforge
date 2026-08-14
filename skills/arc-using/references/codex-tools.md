# Codex Tool Mapping

arcforge skills speak in vendor-neutral actions ("dispatch a subagent", "track
task progress", "search the web"). On Codex these resolve to the tools below.

| Action a skill requests | Codex equivalent |
|---|---|
| Dispatch a subagent | `spawn_agent` / `wait_agent` / `close_agent` (requires `multi_agent`; see below) |
| Track task progress / todo list | Durable: arcforge's `.arcforge/sdd/progress.md` ledger. Ephemeral: a Codex task/todo tool if one is installed, else a Markdown checklist. |
| Search the web | Codex's web-search tool when enabled in your config, else consult your harness. |

## Subagent dispatch requires multi-agent support

Add to your Codex config (`~/.codex/config.toml`):

```toml
[features]
multi_agent = true
```

This enables `spawn_agent`, `wait_agent`, and `close_agent` — the mechanism the
skills that dispatch subagents rely on (`executing`,
`arc-dispatching-parallel`, `arc-looping`). When a skill
says "dispatch one implementer/reviewer per task", spawn one agent per role and
close each agent once it has finished all its work. If `multi_agent` is not
enabled, do not fabricate agent calls — execute the roles sequentially in the
current session, or tell the user the capability is off.

## Task progress

arcforge's own durable ledger is the platform-agnostic answer, so prefer it over
any harness todo tool for anything that must survive a compaction or a fresh
session: `executing` records per-task completion
to `.arcforge/sdd/progress.md` (a self-ignoring runtime file), paired with
`git log`. Older arcforge wording that names Claude's `TodoWrite` refers to this
task-tracking action — on Codex, use the ledger for durable progress and a
Codex task/todo tool (or a Markdown checklist) for ephemeral in-session tracking.
