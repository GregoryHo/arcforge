# arcforge

arcforge is a skill-based autonomous agent pipeline for Claude Code, Codex, and OpenCode. It moves orchestration into the session so agents follow a consistent workflow from design to implementation.

## How it works

It starts the moment you open your coding agent. Instead of jumping into code, it activates skills that guide you through design, planning, and execution.

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
# /arcforge:brainstorm - Design exploration
# /arcforge:write-tasks - Break epics or features into executable tasks
# /arcforge:execute-tasks - Execute tasks with checkpoints
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
| `/arcforge:brainstorm` | Design exploration | When starting new work or clarifying requirements |
| `/arcforge:write-tasks` | Break down into tasks | When you have a clear spec and need executable steps |
| `/arcforge:execute-tasks` | Run task list | When tasks are ready and you want to implement |
| `/arcforge:journal` | Session journaling | At end of session to capture reflections |
| `/arcforge:reflect` | Analyze patterns | After 5+ diary entries to summarize learnings |

### Typical Flow

```
┌─────────────┐    ┌─────────────┐    ┌───────────────┐    ┌─────────┐
│ brainstorm  │───▶│ write-tasks │───▶│ execute-tasks │───▶│  diary  │
└──────▲──────┘    └─────────────┘    └───────────────┘    └────┬────┘
       │                                                        │
       │           ┌────────────────────────────────────────────┘
       │           │  (after multiple sessions)
       │           ▼
       │    ┌─────────────┐
       │    │   reflect   │
       │    └──────┬──────┘
       │           │  (when patterns emerge)
       │           ▼
       │    ┌─────────────┐
       └────│    learn    │  ─── produces new skills/patterns
            └─────────────┘
```

### Starting Points

| Situation | Start With |
|-----------|------------|
| Vague idea or new requirement | `brainstorm` |
| Clear spec, ready to plan | `write-tasks` or `arc-planning` |
| Tasks already defined | `execute-tasks` |
| End of work session | `diary` |

## The Basic Workflow

1. **routing** - `arc-using` checks context and decides between a large or small flow.

2. **large flow** - `arc-brainstorming` → `arc-refining` → `arc-planning` → `arc-coordinating` → `arc-implementing` (per-epic loops).

3. **small flow** - `arc-writing-tasks` → `arc-executing-tasks` or `arc-agent-driven`.

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

### Review Layer

- **arc-requesting-review** - When and how to request code review
- **arc-receiving-review** - How to handle review feedback with technical rigor

### Review Templates

- `templates/implementer-prompt.md` - TDD implementer subagent prompt
- `templates/spec-reviewer-prompt.md` - Spec compliance reviewer prompt
- `templates/quality-reviewer-prompt.md` - Code quality reviewer prompt

## CLI Usage

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

# Show 5-Question Reboot context
arcforge reboot
```

## Philosophy

- **Incremental progress** - Small changes that compile and pass tests
- **Clear intent** - Boring and obvious code
- **Skill-first workflow** - Use the existing skills before improvising
- **Evidence over claims** - Verify before declaring success

## Development

```bash
# Run tests
pytest tests/ -v

# Run CLI
node scripts/cli.js --help
```

## Documentation

- [Design Document](docs/plans/2026-01-17-arcforge-skill-system-design.md)
- [Implementation Roadmap](docs/plans/2026-01-17-arcforge-implementation-roadmap.md)

## Contributing

Skills live in this repository. To contribute:

1. Create a branch for your change.
2. Follow `skills/arc-writing-skills/SKILL.md` when adding or updating skills.
3. Run tests and keep changes minimal and readable.
4. Submit a PR.

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
