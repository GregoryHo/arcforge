---
type: agents-contract
created: <YYYY-MM-DD>
scope: <Vault Scope>
preset: news
schema_path: SCHEMA.md
raw_source: adopted
---

# <Vault Name> — Agent Runtime Contract (News Pipeline)

A news pipeline vault: agents ingest articles into immutable Raw Sources + typed Article notes, roll them up into Daily / Weekly aggregates, and maintain Topic threads for ongoing stories. This AGENTS.md file stays thin: runtime identity, scope, language, paths, integration capabilities, and schema authority. Domain schema and policy live in `SCHEMA.md`.

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file at Domain Contract Orientation.
- **Read SCHEMA.md before mutating content.** Mutating modes (ingest, audit) MUST read SCHEMA.md after AGENTS.md.
- **SCHEMA.md governs note types and content structure.**
- **Do not invent new note types** unless the user approves or SCHEMA.md is updated.
- **If AGENTS.md and SCHEMA.md conflict, stop and ask the user.**
- **Schema changes require a log entry.** Append `## [YYYY-MM-DD] schema | <change summary>` to `log.md`.

## Identity

- Agent ingests articles (URL → Raw Source + typed Article note).
- Agent builds DailyAggregate at end-of-day or on demand from the day's articles.
- Agent maintains WeeklyAggregate (themes, top stories) and Topic threads (ongoing stories spanning multiple articles).
- Human reviews aggregates, requests deeper dives, and archives obsolete topics.

## Layer 1 — Raw Sources

This preset adopts the Raw Source pattern. Captured article content lives under `Raw/<YYYY-MM-DD>/<source-slug>.md`, exactly as extracted. The `sha256` drift mechanism is defined by `arc-maintaining-obsidian` `references/page-templates.md`; news-specific drift meaning and source-validation policy are in `SCHEMA.md`.

Layout:

```
Raw/
  2026-05-06/
    bloomberg-fed-statement.md
    reuters-tariff-details.md
  2026-05-07/
    ...
```

## Layer 2 — Typed Notes

Four typed notes live in the domain layer: Article / DailyAggregate / WeeklyAggregate / Topic. Their frontmatter, body templates, aggregation rules, source validation policy, audit thresholds, and Visual Guidance are in `SCHEMA.md`.

## Layer 3 — Contract Files

- `AGENTS.md` (this file) — thin runtime contract + schema authority.
- `SCHEMA.md` — domain schema and policy.
- `CLAUDE.md` — Claude Code entry shim.
- `index.md` — content catalog. Rebuilt by `audit lint`.
- `log.md` — append-only operations log.
- `_audits/` — default audit report folder unless SCHEMA.md declares another path.

## Scope

This vault tracks: <Vault Scope>

<TODO: list specific news topics this vault covers, e.g. "AI/ML industry news", "macroeconomic policy", or a specific region/political system. Be specific so agents classify incoming articles against this scope.

Out of scope: list what does NOT belong here.>

## Language Policy

Single language: <TODO: declare e.g., English | 中文>. Note bodies in declared language; no callouts.

Frontmatter values stay canonical English: `tags`, `aliases`, `type`, field names.

If you want to handle articles in multiple source languages: keep Raw Sources in their original language and write the typed Article note in the vault's primary language with a `source_language` frontmatter field.

## Domain Policy

Read `SCHEMA.md` for domain-specific rules: Article / DailyAggregate / WeeklyAggregate / Topic schemas, tag taxonomy, source validation, aggregation triggers, freshness/staleness thresholds, audit exclusions, and GROW thresholds. Do not duplicate those rules here.

## Integration Capabilities

- Search baseline: filesystem search/read over Markdown files.
- Optional QMD: not required. If enabled in the registry, use it as semantic/hybrid acceleration and sync it after ingest/audit LINK.
- Obsidian runtime: optional. Use `obsidian-cli` for active vault detection, Daily Notes append, plugin state, and live search when available; ordinary Markdown maintenance must work with Obsidian closed.
- URL extraction: prefer Defuddle for article capture.

## Maintenance Workflows

| Mode | When | Pipeline |
|---|---|---|
| ingest | New article URL or batch | Classify → Confirm → Create Raw + Article → Index → Propagate → Log |
| query | "what happened with X", "summarize last week" | Orient → Search → Read aggregates first → Synthesize |
| audit | Weekly cadence + on-demand | LINK → LINT → GROW (mechanics from skill; domain policy from SCHEMA.md) |

## Maintenance Cadence

- After every article ingest → skill updates `index.md` and appends to `log.md`.
- End of day → suggest building `DailyAggregate` when enough articles exist.
- End of week → suggest building `WeeklyAggregate`.
- Daily → light `audit lint`.
- Weekly → `audit grow` for Topic suggestions and stale threads.
