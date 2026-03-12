# Architecture

## Zero External Dependencies

No external runtime dependencies — Node.js standard library only. `devDependencies` (Jest, Biome, etc.) are OK.

## File-Based State

No database. All state as YAML, JSON, JSONL, or Markdown files:
- DAG format: `dag.yaml`, `TaskStatus` enum (`pending` | `in_progress` | `completed` | `blocked`)
- Locking: DAG ops use file-based locking via `scripts/lib/locking.js`

## Worktree Isolation

Epics run in `.worktrees/`, tracked via `.arcforge-epic` marker file. Each worktree is a fully isolated git checkout.

## Component Responsibilities

| Directory | Role | Error Strategy |
|-----------|------|----------------|
| `scripts/lib/` | Core engine — canonical source | Throw with context |
| `hooks/` | Event-driven extensions | Silent catch |
| `skills/` | Markdown definitions (TDD for docs) | N/A |
| `templates/` | Subagent prompts with `{VARIABLE}` placeholders | N/A |
| `commands/` | Thin delegation wrappers to skills | N/A |
| `agents/` | Specialized subagent definitions | N/A |
| `docs/` | Design docs, platform guides | N/A |

## Canonical Source Rule

`scripts/lib/` is canonical. `hooks/lib/` re-exports from it to prevent drift. Never duplicate logic — import from the canonical location.

## Multi-Platform

| Scope | Components |
|-------|-----------|
| Platform-agnostic (all platforms) | Skills, CLI, Templates |
| Claude Code-specific | Hooks, Commands, Agents |

## Directory Layout

```
scripts/          # Node.js CLI and core engine
hooks/            # Claude Code event hooks
skills/           # Markdown skill definitions
templates/        # Subagent prompt templates
commands/         # Thin CLI command wrappers
agents/           # Specialized subagent definitions
docs/             # Design docs, platform guides
.worktrees/       # Git worktrees for epic isolation
```
