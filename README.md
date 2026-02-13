# arcforge

[![Version](https://img.shields.io/badge/version-1.1.1-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![CI](https://github.com/GregoryHo/arcforge/actions/workflows/ci.yml/badge.svg)](https://github.com/GregoryHo/arcforge/actions/workflows/ci.yml)

arcforge is a skill-based autonomous agent pipeline for Claude Code, Codex, Gemini CLI, and OpenCode. It moves orchestration into the session so agents follow a consistent workflow from design to implementation.

## Why arcforge

AI coding agents are powerful but undisciplined. Left to their defaults, they skip design, ignore review, and lose context across sessions. The result is code that works in the moment but accumulates debt fast.

arcforge solves this by embedding a skill-based workflow directly into the agent's session. Skills trigger automatically based on context — the agent doesn't need to remember commands or follow a manual checklist. Design, planning, TDD, and review happen because the workflow enforces them.

The outcome: your agent behaves like a disciplined engineer. It designs before building, plans before coding, tests before shipping, and learns from every session.

## How it works

When your coding agent starts a session, arcforge's hooks inject available skills into context. Instead of jumping into code, it activates skills that guide you through design, planning, and execution.

Once a design is approved, it builds a clear implementation plan and then executes tasks with a two-stage review (spec compliance, then code quality). For larger work, it can create parallel git worktrees so epics can run in isolation.

Because skills trigger automatically, you do not need to remember commands. The workflow is enforced by the skills themselves.

## Installation

**Note:** Installation differs by platform. Claude Code has a built-in plugin system. Codex and OpenCode require manual setup.

### Claude Code (Plugin Marketplace)

Register the marketplace:

```bash
/plugin marketplace add arcforge
```

Install the plugin:

```bash
/plugin install arcforge@arcforge
```

### Verify Installation

Check that commands appear:

```bash
/help
```

```
# Should see:
# /arcforge:arc-brainstorming - Design exploration
# /arcforge:arc-writing-tasks - Break epics or features into executable tasks
# /arcforge:arc-executing-tasks - Execute tasks with checkpoints
```

### Codex

Tell Codex:

```
Fetch and follow instructions from https://github.com/GregoryHo/arcforge/blob/master/.codex/INSTALL.md
```

**Detailed docs:** `docs/README.codex.md`

### Gemini CLI

Tell Gemini CLI:

```
Fetch and follow instructions from https://github.com/GregoryHo/arcforge/blob/master/.gemini/INSTALL.md
```

**Detailed docs:** `docs/README.gemini.md`

### OpenCode

Tell OpenCode:

```
Clone https://github.com/GregoryHo/arcforge to ~/.config/opencode/arcforge, then create directory ~/.config/opencode/plugin, then symlink ~/.config/opencode/arcforge/.opencode/plugin/arcforge.js to ~/.config/opencode/plugin/arcforge.js, then restart opencode.
```

**Detailed docs:** `docs/README.opencode.md`

## Quick Start: Common Commands

These are the most frequently used commands:

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/arcforge:arc-brainstorming` | Design exploration | When starting new work or clarifying requirements |
| `/arcforge:arc-writing-tasks` | Break down into tasks | When you have a clear spec and need executable steps |
| `/arcforge:arc-executing-tasks` | Run task list | When tasks are ready and you want to implement |
| `/arcforge:arc-journaling` | Session journaling | At end of session to capture reflections |
| `/arcforge:arc-reflecting` | Analyze patterns | After 5+ journal entries to summarize learnings |

### Typical Flow

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐
│ arc-brainstorming│───▶│ arc-writing-tasks│───▶│arc-executing-tasks│───▶│ arc-journaling │
└────────▲─────────┘    └──────────────────┘    └──────────────────┘    └───────┬────────┘
         │                                                                      │
         │           ┌──────────────────────────────────────────────────────────┘
         │           │  (after multiple sessions)
         │           ▼
         │    ┌────────────────┐
         │    │ arc-reflecting │
         │    └───────┬────────┘
         │            │  (when patterns emerge)
         │            ▼
         │    ┌────────────────┐
         └────│  arc-learning  │  ─── produces new skills/patterns
              └────────────────┘
```

### Starting Points

| Situation | Start With |
|-----------|------------|
| Vague idea or new requirement | `arc-brainstorming` |
| Clear spec, ready to plan | `arc-writing-tasks` or `arc-planning` |
| Tasks already defined | `arc-executing-tasks` |
| End of work session | `arc-journaling` |

## The Basic Workflow

1. **routing** - `arc-using` checks context and decides between a large or small flow. Multi-epic work with cross-cutting concerns goes large; single features or bug fixes go small.

2. **large flow** - `arc-brainstorming` → `arc-refining` → `arc-planning` → `arc-coordinating` → `arc-implementing` (with worktree isolation per epic).

3. **small flow** - `arc-writing-tasks` → `arc-executing-tasks` or `arc-agent-driven` (without DAG or worktrees).

4. **execution** - TDD (RED-GREEN-REFACTOR) with two-stage review (spec compliance, then code quality).

5. **finishing** - `arc-finishing-epic` for epic worktrees, `arc-finishing` for normal branches.

**The agent checks for relevant skills before any task.** Workflows are mandatory, not optional.

## Terminology

- **epic** - A large initiative that may require parallel worktrees and multiple features.
- **feature** - A scoped deliverable inside an epic.
- **task** - A small, executable step produced by `arc-writing-tasks`.
- **design** - The design document from `arc-brainstorming`.
- **spec** - The structured spec output from `arc-refining`.
- **dag** - The dependency graph produced by `arc-planning`.

## What's Inside

### Pipeline Skills

- **arc-using** - Routing check for task scale
- **arc-brainstorming** - Design exploration
- **arc-refining** - Spec generation
- **arc-planning** - DAG breakdown
- **arc-coordinating** - Worktree management
- **arc-implementing** - TDD implementation

### Supporting Skills

- **arc-using-worktrees** - Create isolated workspace for epic development
- **arc-finishing-epic** - Epic completion with merge decision
- **arc-finishing** - Branch completion with merge decision
- **arc-writing-tasks** - Break epics or features into executable tasks
- **arc-dispatching-parallel** - Dispatch multiple agents for independent tasks
- **arc-verifying** - Verification mindset (evidence before claims)
- **arc-debugging** - Systematic debugging with four phases
- **arc-writing-skills** - Create and edit skills using TDD principles

### Execution Layer

- **arc-tdd** - Test-driven development (RED → GREEN → REFACTOR cycle)
- **arc-agent-driven** - Automated execution with subagent per task and two-stage review
- **arc-executing-tasks** - Human-in-the-loop execution with checkpoints

### Session & Learning Layer

- **arc-journaling** - Session journaling for capturing reflections before compaction
- **arc-reflecting** - Analyze diary entries for insights and patterns
- **arc-learning** - Extract reusable patterns from sessions
- **arc-observing** - Tool call observation for behavioral pattern detection
- **arc-recalling** - Manual instinct creation from session insights

### Review Layer

- **arc-requesting-review** - When and how to request code review
- **arc-receiving-review** - How to handle review feedback with technical rigor

### Review Templates

- `templates/implementer-prompt.md` - TDD implementer subagent prompt
- `templates/spec-reviewer-prompt.md` - Spec compliance reviewer prompt
- `templates/quality-reviewer-prompt.md` - Code quality reviewer prompt

## CLI Usage

The CLI manages the DAG that `arc-planning` produces. You typically do not run these directly — skills invoke them. For manual use or debugging, the commands are:

```bash
# Show pipeline status
arcforge status

# Get next available task
arcforge next

# Mark task as completed
arcforge complete <task-id>

# Mark task as blocked with reason
arcforge block <task-id> <reason>

# Show parallelizable epics
arcforge parallel

# Create worktrees for ready epics (--verify runs baseline tests)
arcforge expand [--verify]

# Merge completed epics into base branch
arcforge merge [--base <branch>]

# Remove merged worktree directories
arcforge cleanup

# Sync state between worktree and base DAG
arcforge sync [--direction from-base|to-base|both|scan]

# Show 5-Question Reboot context:
#   Where am I? / Where am I going? / What's the goal?
#   What have I learned? / What have I done?
arcforge reboot
```

## Development

### Setup

```bash
npm install
cd hooks && npm install && cd ..
pip install pytest pyyaml    # Required for test:skills
```

### Running Tests

```bash
# Run all tests (4 runners — all must pass)
npm test

# Individual runners
npm run test:scripts   # Jest — CLI engine (scripts/lib/)
npm run test:hooks     # Node --test — hook behavior (hooks/__tests__/)
npm run test:node      # Custom — CLI, DAG schema, models, YAML parser (tests/node/)
npm run test:skills    # pytest — skill content validation (tests/skills/)

# Run CLI
node scripts/cli.js --help
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer guide.

## Philosophy

- **Incremental progress** - Small changes that compile and pass tests
- **Clear intent** - Boring and obvious code
- **Skill-first workflow** - Use the existing skills before improvising
- **Evidence over claims** - Verify before declaring success

## Documentation

- [Architecture Overview](docs/guide/architecture-overview.txt) — System design, module map, and data flow
- [Skills Workflow](docs/guide/skills-workflow.txt) — How skills load, trigger, and chain
- [Skills Reference](docs/guide/skills-reference.md) — Complete skill catalog with workflows and comparison tables
- [Worktree Workflow](docs/guide/worktree-workflow.md) — Epic isolation with git worktrees
- [CLI Reference](docs/guide/cli-reference.txt) — Full command tree, options, and examples
- [Changelog](CHANGELOG.md) — Release history and migration notes

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. It covers:

- **Naming conventions** — `arc-<gerund>[-<object>]` pattern for skills
- **The Iron Law** — no skill without a failing test first (TDD for documentation)
- **Test runners** — all 4 runners must pass before submitting a PR
- **PR process** — branch naming, conventional commits, Iron Law compliance

## Updating

Skills update automatically when you update the plugin:

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
