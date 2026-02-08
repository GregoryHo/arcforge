# arcforge

## Project Overview

Skill-based autonomous agent pipeline for Claude Code, Codex, and OpenCode.

## Commands

- `pytest tests/ -v` - Run tests
- `node scripts/cli.js --help` - CLI help

## Skills

- Skills live in `skills/<skill-name>/SKILL.md`
- Frontmatter: only `name` and `description` (max 1024 chars)
- Description must start with "Use when..." - triggers only, NOT workflow summary
- Follow `skills/arc-writing-skills/SKILL.md` when creating/editing skills
- **Iron Law**: No skill without failing test first (TDD for documentation)

## Architecture

- `scripts/` - Node.js CLI and core engine
- `skills/` - Markdown skill definitions
- `templates/` - Prompt templates for subagents
- `docs/` - Design docs, platform guides, workflow docs
- `.worktrees/` - Git worktrees for epic isolation

## Conventions

- Prefix: `arc-` required for all skills
- Naming: verb-first, gerund (-ing), kebab-case
- Structure: `arc-<action>[-<object>[-<scope>]]`
- Examples: `arc-brainstorming`, `arc-writing-tasks`, `arc-using-worktrees`
- Never summarize skill workflow in description - Claude may follow description instead of reading full skill
- Cross-reference skills with `**REQUIRED BACKGROUND:** ...` not @-file syntax
