# arcforge

[![Version](https://img.shields.io/badge/version-3.2.0-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![CI](https://github.com/GregoryHo/arcforge/actions/workflows/ci.yml/badge.svg)](https://github.com/GregoryHo/arcforge/actions/workflows/ci.yml)

arcforge is a minimal, composable skill toolkit for Claude Code, Codex, Gemini CLI, and OpenCode. It gives agents lightweight routing, structured SDD artifacts, and eval-backed quality gates without turning every task into a mandatory workflow.

## Why arcforge

AI coding agents are powerful but uneven. Left to their defaults, they skip design, ignore review, and lose context across sessions. Heavy always-on process creates a different failure mode: the agent follows workflow ceremony when a direct answer or isolated eval would be better.

arcforge solves this with a small composable toolkit. Skills are available in the session, but they are selected when useful: design when intent is unclear, structured specs when artifacts matter, TDD/debugging/review when implementation risk is present, and verification before completion claims.

The outcome: your agent has disciplined workflows when the task justifies them, while preserving direct execution, harness isolation, and small-task speed when a workflow would be overhead.

## How it works

ArcForge is split into three layers:

1. **Core toolkit** — a small promoted surface for routing, design, specs, planning, TDD, debugging, verification, and eval.
2. **Optional workflows** — recipes for SDD, bugfixes, skill authoring, and multi-agent work. These are opt-in by task fit, not global laws.
3. **Harness/eval layer** — tests that verify both activation and non-activation behavior, including instruction-strength regressions.

When your coding agent starts a session, arcforge's hooks inject a minimal bootstrap: ArcForge is available, `ARCFORGE_ROOT` is set, and agents should prefer the smallest useful workflow. Specific skills are read or invoked on demand.

Once a design is approved, ArcForge can build a clear implementation plan and then execute tasks with a two-stage review (spec compliance, then code quality). For larger work, it can create parallel git worktrees so epics can run in isolation.

Skills are tools, not laws. You can enter through `arc-using` for routing help or call any skill directly when you already know the needed workflow.

## Installation

**Note:** Installation differs by platform. Claude Code has a built-in plugin system. Codex and OpenCode require manual setup.

### Claude Code (Plugin Marketplace)

Register the marketplace:

```bash
/plugin marketplace add GregoryHo/arcforge
```

Install the plugin:

```bash
/plugin install arcforge@arcforge-dev
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

Every skill is directly invocable by name — `/arcforge:arc-<name>` (e.g. `/arcforge:arc-tdd`, `/arcforge:arc-debugging`). Unsure where to start? Invoke `/arcforge:arc-using` for routing help.

### Codex

Tell Codex:

```
Fetch and follow instructions from https://github.com/GregoryHo/arcforge/blob/main/.codex/INSTALL.md
```

**Detailed docs:** `docs/README.codex.md`

### Gemini CLI

Tell Gemini CLI:

```
Fetch and follow instructions from https://github.com/GregoryHo/arcforge/blob/main/.gemini/INSTALL.md
```

**Detailed docs:** `docs/README.gemini.md`

### OpenCode

Tell OpenCode:

```
Clone https://github.com/GregoryHo/arcforge to ~/.agents/arcforge, then create directory ~/.config/opencode/skills, then symlink ~/.agents/arcforge/skills to ~/.config/opencode/skills/arcforge, then create directory ~/.config/opencode/plugins, then symlink ~/.agents/arcforge/.opencode/plugins/arcforge.js to ~/.config/opencode/plugins/arcforge.js, then restart opencode.
```

**Detailed docs:** `docs/README.opencode.md`

## Quick Start: Common Commands

These are the most frequently used commands:

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/arcforge:arc-using` | Routing help + skill index | When unsure which skill or workflow applies |
| `/arcforge:arc-brainstorming` | Design exploration | When starting new work or clarifying requirements |
| `/arcforge:arc-writing-tasks` | Break down into tasks | When you have a clear spec and need executable steps |
| `/arcforge:arc-executing-tasks` | Run task list | When tasks are ready and you want to implement |
| `/arcforge:arc-journaling` | Session journaling | At end of session to capture reflections |
| `/arcforge:arc-reflecting` | Analyze patterns | After 5+ journal entries to summarize learnings |

## How Skills Compose

![ArcForge Overview](assets/arcforge-overview.png)

**`arc-using` is the canonical in-session router.** When you're unsure which skill applies, invoke it — it maps concrete conditions to the smallest useful workflow. It is a bounded router and index, not an always-on policy engine: you can also enter at any skill directly. The **[Skills Reference](docs/guide/skills-reference.md)** is the offline companion with full per-skill detail.

| Context | Recommended skills | Entry point |
|---------|-------------------|-------------|
| Vague idea, new requirement | brainstorming, refining, planning | `arc-brainstorming` |
| Clear spec, ready to plan | writing-tasks, executing-tasks | `arc-writing-tasks` |
| Large multi-epic initiative | planning, coordinating, implementing | `arc-planning` |
| Tasks already defined | executing-tasks or agent-driven | `arc-executing-tasks` |
| Bug or regression | debugging, tdd, verifying | `arc-debugging` |
| End of session | journaling | `arc-journaling` |

**Within each path:** TDD (RED-GREEN-REFACTOR) with two-stage review (spec compliance, then code quality).

**Finishing:** `arc-finishing` for both — its Step 0 discriminates on `.arcforge-epic` (epic worktree vs normal branch).

## Terminology

- **epic** - A large initiative that may require parallel worktrees and multiple features.
- **feature** - A scoped deliverable inside an epic.
- **task** - A small, executable step produced by `arc-writing-tasks`.
- **design** - The design document from `arc-brainstorming`.
- **spec** - The structured spec output from `arc-refining`.
- **dag** - The dependency graph produced by `arc-planning`.

## What's Inside

All 33 skills, each listed once. Workflow skills hand off sequentially, discipline skills fire as quality gates when their condition is present, and meta skills are invoked directly (see `arc-using` for routing).

### Routing

- **arc-using** - Canonical router: maps task conditions to the smallest useful skill or workflow

### Workflow Skills (idea → spec → tasks → integration)

- **arc-brainstorming** - Design exploration
- **arc-refining** - Convert design documents to structured specs
- **arc-planning** - Break a spec into an executable DAG of epics
- **arc-writing-tasks** - Break epics or features into executable tasks
- **arc-executing-tasks** - Human-in-the-loop execution with checkpoints
- **arc-agent-driven** - Automated execution with subagent per task and two-stage review
- **arc-implementing** - Orchestrate large project implementation in a worktree
- **arc-coordinating** - Worktree management for multi-epic projects
- **arc-using-worktrees** - Create isolated workspace for epic development
- **arc-dispatching-parallel** - Dispatch multiple agents for independent tasks
- **arc-dispatching-teammates** - Lead-present multi-epic parallelism via agent teammates
- **arc-looping** - Autonomous cross-session loop execution
- **arc-finishing** - Completion with merge decision; Step 0 discriminates epic worktree vs normal branch on `.arcforge-epic`

### Discipline Skills (quality gates)

- **arc-tdd** - Test-driven development (RED → GREEN → REFACTOR cycle)
- **arc-debugging** - Systematic debugging with four phases
- **arc-verifying** - Verification evidence before completion claims
- **arc-requesting-review** - When and how to request code review
- **arc-receiving-review** - How to handle review feedback with technical rigor
- **arc-evaluating** - Measure whether skills and workflows change agent behavior

### Session & Learning Skills

- **arc-journaling** - Session journaling for capturing reflections before compaction
- **arc-reflecting** - Analyze diary entries for insights and patterns
- **arc-learning** - Extract reusable patterns from sessions
- **arc-observing** - Tool call observation for behavioral pattern detection
- **arc-recalling** - Manual instinct creation from session insights
- **arc-managing-sessions** - Session save/resume with alias support
- **arc-compacting** - Strategic manual compaction timing at workflow phase boundaries
- **arc-researching** - Autonomous hypothesis-driven experimentation

The **[Learning Dashboard](docs/guide/learning-dashboard.md)** is the review and control surface for learning candidates: run `arcforge learn dashboard` to open a local UI where you approve, promote, or deactivate each candidate before it changes active behavior.

### Knowledge Base Skills

- **arc-maintaining-obsidian** - Unified Obsidian vault lifecycle: ingest, query, audit (Karpathy LLM Wiki pattern)
- **arc-diagramming-obsidian** - Excalidraw diagram creation inside an Obsidian vault

### Meta & Audit Skills

- **arc-writing-skills** - Maintain ArcForge's own skills and skill tests (project-level meta)
- **arc-auditing-spec** - Read-only advisory audit of an SDD spec family (`/arcforge:arc-auditing-spec <spec-id>`)

### Agents

Skills delegate focused work to 11 specialized subagents (Claude Code only). You rarely invoke these directly — the parenthesized skill dispatches them:

| Agent | Role |
|-------|------|
| `planner` | Architectural analysis and implementation planning (arc-planning, arc-brainstorming) |
| `implementer` | TDD implementation of one task in a fresh context (arc-agent-driven) |
| `spec-reviewer` | Stage 1 review: implementation matches spec exactly (arc-agent-driven) |
| `quality-reviewer` | Stage 2 review: architecture, testing, error handling (arc-agent-driven) |
| `code-reviewer` | Review a completed step against plan and standards (arc-requesting-review) |
| `debugger` | 4-phase root-cause investigation (arc-debugging) |
| `verifier` | Independent acceptance-criteria verification (arc-verifying) |
| `loop-operator` | Monitor an active autonomous loop for stalls (arc-looping) |
| `arc-auditing-spec-internal-consistency` | Spec audit axis 1 (arc-auditing-spec) |
| `arc-auditing-spec-cross-artifact-alignment` | Spec audit axis 2 (arc-auditing-spec) |
| `arc-auditing-spec-state-transition-integrity` | Spec audit axis 3 (arc-auditing-spec) |

### Hooks

ArcForge registers event hooks (Claude Code only) that work silently in the background: a SessionStart bootstrap, session tracking, observation logging, SDD guards, and journaling triggers. They inject at most a few hundred tokens per session and never block normal work. See the **[Hooks System guide](docs/guide/hooks-system.md)** for the full list and how each one behaves.

### Review Templates

- `templates/implementer-prompt.md` - TDD implementer subagent prompt
- `templates/spec-reviewer-prompt.md` - Spec compliance reviewer prompt
- `templates/quality-reviewer-prompt.md` - Code quality reviewer prompt

## CLI Usage

The CLI manages the DAG that `arc-planning` produces. You typically do not run these directly — skills invoke them. For manual use or debugging, the commands are:

The examples below use the bare `arcforge <cmd>` shorthand. In a plugin session, invoke the CLI as `node "${ARCFORGE_ROOT}/scripts/cli.js" <cmd>` — the SessionStart hook sets `ARCFORGE_ROOT` to the installed plugin directory. (The package is not published to npm; the bare shorthand only works from a local checkout via `node scripts/cli.js`.)

```bash
# Show workflow status
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

### Plugin Development

To develop arcforge itself with live plugin loading, see the [Plugin Development](CONTRIBUTING.md#plugin-development) section in CONTRIBUTING.md. Quick version: `npm run dev` starts a Claude session that loads the plugin directly from your local checkout.

### Running Tests

```bash
# Run all tests (5 runners — all must pass)
npm test

# Individual runners
npm run test:scripts          # Jest — CLI engine (scripts/lib/)
npm run test:hooks            # Node --test — hook behavior (hooks/__tests__/)
npm run test:node             # Custom — CLI, DAG schema, models, YAML parser (tests/node/)
npm run test:skills           # pytest — skill content validation (tests/skills/)
npm run test:observer-daemon  # Bash — observer daemon behavior (skills/arc-observing/tests/)

# Run CLI
node scripts/cli.js --help
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer guide.

## Philosophy

- **Incremental progress** - Small changes that compile and pass tests
- **Clear intent** - Boring and obvious code
- **Smallest useful workflow** - Use skills when they add leverage; avoid ceremony when a direct answer is enough
- **Evidence over claims** - Verify before declaring success

## Documentation

**[Knowledge Base](https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge)** — an interconnected wiki knowledge base covering architecture, skills, agents, eval, and design history. Start with the [Master Map](https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge).

| Topic | Link |
|-------|------|
| Skill System | [MOC-ArcForge-Skills](https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge-Skills) |
| Agent System | [MOC-ArcForge-Agents](https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge-Agents) |
| Rules & Standards | [MOC-ArcForge-Rules](https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge-Rules) |
| Eval System | [MOC-ArcForge-Eval](https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge-Eval) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

### In-Repo Guides

These guides live in the repo under `docs/guide/`:

| Guide | Link |
|-------|------|
| CLI Invocation Convention | [docs/guide/cli-invocation.md](docs/guide/cli-invocation.md) |
| Eval System | [docs/guide/eval-system.md](docs/guide/eval-system.md) |
| Composable Skill Eval Coverage | [docs/guide/composable-skill-eval-coverage.md](docs/guide/composable-skill-eval-coverage.md) |
| Hooks System | [docs/guide/hooks-system.md](docs/guide/hooks-system.md) |
| Worktree Workflow | [docs/guide/worktree-workflow.md](docs/guide/worktree-workflow.md) |
| Skills Reference | [docs/guide/skills-reference.md](docs/guide/skills-reference.md) |
| Learning Dashboard | [docs/guide/learning-dashboard.md](docs/guide/learning-dashboard.md) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. It covers:

- **Naming conventions** — `arc-<gerund>[-<object>]` pattern for skills
- **The Iron Law** — no skill without a failing test first (TDD for documentation)
- **Test runners** — all 5 runners must pass before submitting a PR
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
