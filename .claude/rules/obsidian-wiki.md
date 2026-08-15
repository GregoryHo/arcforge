# Obsidian Wiki

## Purpose

The Obsidian vault is arcforge's knowledge base. Use `/maintaining-obsidian` for all wiki operations (ingest, query, audit).

## Scope — What Goes in the Wiki

| In Scope | Source Location |
|----------|----------------|
| Rules | `.claude/rules/*.md` |
| Skills | `skills/core/*/SKILL.md` |
| Hook docs | `hooks/*/README.md` |
| Guides | `docs/guide/*.md` |
| Design docs | `docs/plans/**/*-design.md`, `docs/plans/v6/decisions/*.md` |
| Research docs | `docs/research/*.md` |

## Out of Scope

- Code files (`.js`) — implementation, not knowledge
- Auto-generated reference dumps (`.txt` >30KB) — low signal-to-noise
- Task lists (`docs/tasks/`) — ephemeral
- Eval workspace directories (`evals/workspaces/`) — in-progress experiments
- Test files — verified by CI
