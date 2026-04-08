# Obsidian Wiki

## Purpose

The Obsidian vault is arcforge's knowledge base. Use `arc-maintaining-obsidian` for all wiki operations (ingest, query, audit).

## Scope — What Goes in the Wiki

| In Scope | Source Location |
|----------|----------------|
| Rules | `.claude/rules/*.md` |
| Skills | `skills/*/SKILL.md` |
| Agents | `agents/*.md` |
| Templates | `templates/*.md` |
| Guides | `docs/guide/*.md` |
| Design docs | `docs/plans/*-design.md` |
| Research docs | `docs/research/*.md` |

## Out of Scope

- Code files (`.js`) — implementation, not knowledge
- Auto-generated reference dumps (`.txt` >30KB) — low signal-to-noise
- Task lists (`docs/tasks/`) — ephemeral
- Eval workspace directories (`skills/*-workspace/`) — in-progress experiments
- Test files — verified by CI
