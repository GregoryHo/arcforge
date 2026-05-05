# AGENTS.md — Starter Template

This is the file `init-vault` writes into a fresh vault as `<vault>/AGENTS.md`.
**It is a starting point, not a binding contract.** Adopters are expected to
edit it freely — add note types, remove unused ones, change folder layout,
adjust bilingual rules. Schema divergence between vaults is a feature: each
vault's `AGENTS.md` is the source of truth for that vault.

`init-vault` substitutes the placeholders (`<YYYY-MM-DD>`, `<Vault Name>`,
`<TODO ...>`) before writing. The starter content below is everything between
the BEGIN/END markers.

---

<!-- BEGIN agents-md-template -->

```markdown
---
type: schema
created: <YYYY-MM-DD>
scope: <one-line scope statement for this vault>
---

# <Vault Name> — Agent Schema

This vault follows Andrej Karpathy's 3-layer LLM Wiki pattern. The LLM owns
the Wiki layer; the human curates Raw Sources and asks questions. Edit this
file to encode this vault's specific conventions — every section below is
yours to customize.

## Layer 1 — Raw Sources (immutable)

`Raw/<topic>/*` — original artifacts (articles, papers, screenshots, design
docs). Read-only for the LLM. Add subfolders as topics emerge. The wiki layer
extracts and summarizes these; the originals stay untouched so you can re-
extract or diff against future updates.

## Layer 2 — Wiki (LLM-owned)

The default starting set of note types. Add or remove types to fit your
vault's actual usage.

### Source — ingested article, paper, URL, or reference document

```yaml
type: source
created: YYYY-MM-DD
langs: [en, zh]
source_url: "Raw/<topic>/<filename>"
source_author: "<name>"
tags: []
aliases: []
```

### Source — Paper variant (academic with Abstract/References)

Adds: `venue`, `year`, `methodology`, `reading_status` (queued/deep-read/extracted),
`cites: [[wikilinks]]`, `cited_by: [[wikilinks]]`, structured Claims section.
Use when the source has formal academic structure.

### Entity — person, tool, concept, framework, or company

```yaml
type: entity
created: YYYY-MM-DD
langs: [en, zh]
entity_type: person | tool | concept | framework | company
tags: []
aliases: []
```

### Synthesis — cross-source insight, comparison, or discovered connection

```yaml
type: synthesis
created: YYYY-MM-DD
langs: [en, zh]
sources: [[Source-1]], [[Source-2]], ...
tags: []
aliases: []
```

### MOC — map of content / topic overview

```yaml
type: moc
created: YYYY-MM-DD
langs: [en, zh]
scope: "<one-line scope>"
tags: []
aliases: []
```

### Decision — trade-off record

```yaml
type: decision
created: YYYY-MM-DD
langs: [en, zh]
status: proposed | accepted | superseded
tags: []
aliases: []
```

### Log — timestamped event capture

Logs append into the daily note (or `log.md` if no Daily Notes plugin).
No standalone file frontmatter required.

### Bilingual format (default)

Notes use `langs: [en, zh]` with `> [!multi-lang-en]` and `> [!multi-lang-zh]`
callouts. **If your vault is single-language, remove the `langs` field and
the callout requirement.** This is one of the most common customizations —
edit freely.

### Customization examples

- **News pipeline vault**: add `style-aggregate` and `glossary` types.
- **Confidential / client vault**: add a `## Confidentiality boundary` section
  prohibiting cross-vault Synthesis or external publishing.
- **Single-language vault**: remove the `langs` field and bilingual callouts.
- **Project-tracking vault**: add `task` or `milestone` types.

## Layer 3 — Schema

- `AGENTS.md` (this file) — edit freely as conventions evolve
- `CLAUDE.md` — Claude Code entry point; redirects readers here
- `index.md` — content catalog. Rebuilt by `audit lint`. Read first when querying.
- `log.md` — append-only operations log. Format: `## [YYYY-MM-DD] <op> | <detail>`
- `audit-YYYY-MM-DD-<scope>.md` — audit reports

## Topics in scope

<TODO: list the topics this vault owns. Examples: "AI/ML papers", "client
delivery for Project X", "daily news ingest". Be specific so the LLM can
classify ambiguous incoming material correctly.>

## Topics out of scope

<TODO: list neighbouring vaults if any, and what content belongs in each.
Example: "Client work → `~/Vaults/Work/`. News → `~/Vaults/News/`."
Cross-vault wikilinks do not resolve — use plain text references with vault
name when unavoidable.>

## Maintenance workflows

Use the `arc-maintaining-obsidian` skill (arcforge) for ingest, query, and
audit. Three modes:

| Mode | When | Pipeline |
|---|---|---|
| ingest | New source / file-back | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| query | Search / synthesize | Orient → Search → Read → Synthesize |
| audit | Health check | LINK → LINT → GROW |

Search backend: QMD collection `<auto-set by init-vault>`. Run
`qmd update -c <collection> && qmd embed` after each ingest cycle.

Visual decision (during ingest's Visuals step): Mermaid for relational
content (3+ entities + directional relationships); Excalidraw via
`arc-diagramming-obsidian` for spatial architecture; Canvas for MOCs with
8+ notes in scope. Pure explanation = no diagram.
```

<!-- END agents-md-template -->

## How `init-vault` uses this template

1. Reads everything between the BEGIN / END markers.
2. Substitutes:
   - `<YYYY-MM-DD>` → today's date
   - `<Vault Name>` → user-supplied `--name` (Title Case)
   - `<auto-set by init-vault>` → `obsidian-<name>`
3. Leaves `<TODO ...>` markers in place — the user fills these in.
4. Writes the result to `<vault>/AGENTS.md`.

## Why divergence is encouraged, not minimized

Karpathy's pattern explicitly says human + LLM **co-evolve** the schema.
A shared, frozen schema across vaults would constrain that co-evolution.
The skill's per-mode reference files (`page-templates.md`, `audit-checks.md`)
document the **defaults** the template draws from. The live `AGENTS.md`
in any given vault is allowed — and expected — to diverge from those
defaults as that vault's needs become clear.
