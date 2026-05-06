---
type: agents-contract
created: <YYYY-MM-DD>
scope: <Vault Scope>
preset: llm-wiki
schema_path: SCHEMA.md
raw_source: adopted
---

# <Vault Name> — Agent Runtime Contract

This vault follows Andrej Karpathy's 3-layer LLM Wiki pattern. The LLM
owns the Wiki layer; the human curates Raw Sources and asks queries.
This file declares operational policy and schema authority. Note-type
templates live in `SCHEMA.md`.

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file at Domain Contract Orientation.
- **Read SCHEMA.md before mutating content.** Mutating modes (ingest, audit) MUST read SCHEMA.md after AGENTS.md.
- **SCHEMA.md governs note types and content structure.**
- **Do not invent new note types** unless the user approves or SCHEMA.md is updated.
- **If AGENTS.md and SCHEMA.md conflict, stop and ask the user.**
- **Schema changes require a log entry.** Append `## [YYYY-MM-DD] schema | <change summary>` to `log.md`.

## Identity

- The Wiki layer is LLM-owned (Source / Entity / Synthesis / MOC / Decision / Log — see SCHEMA.md).
- Raw Sources (`Raw/`, `Excalidraw/`, etc.) are immutable originals — the LLM reads but never modifies them.
- The human curates Raw Sources, asks queries, and reviews proposed updates.

## Layer 1 — Raw Sources (immutable; this preset adopts the pattern)

`Raw/<topic>/*` — original artifacts (articles, papers, screenshots, design docs). Read-only for the LLM. Add subfolders as topics emerge. The Wiki layer extracts and summarizes these; originals stay untouched so you can re-extract or diff against future updates.

Re-ingest behavior is governed by `sha256` (see `arc-maintaining-obsidian` skill, `references/page-templates.md`):
- Same body sha256 → skip (content unchanged).
- Different sha256 → drift detected; prompt before overwriting wiki Source note.
- Empty sha256 (legacy) → backfill via `audit lint --backfill-sha256`.

## Layer 2 — Wiki (LLM-owned)

Six typed notes — see `SCHEMA.md` for full templates: Source / Entity / Synthesis / MOC / Decision / Log. Bilingual format is the default (toggle below in Language Policy).

## Layer 3 — Schema files

- `AGENTS.md` (this file) — operational policy + schema authority
- `SCHEMA.md` — note types, frontmatter, body templates, Visual Guidance
- `CLAUDE.md` — Claude Code entry shim, redirects to here
- `index.md` — content catalog. Rebuilt by `audit lint`. Read first when querying.
- `log.md` — append-only operations log (`## [YYYY-MM-DD] <op> | <detail>`)
- `_audits/audit-YYYY-MM-DD-<scope>.md` — audit reports

## Scope

This vault owns: <Vault Scope>

<TODO: list specific topics this vault owns. Be specific so agents can
classify ambiguous incoming material.

Topics out of scope: list neighbouring vaults if any, and what content
belongs in each. Cross-vault wikilinks do not resolve — use plain text
references with vault name when unavoidable.>

## Language Policy

This vault is **bilingual** (default for `llm-wiki` preset): every wiki-layer note has `langs: [en, zh]` and uses two callout blocks:

```
> [!multi-lang-en]
> English content here.

> [!multi-lang-zh]
> 中文內容寫這裡。
```

H1 outside callouts is bilingual: `# 中文標題 / English Title`.

Raw Sources are NOT bilingual (immutable originals). Log entries take whichever language the user used. Audit reports are English only. Frontmatter values stay canonical (English).

See `SCHEMA.md` `## Bilingual Format` for the full callout structure per type.

<TODO: if your vault is monolingual, replace this section with "Single language: <lang>" and remove `langs: [en, zh]` from SCHEMA.md frontmatter for every type.>

## Tag Taxonomy

Top-level tags (do not invent new top-levels during ingest unless the user approves or this list is updated). Sub-tag convention: `<top-level>/<sub>` (e.g., `arcforge/skills`).

<TODO: list 10-20 top-level tags that organize this vault. The skill's
audit can grep your vault for current `tags:` frequency to propose a
starter list — ask "propose top-level tags from current vault content".>

Audit checks (LINT) for this vault:
- **Unknown tags** — top-level tags not in this list, and not registered as sub-tags → flag.
- **Tag taxonomy drift** — tags used 10+ times but missing from this taxonomy → EVOLVE suggestion.
- **Near-duplicate tags** (`ai` vs `AI` vs `artificial-intelligence`, `eval` vs `evaluation`, `cot` vs `chain-of-thought`) → flag.
- **Type-as-tag pollution** — tags duplicating the `type:` frontmatter field (`synthesis`, `moc`, `decision`, `entity`, `source`) → flag for removal.

## Entity Creation Rules

Create an Entity note **only if**:
- It is central to the current source being ingested, OR
- It already appears in 3+ vault notes / sources, OR
- The user explicitly asks to track it.

Do NOT create Entity for: passing mentions, vague concepts without source backing, one-off proper nouns unless central. Stub Entity notes without source backing are an anti-pattern from prior audits.

## Split & Archive Rules

- **Split:** Notes over **200-250 lines** are split candidates. Extract a Synthesis (the insight) + an MOC (the structure), leave the original as a Source if it's source material.
- **Archive:** Superseded Decisions / Syntheses → set frontmatter `status: superseded`, move to `archive/<original-folder>/`. Audit LINT excludes `archive/` from schema/orphan checks but keeps it queryable.

## Synthesis Citation Rules

For Synthesis notes with **3+ sources**:
- Key factual paragraphs SHOULD end with `[[Source-Note]]` wikilink markers.
- Contested claims MUST cite the specific Source/Paper note inline.

Citation style: Obsidian wikilinks. No footnotes. No bare URLs.

Synthesis notes with `sources: []` (Query-as-Ingest, user insights) are exempt — they are unsourced syntheses by design.

## Audit Thresholds

LINT additions for this vault — the audit pipeline must honor these:

- **Index size:** any `index.md` section > **50 notes** → group by tag/type/topic.
- **MOC trigger:** total typed notes > **200** → suggest creating MOC / topic-map for under-mapped topics.
- **Index split:** total notes > **500** → `index.md` becomes high-level only; generate per-type files (`index-sources.md`, `index-syntheses.md`, etc.).
- **Log rotation:** `log.md` > **500 entries** OR > **100 KB** → rotate to `log-YYYY.md` (year-based archive); keep `log.md` slim with current-year entries only.

GROW thresholds (skill detects clusters; vault declares N):
- **Sources without synthesis:** 5+ source notes on a topic with no synthesis → suggest synthesis.
- **Mentions without entity:** 3+ notes mentioning an entity with no entity note → suggest entity (subject to Entity Creation Rules above).
- **Notes without MOC:** 8+ notes in a topic area with no MOC → suggest MOC.
- **Stale topics:** modified > 90 days ago → suggest research check.

### Audit scope — folders excluded from LINK / LINT / GROW

| Folder | Reason for exclusion |
|---|---|
| `Raw/` | Layer 1 — immutable source artifacts (subject to Source Drift Check only) |
| `Excalidraw/` | Drawing-format Raw artifacts |
| `_audits/` | Audit reports (meta content about the vault) |
| `_dailies/` | Daily reflection logs (intentionally untyped) |
| `_queue/` | Pre-ingest staging (candidate URLs, not yet wiki-layer) |
| `archive/` | Superseded notes (kept queryable, excluded from schema/orphan checks) |
| `.obsidian/` | Plugin config (always excluded) |

Search-time operations (Propagate during ingest, query mode) may still read content from these folders when relevant — the exclusion applies specifically to schema validation and gap analysis, not search.

## Maintenance workflows

Use the `arc-maintaining-obsidian` skill (arcforge) for ingest, query, and audit. Bare invocation (no mode arg) runs Domain Contract Orientation and reports name / scope / types / last activity.

| Mode | When | Pipeline |
|---|---|---|
| ingest | New source / file-back | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| query | Search / synthesize | Orient → Search → Read → Synthesize |
| audit | Health check | LINK → LINT (generic + vault-declared) → GROW |

### Maintenance cadence

- After every ingest → skill auto-updates `index.md` (incremental) and appends to `log.md`.
- Weekly → `audit lint` (schema + Source Drift + vault-declared LINT + full index rebuild).
- Monthly → `audit grow` (gap analysis, thin coverage, stale sources).
- After any major reorganization → `audit link` (semantic resolution).
- Quarterly → review log size and rotate to `log-YYYY.md` if thresholds hit.

### Search backend

QMD collection `<QMD Collection>`. Run `qmd update -c <QMD Collection> && qmd embed` after each ingest cycle.

### Visual decision (during ingest's Visuals step)

Per-type Visual Guidance lives in `SCHEMA.md`. Generic principle:
- Mermaid for relational content (3+ entities + directional relationships)
- Excalidraw via `arc-diagramming-obsidian` for spatial architecture
- Canvas for MOCs with 8+ notes in scope
- Pure explanation = no diagram
