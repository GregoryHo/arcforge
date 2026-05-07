---
type: agents-contract
created: <YYYY-MM-DD>
scope: <Vault Scope>
preset: minimal
schema_path: SCHEMA.md
---

# <Vault Name> — Agent Runtime Contract

This file is the vault's thin runtime contract. It tells agents what this vault owns, which language to use, which paths and optional integrations exist, and how to treat SCHEMA.md. Domain schema and policy — note types, frontmatter, body templates, tag taxonomy, thresholds, status enums, citation rules — live in `SCHEMA.md`.

This is the **minimal** preset: a clean scaffold. Fill in the TODOs as the vault evolves.

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file at Domain Contract Orientation.
- **Read SCHEMA.md before mutating content.** Mutating modes (ingest, audit) MUST read SCHEMA.md after AGENTS.md.
- **SCHEMA.md governs note types and content structure.**
- **Do not invent new note types** unless the user approves or SCHEMA.md is updated.
- **If AGENTS.md and SCHEMA.md conflict, stop and ask the user.**
- **Schema changes require a log entry.** Append `## [YYYY-MM-DD] schema | <change summary>` to `log.md`.

## Identity

<TODO: who owns the typed-note layer? Common pattern: "The LLM owns typed notes; the human curates inputs and asks queries.">

If this vault has a Raw Source layer (immutable originals + derived typed notes), declare it here. If not, omit — the skill skips Raw Source behavior when not declared.

## Scope

This vault owns: <Vault Scope>

<TODO: list specific topics this vault owns. Be specific so agents can classify ambiguous incoming material.

Topics out of scope: list any neighbouring vaults and what content belongs there. Cross-vault wikilinks do not resolve — use plain text references with vault name when unavoidable.>

## Language Policy

<TODO: declare the vault's language policy.
- "Single language: English." — note bodies in English; no callouts.
- "Bilingual: English + 中文." — every typed note has `langs: [en, zh]` and uses `> [!multi-lang-en]` + `> [!multi-lang-zh]` callouts. Define the callout structure in SCHEMA.md `## Bilingual Format`. Raw Sources (if adopted) are NOT bilingual.>

## Domain Policy

Read `SCHEMA.md` for all domain-specific rules: allowed note types, tag taxonomy, frontmatter fields, body templates, Visual Guidance, audit thresholds, and creation/splitting rules. Do not duplicate those rules here.

## Paths and Integrations

- `index.md` — content catalog; query mode reads it first when present.
- `log.md` — append-only operation log.
- `_audits/` — default audit report folder unless SCHEMA.md declares another path.
- Search baseline: filesystem search/read.
- Optional QMD: not configured by default. If enabled later, record the collection in the vault registry.
- Obsidian runtime: optional; use `obsidian-cli` only for active-vault detection, Daily Notes append, plugin state, and live Obsidian search when available.

## Maintenance Workflows

Use the `arc-maintaining-obsidian` skill (arcforge) for ingest, query, and audit. Bare invocation runs Domain Contract Orientation and reports name / scope / types / last activity.

| Mode | When | Pipeline |
|---|---|---|
| ingest | New source / file-back | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| query | Search / synthesize | Orient → Search → Read → Synthesize |
| audit | Health check | LINK → LINT → GROW (mechanics from skill; domain policy from SCHEMA.md) |
