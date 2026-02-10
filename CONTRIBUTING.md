# Contributing to arcforge

Welcome! arcforge is a skill-based autonomous agent pipeline for Claude Code, Codex, Gemini CLI, and OpenCode. Contributions are welcome across skills, CLI engine, hooks, templates, commands, and agents. Keep in mind that skills target AI agents as their primary consumers, not just humans.

## Table of Contents

- [Philosophy & Principles](#philosophy--principles)
- [Quick Start](#quick-start)
- [Contributing Skills](#contributing-skills)
- [Contributing to the CLI Engine](#contributing-to-the-cli-engine)
- [Contributing Hooks](#contributing-hooks)
- [Contributing Templates](#contributing-templates)
- [Contributing Commands](#contributing-commands)
- [Contributing Agents](#contributing-agents)
- [Test Runner Map](#test-runner-map)
- [Platform Considerations](#platform-considerations)
- [PR Process](#pr-process)
- [Guidelines](#guidelines)
- [Getting Help](#getting-help)

---

## Philosophy & Principles

arcforge is opinionated. Before contributing, understand these principles:

### The Iron Law

```
NO SKILL WITHOUT A FAILING TEST FIRST
```

This is TDD applied to process documentation. You write pressure scenarios, watch agents fail without your skill (baseline), write the skill, watch agents comply, then close loopholes. If you wrote the skill before testing, delete it and start over.

### Core Beliefs

- **Incremental progress over big bangs** — small changes that compile and pass tests
- **Evidence over claims** — if you didn't watch an agent fail without the skill, you don't know if it teaches the right thing
- **Boring and obvious** — choose the simple, readable solution over the clever one

See [`CLAUDE.md`](CLAUDE.md) for the full development philosophy.

---

## Quick Start

```bash
# 1. Fork and clone
gh repo fork GregoryHo/arcforge --clone
cd arcforge

# 2. Install dependencies
npm install

# 3. Install hook dependencies (separate package.json)
cd hooks && npm install && cd ..

# 4. Create a branch
git checkout -b feat/my-contribution   # or fix/..., docs/...

# 5. Make your changes (see sections below)

# 6. Run all tests (must pass all 4 runners)
npm test

# 7. Submit PR
git push -u origin feat/my-contribution
```

---

## Contributing Skills

Skills are the most common contribution type. Read this section carefully.

### Prerequisites

**You must read [`skills/arc-writing-skills/SKILL.md`](skills/arc-writing-skills/SKILL.md) first.** It contains the complete methodology for skill creation, including the TDD mapping, CSO (Claude Search Optimization), and the full creation checklist.

### Naming Convention

All skills follow the pattern `arc-<action>[-<object>[-<scope>]]`:

| Rule | Details |
|------|---------|
| Prefix | `arc-` required |
| Case | kebab-case |
| Voice | Verb-first, active |
| Form | Gerund (-ing) for process skills |

**Good names:**
- `arc-brainstorming` — single action, gerund
- `arc-writing-tasks` — action + target
- `arc-using-worktrees` — tool usage

**Bad names:**
- `arc-coordinator` — agent-noun, use `arc-coordinating`
- `arc-debug` — bare verb, use `arc-debugging`
- `arc-task-writer` — noun-first, use `arc-writing-tasks`

### Directory Structure

```
skills/
  arc-<name>/
    SKILL.md              # Main skill file (required)
    supporting-file.*     # Only if needed (heavy reference, scripts)
```

### Frontmatter Format

```yaml
---
name: arc-<name>
description: Use when [specific triggering conditions and symptoms]
---
```

- Only two fields: `name` and `description`
- Max 1024 characters total
- `name`: letters, numbers, and hyphens only
- `description`: starts with "Use when...", describes triggers only
- **Never summarize the skill's workflow in the description** — Claude may follow the description instead of reading the full skill

### Iron Law Process

1. **RED** — Run pressure scenarios with a subagent WITHOUT the skill. Document baseline behavior and rationalizations verbatim.
2. **GREEN** — Write the skill addressing those specific failures. Re-run scenarios WITH the skill. Agent should now comply.
3. **REFACTOR** — Find new rationalizations, add explicit counters, re-test until bulletproof.

### Test File

Create `tests/skills/test_skill_arc_<name>.py` following the pattern in existing test files (e.g., `test_skill_arc_brainstorming.py`). Tests use pytest and validate skill content structure.

### Quick Checklist

- [ ] Read `arc-writing-skills/SKILL.md` before starting
- [ ] Name follows `arc-<gerund>[-<object>]` pattern
- [ ] Frontmatter has only `name` and `description`
- [ ] Description starts with "Use when..." (triggers only, no workflow)
- [ ] Ran baseline scenario WITHOUT skill (RED)
- [ ] Skill addresses specific baseline failures (GREEN)
- [ ] Closed loopholes from additional testing (REFACTOR)
- [ ] pytest test file created and passing

See [`skills/arc-writing-skills/SKILL.md`](skills/arc-writing-skills/SKILL.md) for the full creation checklist.

---

## Contributing to the CLI Engine

### Architecture

- Entry point: `scripts/cli.js`
- Modules: `scripts/lib/` (YAML parser, DAG schema, models)
- No external runtime dependencies — Node.js only

### Tests

- **Jest**: `npm run test:scripts` — tests in `tests/scripts/`
- **Custom runner**: `npm run test:node` — tests in `tests/node/` (CLI, DAG, models, YAML)

### Conventions

- No external dependencies (keep `devDependencies` minimal)
- Use `execFileSync` instead of `exec` to prevent shell injection
- Follow existing module patterns in `scripts/lib/`

---

## Contributing Hooks

Hooks extend Claude Code behavior through event-driven JavaScript modules. See [`hooks/README.md`](hooks/README.md) for full documentation.

### Architecture

```
hooks/
  hooks.json              # Hook registration
  run-hook.cmd            # Bash dispatcher
  lib/                    # Shared utilities (utils.js, package-manager.js)
  <hook-name>/
    main.js               # Entry point
    README.md             # Hook documentation
```

### Hook Events

| Event | Trigger | Common Use Cases |
|-------|---------|------------------|
| SessionStart | startup, resume, clear, compact | Context injection, counter reset |
| PreToolUse | Before tool execution | Block dangerous operations |
| PostToolUse | After tool completion | Auto-format, type-check |
| UserPromptSubmit | When user submits prompt | Input validation |
| PreCompact | Before context compaction | State checkpointing |
| Stop | When Claude stops | Save state, cleanup |
| SubagentStop | When subagent stops | Subagent-specific cleanup |

### Shared Utilities

Use `hooks/lib/utils.js` for common operations:
- `readStdinSync()` — read stdin for hook chaining
- `log(msg)` — log to stderr (visible in Claude Code)
- `execCommand(cmd, args)` — safe execution (no shell injection)

### Conventions

- Must be Node.js (not bash) for cross-platform support
- Use `path.join()` for file paths
- Temp files go to `os.tmpdir()`
- Tests: `npm run test:hooks` (runs `hooks/__tests__/` with Node `--test`)

---

## Contributing Templates

Templates are subagent prompt definitions used by the pipeline.

### Location

```
templates/
  <name>-prompt.md
```

### Format

Templates use `{VARIABLE}` placeholders and follow a consistent structure:
- Role definition
- Workflow steps
- Rules and constraints
- Anti-patterns

Follow the structure of existing templates (`implementer-prompt.md`, `quality-reviewer-prompt.md`, `spec-reviewer-prompt.md`).

---

## Contributing Commands

Commands are thin delegation wrappers that invoke skills via `/command-name`.

### Location

```
commands/
  <name>.md
```

### Format

```yaml
---
description: "Brief description shown in /help"
disable-model-invocation: true
---

Invoke the arc-<skill-name> skill and follow it exactly as presented to you
```

Commands are not standalone workflows — they delegate to skills. Keep them minimal.

---

## Contributing Agents

Agents are specialized assistants invoked via the Task tool.

### Location

```
agents/
  <name>.md
```

### Format

```yaml
---
name: <name>
description: |
  When to invoke this agent (include examples for Claude's routing)
model: inherit
---

You are a [role] specialist.

## Your Role
...

## Workflow
...
```

---

## Test Runner Map

arcforge uses four separate test runners. **All must pass before submitting a PR.**

| Runner | Command | Location | What It Tests |
|--------|---------|----------|---------------|
| pytest | `npm run test:skills` | `tests/skills/` | Skill content validation |
| Jest | `npm run test:scripts` | `tests/scripts/` | CLI engine (diary, reflect, session-utils) |
| Node `--test` | `npm run test:hooks` | `hooks/__tests__/` | Hook behavior |
| Custom | `npm run test:node` | `tests/node/` | CLI, DAG schema, models, YAML parser |
| **All** | **`npm test`** | All above | **Run this before every PR** |

---

## Platform Considerations

arcforge targets multiple AI coding platforms:

| Component | Platform Scope |
|-----------|---------------|
| Skills, CLI, Templates | Platform-agnostic (all platforms) |
| Hooks, Commands | Claude Code-specific |
| Agents | Claude Code-specific |

At minimum, test your contribution on Claude Code (the primary platform). For platform-specific documentation, see:
- [`docs/README.codex.md`](docs/README.codex.md)
- [`docs/README.opencode.md`](docs/README.opencode.md)
- [`docs/README.gemini.md`](docs/README.gemini.md)

---

## PR Process

### Branch Naming

```
feat/add-arc-brainstorming-skill
fix/cli-yaml-parser-edge-case
docs/update-hook-readme
```

### Commit Messages

Use conventional commits:

```
feat(skills): add arc-debugging skill
fix(cli): handle empty YAML files gracefully
docs(hooks): document session-tracker events
test(skills): add pressure scenarios for arc-planning
```

### For Skill PRs

You must document Iron Law compliance in the PR description:
1. What baseline behavior you observed (RED)
2. How the skill addresses those failures (GREEN)
3. What loopholes you closed (REFACTOR)

### PR Template

A PR template is provided at `.github/PULL_REQUEST_TEMPLATE.md`. Fill it out completely.

---

## Guidelines

### Do

- Read existing skills, hooks, and tests before writing new ones
- Follow existing patterns and conventions
- Run `npm test` before submitting (all 4 runners must pass)
- Include tests for new functionality
- Keep skills under 500 words (use supporting files for heavy reference)
- Use `execFileSync` over `exec` in hooks (prevents shell injection)
- Cross-reference skills with `**REQUIRED BACKGROUND:** ...` syntax

### Don't

- Include sensitive data (API keys, tokens, local paths)
- Summarize skill workflow in the description field
- Skip the Iron Law — no exceptions, not even for "simple additions"
- Use `@`-file syntax to cross-reference skills (force-loads context)
- Add external runtime dependencies without strong justification
- Use bash for hooks (Node.js required for cross-platform)
- Create skills for one-off solutions or standard practices already documented elsewhere

---

## Getting Help

- **GitHub Issues**: Report bugs or suggest features
- **Key files to read first**:
  - [`CLAUDE.md`](CLAUDE.md) — Project conventions and architecture
  - [`skills/arc-writing-skills/SKILL.md`](skills/arc-writing-skills/SKILL.md) — Complete skill authoring guide
  - [`hooks/README.md`](hooks/README.md) — Hook architecture and events
  - [`README.md`](README.md) — Project overview and installation

---

Thanks for contributing to arcforge!
