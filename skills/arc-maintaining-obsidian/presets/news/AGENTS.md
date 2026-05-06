---
type: agents-contract
created: <YYYY-MM-DD>
scope: <Vault Scope>
preset: news
schema_path: SCHEMA.md
raw_source: adopted
---

# <Vault Name> — Agent Runtime Contract (News Pipeline)

A news pipeline vault: agents ingest articles into immutable Raw Sources +
typed Article notes, roll them up into Daily / Weekly aggregates, and
maintain Topic threads for ongoing stories. AGENTS.md governs runtime
behavior; types and aggregation templates live in `SCHEMA.md`.

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file at Domain Contract Orientation.
- **Read SCHEMA.md before mutating content.** Mutating modes (ingest, audit) MUST read SCHEMA.md after AGENTS.md.
- **SCHEMA.md governs note types and content structure.**
- **Do not invent new note types** unless the user approves or SCHEMA.md is updated.
- **If AGENTS.md and SCHEMA.md conflict, stop and ask the user.**
- **Schema changes require a log entry.** Append `## [YYYY-MM-DD] schema | <change summary>` to `log.md`.

## Identity

- Agent ingests articles (URL → Raw Source + typed Article note).
- Agent builds DailyAggregate at end-of-day (or on demand) from the day's articles.
- Agent maintains WeeklyAggregate (themes, top stories) and Topic threads (ongoing stories spanning multiple articles).
- Human reviews aggregates, requests deeper dives, archives obsolete topics.

## Layer 1 — Raw Sources (immutable; this preset adopts the pattern)

`Raw/<YYYY-MM-DD>/<source-slug>.md` — captured article content via
defuddle, exactly as extracted. Frontmatter has `sha256` for drift
detection. Re-fetching the same URL on a later date triggers Source Drift
Check (per `arc-maintaining-obsidian` `references/page-templates.md`):
- Same sha256 → article unchanged; skip wiki regeneration.
- Different sha256 → drift (article was updated post-publication); flag.

Layout:
```
Raw/
  2026-05-06/
    bloomberg-fed-statement.md
    reuters-tariff-details.md
  2026-05-07/
    ...
```

## Layer 2 — Wiki (LLM-owned)

Four typed notes — see `SCHEMA.md`:
- **Article** — single news piece, derived from a Raw Source.
- **DailyAggregate** — per-day roll-up.
- **WeeklyAggregate** — per-week themes / top stories.
- **Topic** — ongoing story thread crossing multiple articles.

## Layer 3 — Schema files

- `AGENTS.md` (this file) — operational policy + schema authority
- `SCHEMA.md` — note types, frontmatter, body templates
- `CLAUDE.md` — Claude Code entry shim
- `index.md` — content catalog (Topics + recent aggregates). Rebuilt by `audit lint`.
- `log.md` — append-only operations log
- `_audits/audit-YYYY-MM-DD-<scope>.md` — audit reports

## Scope

This vault tracks: <Vault Scope>

<TODO: list specific news topics this vault covers (e.g., "AI/ML industry
news", "macroeconomic policy", "specific country's politics"). Be
specific — agents classify incoming articles against this scope.

Out of scope: list what does NOT belong here.>

## Language Policy

Single language: <TODO: declare e.g., English | 中文>. Note bodies in
declared language; no callouts.

Frontmatter values stay canonical (English): `tags`, `aliases`, `type`,
field names.

If you want to handle articles in multiple source languages: keep Raw
Sources in their original language (immutable), and write the typed
Article note in the vault's primary language with a `source_language`
frontmatter field.

## Tag Taxonomy

Top-level tags (do not invent new top-levels during ingest unless the
user approves or this list is updated):

<TODO: list 10-20 top-level tags. News-pipeline-typical examples:
topics (e.g., `policy`, `tech`, `markets`), regions (e.g., `us`, `eu`,
`apac`), story stages (e.g., `breaking`, `developing`, `resolved`),
content types (e.g., `analysis`, `op-ed`, `release`).>

Audit checks (LINT) for this vault:
- Unknown top-level tags → flag.
- Tags used 10+ times but missing from the taxonomy → EVOLVE suggestion.
- Near-duplicate tags → flag.

## Source Validation Rules

- **Always download to `Raw/<YYYY-MM-DD>/`** — even if the article is paywalled or you only got the abstract. The immutable original is the truth-on-record.
- **Cite the publisher in `source_author`** — even for re-syndicated content, capture the original outlet.
- **Multiple sources for high-stakes claims:** if an Article makes a high-impact claim (e.g., breaking news, controversial figure quote), prefer 2+ sources. The DailyAggregate references all sources for the same claim.

## Audit Thresholds

LINT additions for this vault — the audit pipeline must honor these:

- **Article freshness:** Article notes > **30 days** old without being referenced by any DailyAggregate / WeeklyAggregate / Topic → flag as orphan (likely an article that was ingested but never integrated). Suggest archive or topic linkage.
- **Topic staleness:** Topic notes with no new Article references in **14 days** → flag for closure or archive. Long-running topics need maintenance.
- **DailyAggregate gaps:** Days with 3+ Article notes but no DailyAggregate → flag for build.
- **WeeklyAggregate cadence:** Weeks > 7 days old without a WeeklyAggregate → flag.
- **Index size:** any `index.md` section > **30 notes** → group by tag/topic.
- **Log rotation:** `log.md` > **300 entries** OR > **50 KB** → rotate to `log-YYYY-MM.md` (month-based archive — news flows fast; year is too coarse).

GROW thresholds (skill detects clusters; vault declares N):
- **Articles without topic linkage:** 3+ articles mentioning a recurring entity / event without a Topic note → suggest Topic creation.
- **Stale topics:** Topics with last linked Article > 30 days ago → suggest archive or wrap-up.

### Audit scope — folders excluded

| Folder | Reason for exclusion |
|---|---|
| `Raw/` | Layer 1 — immutable source artifacts (subject to Source Drift Check only) |
| `_audits/` | Audit reports |
| `_dailies/` | Daily reflection logs (if you keep them) |
| `archive/` | Closed Topics / archived Aggregates |
| `.obsidian/` | Plugin config |

## Maintenance workflows

| Mode | When | Pipeline |
|---|---|---|
| ingest | New article URL or batch | Classify (Article/Topic) → Confirm → Create (Raw + Article) → Index → Propagate → Log |
| query | "what happened with X", "summarize last week" | Orient → Search → Read aggregates first → Synthesize |
| audit | Weekly cadence + on-demand | LINK → LINT → GROW |

### Maintenance cadence

- After every article ingest → skill auto-updates `index.md` and appends to `log.md`.
- End of day → build `DailyAggregate` (skill suggests: "N articles ingested today; build aggregate?").
- End of week → build `WeeklyAggregate` (themes + top stories).
- Daily → `audit lint` (light: orphan articles, log size).
- Weekly → `audit grow` (suggest new Topics, flag stale ones).

### Search backend

QMD collection `<QMD Collection>`. Run `qmd update -c <QMD Collection> &&
qmd embed` after each ingest cycle.
