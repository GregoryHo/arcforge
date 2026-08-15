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
| Decision records | `docs/decisions/*.md` |
| Design docs | `docs/plans/**/*-design.md` |
| Research docs | `docs/research/*.md` |

## Out of Scope

- Code files (`.js`) — implementation, not knowledge
- Auto-generated reference dumps (`.txt` >30KB) — low signal-to-noise
- Eval scenarios and results — measurement corpus, not knowledge
- Test files — verified by CI
