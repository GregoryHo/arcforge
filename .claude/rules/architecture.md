# Architecture

## Zero External Dependencies

No external runtime dependencies — Node.js standard library only. `devDependencies` (Jest, Biome, etc.) are OK.

## File-Based State

No database. All state as YAML, JSON, JSONL, or Markdown files:
- DAG format: `dag.yaml`, `TaskStatus` enum (`pending` | `in_progress` | `completed` | `blocked`)
- Locking: DAG ops use file-based locking via `scripts/lib/locking.js`

## Worktree Isolation

Epics run in their own git worktrees, each tracked via an `.arcforge-epic`
marker file. Worktrees live at a home-based canonical location
(`~/.arcforge-worktrees/<project>-<hash>-<epic>/`) computed by
`scripts/lib/worktree-paths.js`; never hardcode worktree paths in skills,
rules, or tests. See `docs/guide/worktree-workflow.md` for the full
derivation rules and `skills/arc-using/SKILL.md` for the agent Worktree Rule.

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

## Skill Routing & Composition

`arc-using` is the **routing layer** — injected at session start, always in context. It contains the 1% rule: "If there's even a 1% chance a skill applies, invoke it."

Skills compose in two ways depending on type:

| Skill Type | Composition | Mechanism |
|------------|-------------|-----------|
| Workflow | Sequential handoff | Each skill's "After This Skill" section defines next step |
| Discipline | Conditional routing | `arc-using` routing table maps conditions → skills |
| Meta | Direct invocation | User or system triggers as needed |

Discipline skills (arc-tdd, arc-debugging, arc-verifying, arc-requesting-review, arc-receiving-review) are quality gates that fire cross-cutting during any workflow. They MUST be registered in `arc-using`'s routing table to be reliably triggered.

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
```

Worktrees live outside the repo at `~/.arcforge-worktrees/` — derived by
`scripts/lib/worktree-paths.js`, not a tracked directory.
