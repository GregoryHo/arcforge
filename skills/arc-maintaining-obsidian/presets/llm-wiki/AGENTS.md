---
type: agents-contract
created: <YYYY-MM-DD>
scope: <Vault Scope>
preset: llm-wiki
schema_path: SCHEMA.md
raw_source: adopted
---

# <Vault Name> — Agent Runtime Contract

This vault follows Andrej Karpathy's 3-layer LLM Wiki pattern. The LLM owns the Wiki layer; the human curates Raw Sources and asks queries. This AGENTS.md file stays thin: runtime identity, scope, language, paths, integration capabilities, and schema authority. Domain schema and policy live in `SCHEMA.md`.

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

## Layer 1 — Raw Sources

This preset adopts the Raw Source pattern. Immutable originals live under `Raw/<topic>/` and format-specific folders such as `Excalidraw/<topic>/`. The Wiki layer extracts and summarizes these; originals stay untouched so you can re-extract or diff against future updates.

Re-ingest behavior is mechanical and documented in `arc-maintaining-obsidian` `references/page-templates.md`: same body `sha256` → skip; different `sha256` → drift detected; empty legacy `sha256` → backfill via audit.

## Layer 2 — Wiki

Six typed notes live in the Wiki layer: Source / Entity / Synthesis / MOC / Decision / Log. Their frontmatter, body templates, Visual Guidance, citation rules, creation thresholds, split/archive rules, and audit thresholds are in `SCHEMA.md`.

## Layer 3 — Contract Files

- `AGENTS.md` (this file) — thin runtime contract + schema authority.
- `SCHEMA.md` — domain schema and policy.
- `CLAUDE.md` — Claude Code entry shim, redirects to this contract.
- `index.md` — content catalog. Rebuilt by `audit lint`. Read first when querying.
- `log.md` — append-only operations log (`## [YYYY-MM-DD] <op> | <detail>`).
- `_audits/` — default audit report folder unless SCHEMA.md declares another path.

## Scope

This vault owns: <Vault Scope>

<TODO: list specific topics this vault owns. Be specific so agents can classify ambiguous incoming material.

Topics out of scope: list neighbouring vaults if any, and what content belongs in each. Cross-vault wikilinks do not resolve — use plain text references with vault name when unavoidable.>

## Language Policy

This vault is **bilingual** by default: every wiki-layer note has `langs: [en, zh]` and uses the `> [!multi-lang-en]` + `> [!multi-lang-zh]` callout structure defined in SCHEMA.md.

Raw Sources are NOT bilingual (immutable originals). Log entries take whichever language the user used. Audit reports are English only. Frontmatter values stay canonical English.

<TODO: if your vault is monolingual, replace this section with "Single language: <lang>" and remove `langs: [en, zh]` from SCHEMA.md frontmatter for every type.>

## Domain Policy

Read `SCHEMA.md` for domain-specific rules: tag taxonomy, Source / Entity / Synthesis / MOC / Decision / Log schemas, paper variant, entity creation thresholds, synthesis citation rules, split/archive rules, audit thresholds, GROW thresholds, and Visual Guidance. Do not duplicate those rules here.

## Integration Capabilities

- Search baseline: filesystem search/read over Markdown files.
- Optional QMD: not required. If enabled in the registry, use it as semantic/hybrid acceleration and sync it after ingest/audit LINK.
- Obsidian runtime: optional. Use `obsidian-cli` for active vault detection, Daily Notes append, plugin state, and live search when available; ordinary Markdown maintenance must work with Obsidian closed.
- Excalidraw: delegate to `arc-diagramming-obsidian` only after user approval.

## Maintenance Workflows

Use the `arc-maintaining-obsidian` skill (arcforge) for ingest, query, and audit. Bare invocation runs Domain Contract Orientation and reports name / scope / types / last activity.

| Mode | When | Pipeline |
|---|---|---|
| ingest | New source / file-back | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| query | Search / synthesize | Orient → Search → Read → Synthesize |
| audit | Health check | LINK → LINT → GROW (mechanics from skill; domain policy from SCHEMA.md) |

## Maintenance Cadence

- After every ingest → skill updates `index.md` incrementally and appends to `log.md`.
- Weekly → `audit lint` for schema, Source Drift, tag hygiene, and index rebuild.
- Monthly → `audit grow` for synthesis/entity/MOC gaps and stale topics.
- After major reorganization → `audit link`.
