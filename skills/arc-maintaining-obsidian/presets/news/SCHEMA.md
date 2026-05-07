---
type: schema
created: <YYYY-MM-DD>
scope: type definitions for <Vault Name>
preset: news
---

# <Vault Name> — Domain Schema (News Pipeline)

Four typed notes for a news vault: Article (per-source), DailyAggregate
(per-day roll-up), WeeklyAggregate (per-week themes), Topic (ongoing
story thread). AGENTS.md governs the thin runtime contract; this file declares domain schema and policy: data shapes, tag taxonomy, source validation, aggregation rules, and audit thresholds.

## Universal Frontmatter

```yaml
---
type: article | daily-aggregate | weekly-aggregate | topic
created: YYYY-MM-DD
tags: []
aliases: []
---
```

This vault is single-language (per AGENTS.md `## Language Policy`).
Frontmatter values stay canonical English regardless.

## Article

```yaml
---
type: article
created: YYYY-MM-DD          # ingestion date (when wiki note was created)
published_date: YYYY-MM-DD   # publication date from the source
source_url: ""               # canonical URL (deduplicated)
source_author: ""            # publisher / outlet (e.g., "Bloomberg", "Reuters")
source_language: en          # ISO code if differs from vault language
authors: []                  # bylines, if available
topic: ""                    # wikilink-resolvable Topic name (or empty for standalone)
tags: []                     # taxonomy tags from SCHEMA.md
aliases: []
---
```

```markdown
# Article Title

## Lead
[1-2 sentence what-happened summary — the lede.]

## Key Points
- [Bullet of major facts / claims, in priority order]

## Quotes
> [Direct quotes worth preserving, with attribution]

## Context
[Background needed to understand why this matters; reference Topic if relevant.]

## Source
[[Raw/<YYYY-MM-DD>/<slug>]] (immutable original)
```

### Visual Guidance — Article

- **Embed:** If the source has a key chart / image, embed it inline.
- **Mermaid:** Rare. Only if the article is itself analytical (e.g., explainer with 3+ entities + relationships).
- **Excalidraw:** No.

## DailyAggregate

```yaml
---
type: daily-aggregate
created: YYYY-MM-DD          # the day this aggregates
articles: []                 # wikilinks to all Article notes from this day
top_stories: []              # wikilinks to 3-5 highest-impact articles
themes: []                   # ad-hoc theme strings; promote to Topic if recurring
tags: [aggregate, daily]
aliases: []
---
```

```markdown
# YYYY-MM-DD — Daily Brief

## Top Stories
- [[Article-1]] — [one-line why-it-matters]
- [[Article-2]] — [one-line why-it-matters]
- [[Article-3]] — [one-line why-it-matters]

## Threads
[Recurring themes from the day, with links to the contributing Articles
and any active [[Topic]] threads.]

## Counts
- N articles ingested
- M topics touched
- K new Topics created (link them)

## Notable Quotes
> [Highest-signal quotes from the day, with article attribution.]
```

### Visual Guidance — DailyAggregate

- **Mermaid (suggest when 5+ articles cluster around 1-2 themes):** Show
  theme → article fan-out. Helps the user see which stories dominated.
- **Embed:** Headline image of the top story.
- **Canvas:** Not typical for daily; more useful for weekly.

## WeeklyAggregate

```yaml
---
type: weekly-aggregate
created: YYYY-MM-DD          # Monday of the aggregated week
week_of: YYYY-Www            # ISO week identifier (e.g., 2026-W19)
articles: []                 # all articles from the week
top_stories: []              # highest-impact 5-10
themes: []                   # week's recurring themes
topics_active: []            # Topic threads with movement this week
tags: [aggregate, weekly]
aliases: []
---
```

```markdown
# Week of YYYY-MM-DD — Weekly Roundup

## Themes
- **Theme A:** [synthesis paragraph; cite contributing articles inline.]
- **Theme B:** [...]

## Top Stories
1. [[Article]] — [why it mattered, in 2-3 sentences]
2. ...

## Topic Movement
[Topics that moved this week, what changed, links to relevant articles.]

## Outlook
[What to watch next week — open threads, scheduled events, expected releases.]
```

### Visual Guidance — WeeklyAggregate

- **Mermaid:** Theme → article fan-out, Topic timeline.
- **Canvas (suggest when 4+ active Topics):** Map Topic clusters spatially.
- **Embed:** Week's defining image / chart.

## Topic

```yaml
---
type: topic
created: YYYY-MM-DD
status: active | dormant | resolved | archived
articles: []                 # all Article wikilinks tied to this topic, chronological
last_movement: YYYY-MM-DD    # date of most recent linked article
tags: [topic]
aliases: []
---
```

```markdown
# Topic Title

## What This Is
[2-3 sentences defining the topic / story thread.]

## Timeline
- YYYY-MM-DD — [[Article]] — [event summary]
- YYYY-MM-DD — [[Article]] — [event summary]
[Reverse-chronological after the first 5 entries; oldest first for the lead.]

## Key Players
- [[Person/Org Entity]] — [role in the story]

## Open Questions
- [What's unresolved; what to watch for in future articles.]

## Related Topics
- [[Other-Topic]] — [how they connect]
```

### Visual Guidance — Topic

- **Mermaid (timeline):** `gantt` or `graph LR` for chronological flow of events.
- **Canvas (suggest for hub Topics):** If 10+ articles + 5+ key players, Canvas captures the network better.
- **Embed:** Defining image (event photo, infographic).

## Raw Source

This vault adopts the Raw Source pattern (per AGENTS.md). Articles are
captured to `Raw/<YYYY-MM-DD>/<slug>.md` via defuddle. The skill's
`references/page-templates.md` defines the generic Raw Source frontmatter:

```yaml
---
source_url: ""
source_author: ""
fetched: YYYY-MM-DD
ingested: YYYY-MM-DD
sha256: ""
---
```

Body is hashed AFTER frontmatter (UTF-8, line endings normalized to `\n`).
On re-ingest of the same URL on a later date, the skill compares new
sha256 to stored value: skip (unchanged) or flag drift (article was
updated post-publication).

For news, drift is meaningful: news outlets sometimes edit articles
post-publication. A drift detection lets the agent surface "the article
you ingested has been edited" — important for record-keeping.

## Tag Taxonomy

Top-level tags:

- `news` — Article notes and source-derived news items
- `aggregate` — DailyAggregate and WeeklyAggregate notes
- `topic` — ongoing story threads
- `source` — raw/captured source material
- `region` — geographic scope tags (`region/us`, `region/eu`, ...)
- `sector` — industry or policy sector (`sector/ai`, `sector/finance`, ...)
- `actor` — organizations, governments, named people
- `event` — discrete happenings or announcements
- `analysis` — interpretive / explainer material
- `priority` — editorial priority (`priority/high`, `priority/watch`)

Sub-tag convention: `<top-level>/<specific>`.

LINT checks:
- Unknown top-level tags → flag.
- Article missing at least one scope/topic tag → flag.
- DailyAggregate / WeeklyAggregate missing `aggregate` tag → flag.

## Source Validation Policy

- Every Article must link to exactly one Raw Source unless the user approves a synthesized multi-source Article.
- Keep publisher, byline, published date, canonical URL, and source language when available.
- If extraction confidence is low, mark the Article `status: needs-review` or add an explicit note in the body.
- Do not rewrite Raw Sources; re-ingest produces drift reports.

## Aggregation Rules

- Suggest a DailyAggregate when a date has 3+ Articles or the user asks for a daily roll-up.
- Suggest a WeeklyAggregate when a week has 10+ Articles, 3+ DailyAggregates, or the user asks for a weekly summary.
- Promote a Topic when the same story appears in 3+ Articles across at least 2 days, or when the user explicitly asks to track it.

## Audit Thresholds

- Topic stale after 14 days with no new linked Article unless `status: dormant`.
- Date with 3+ Articles and no DailyAggregate → flag.
- Week with 10+ Articles and no WeeklyAggregate → flag.
- Article not referenced by any DailyAggregate or Topic after 7 days → flag as freshness orphan.
- `log.md` > 200 entries or > 200 KB → suggest log rotation.

## Audit Report

Saved as `_audits/audit-YYYY-MM-DD-<scope>.md`:

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---
```

Standard sections per `references/audit-checks.md`. News-specific
findings to highlight:
- Stale Topics (no movement in N days)
- DailyAggregate gaps (days with articles but no aggregate)
- Article freshness orphans (articles never referenced by aggregate / topic)
- Source Drift (publisher edited post-publication)
