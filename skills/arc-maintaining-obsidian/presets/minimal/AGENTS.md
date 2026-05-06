---
type: agents-contract
created: <YYYY-MM-DD>
scope: <Vault Scope>
preset: minimal
schema_path: SCHEMA.md
---

# <Vault Name> — Agent Runtime Contract

This file declares **how agents should behave** in this vault: scope,
language, tag taxonomy, audit thresholds, and the rules that govern
SCHEMA.md authority. Note-type templates, frontmatter fields, and body
structure live in `SCHEMA.md`. The skill `arc-maintaining-obsidian` reads
both files at Domain Contract Orientation before any mode runs.

This is the **minimal** preset — a clean scaffold. Most sections are
TODO; fill them in as the vault evolves.

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file at Domain Contract Orientation.
- **Read SCHEMA.md before mutating content.** Mutating modes (ingest, audit) MUST read SCHEMA.md after AGENTS.md.
- **SCHEMA.md governs note types and content structure.**
- **Do not invent new note types** unless the user approves or SCHEMA.md is updated.
- **If AGENTS.md and SCHEMA.md conflict, stop and ask the user.**
- **Schema changes require a log entry.** Append `## [YYYY-MM-DD] schema | <change summary>` to `log.md`.

## Identity

<TODO: who owns the wiki layer? Common pattern: "The LLM owns typed notes;
the human curates inputs and asks queries."

If this vault has a Raw Source layer (immutable originals + derived
typed notes), declare it here. If not, omit — the skill skips Raw Source
behavior when not declared.>

## Scope

This vault owns: <Vault Scope>

<TODO: list specific topics this vault owns. Be specific so agents can
classify ambiguous incoming material.

Topics out of scope: list any neighbouring vaults and what content
belongs there. Cross-vault wikilinks do not resolve — use plain text
references with vault name when unavoidable.>

## Language Policy

<TODO: declare the vault's language policy.
- "Single language: English." — note bodies in English; no callouts.
- "Bilingual: English + 中文." — every typed note has `langs: [en, zh]`
  and uses `> [!multi-lang-en]` + `> [!multi-lang-zh]` callouts. Define
  the callout structure in SCHEMA.md `## Bilingual Format`. Raw Sources
  (if adopted) are NOT bilingual.>

## Tag Taxonomy

<TODO: list 10-20 top-level tags that organize this vault. Sub-tag
convention: `<top-level>/<sub>` (e.g., `arcforge/skills`).>

Audit checks (LINT) for this vault:
- Unknown top-level tags (not in this list, not registered as sub-tags) → flag.
- Tags used 10+ times but missing from the taxonomy → EVOLVE suggestion.
- Near-duplicate tags (`ai` vs `AI` vs `artificial-intelligence`) → flag.

## Audit Thresholds

<TODO: tune to vault size and growth. Skill does NOT invent thresholds —
audit applies only what's declared here.

Common thresholds:
- Index size: `index.md` section > N notes → group by tag/type/topic.
- MOC trigger: total typed notes > N → suggest creating MOC / topic-map.
- Index split: total notes > N → split into per-type index files.
- Log rotation: `log.md` > N entries OR > N KB → rotate to `log-YYYY.md`.
- Stale detection: typed notes older than N days without updates.
- GROW thresholds: sources-without-synthesis count, mentions-without-entity
  count, notes-without-MOC count.>

## Maintenance workflows

Use the `arc-maintaining-obsidian` skill (arcforge) for ingest, query, and
audit. Bare invocation (no mode arg) runs Domain Contract Orientation
and reports name / scope / types / last activity.

| Mode | When | Pipeline |
|---|---|---|
| ingest | New source / file-back | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| query | Search / synthesize | Orient → Search → Read → Synthesize |
| audit | Health check | LINK → LINT → GROW (generic + this vault's declared LINT) |

Search backend: QMD collection `<QMD Collection>`. Run
`qmd update -c <QMD Collection> && qmd embed` after each ingest cycle.
