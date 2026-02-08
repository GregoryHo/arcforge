# Agentic-Core - Project Overview

## Purpose

Agentic-Core is a **skill-based autonomous agent pipeline system** for Claude Code, with planned support for OpenAI and Codex. It transforms the agentic workflow from a background orchestrator to an in-session skill-based system.

## Architecture

### Pipeline Flow

```
Brainstorm → Refiner → Planner → Coordinator → Implementer
                                      ↓
                              [Parallel Worktrees]
```

### Key Components

- **Skills** (`skills/`): Claude Code SKILL.md files for each pipeline stage
- **CLI** (`scripts/cli.js`): Command-line interface using Node.js built-in `parseArgs`
- **Coordinator** (`scripts/lib/coordinator.js`): Orchestration and data models (DAG, Epic, Feature, TaskStatus)

### Tech Stack

- **Node.js**: CLI and core engine (`scripts/`)
- **Python**: Test suite only (`tests/`)
- **Testing**: pytest with pytest-cov
- **YAML Parsing**: js-yaml (Node.js side)

## Project Structure

```
arcforge/
├── scripts/                    # Node.js CLI and core engine
│   ├── cli.js                  # CLI entry point
│   └── lib/                    # Core modules
│       └── coordinator.js      # Orchestration logic and data models
├── skills/                     # SKILL.md definitions
│   ├── arc-brainstorming/     # Design exploration
│   ├── arc-refining/        # Spec generation
│   ├── arc-planning/        # DAG breakdown
│   ├── arc-implementing/    # TDD implementation
│   └── ...                     # Other skills
├── templates/                  # Prompt templates for reviewers
├── tests/                      # Test suite (Python/pytest)
├── docs/                       # Documentation and plans
│   └── plans/                  # Implementation roadmaps
└── pyproject.toml              # Test configuration (pytest settings)
```

## Key Features

1. **Skill-based workflows** - Claude Code Skills (SKILL.md) for each pipeline stage
2. **DAG-based coordination** - Dependency tracking and parallel execution
3. **Git worktree parallelization** - Isolated workspaces for epic-level development
4. **Two-stage review** - Spec compliance + code quality per feature
5. **Multi-platform support** - Claude Code, OpenAI, Codex via symlink-based skill discovery
