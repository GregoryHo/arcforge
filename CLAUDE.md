# arcforge

## Project Overview

Skill-based autonomous agent pipeline for Claude Code, Codex, Gemini CLI, and OpenCode.

## Commands

- `npm test` - Run all tests (4 runners, all must pass)
- `npm run test:scripts` - Jest tests (scripts/lib/)
- `npm run test:hooks` - Hook tests (Node --test)
- `npm run test:node` - CLI, DAG, models, YAML tests
- `npm run test:skills` - Skill validation (pytest)
- `node scripts/cli.js --help` - CLI help

## Setup

```bash
npm install
cd hooks && npm install && cd ..
```

## Skills

- Skills live in `skills/<skill-name>/SKILL.md`
- Frontmatter: only `name` and `description` (max 1024 chars)
- Description must start with "Use when..." - triggers only, NOT workflow summary
- Follow `skills/arc-writing-skills/SKILL.md` when creating/editing skills
- **Iron Law**: No skill without failing test first (TDD for documentation)

## Architecture

- `scripts/` - Node.js CLI and core engine
- `hooks/` - Claude Code event hooks (Node.js)
- `skills/` - Markdown skill definitions
- `templates/` - Prompt templates for subagents
- `commands/` - Thin CLI command wrappers (delegate to skills)
- `agents/` - Specialized subagent definitions
- `docs/` - Design docs, platform guides, workflow docs
- `.worktrees/` - Git worktrees for epic isolation

## Conventions

- Prefix: `arc-` required for all skills
- Naming: verb-first, gerund (-ing), kebab-case
- Structure: `arc-<action>[-<object>[-<scope>]]`
- Examples: `arc-brainstorming`, `arc-writing-tasks`, `arc-using-worktrees`
- Never summarize skill workflow in description - Claude may follow description instead of reading full skill
- Cross-reference skills with `**REQUIRED BACKGROUND:** ...` not @-file syntax
- Zero external runtime dependencies - Node.js only
- Hooks must be Node.js (not bash) for cross-platform support
- Use `execFileSync` over `exec` in hooks (prevents shell injection)
- Conventional commits: `feat(scope):`, `fix(scope):`, `docs(scope):`

## Gotchas

- `npm test` runs 4 separate runners (Jest, Node --test, custom, pytest) — all must pass
- Hooks have their own `package.json` — run `cd hooks && npm install` separately
- Never use `@`-file syntax in skills (force-loads context into memory)
- Skills max 500 words; use supporting files for heavy reference
