# Mode: Ingest (operational details)

Pipeline:

```
Classify → Confirm → Create → Visuals → Index → Propagate → Log
```

## Classify

Determine which note type the user's input fits. The set of types comes from the vault's SCHEMA.md. Use judgment, not keyword matching. If the vault declares specialized types (Paper variant, DailyAggregate, Sprint, etc.), follow their detection criteria.

## Confirm

Tell the user: "This looks like a **[type]** note — agree?" Wait for confirmation.

**Fast path:** Skip confirmation when classification is unambiguous. When in doubt, confirm — false confidence wastes more time than one extra question.

## Create

Apply the type's template from vault SCHEMA.md, write to vault. Write relationships as plain text, not wikilinks — Propagate and audit mode resolve these later. Honor the vault's language policy per AGENTS.md.

### Raw Source Ingest (when the vault adopts the pattern)

If the vault's AGENTS.md declares Raw Source adoption, ingest of a URL / file / non-Markdown artifact is two distinct writes:

1. **Save the raw content** to `Raw/` (or leave it if already in the vault). Immutable original.
2. **Create the typed wiki note** with `source_url` pointing back, plus `sha256` of the body bytes after frontmatter.

Skipping step 1 conflates "what the source said" with "what I understood" — and you lose the ability to re-extract or verify later. See `page-templates.md` for the schema, hashing rule, re-ingest behavior, and per-file-type extraction methods.

If the vault does NOT adopt the Raw Source pattern (e.g., project-tracker), Create writes only the typed note.

## Visuals

Decide whether the note benefits from visual elements. Vault SCHEMA.md may declare per-type Visual Guidance — follow it. When the vault is silent, load `visuals-decision-tree.md` for the Q1–Q4 decision tree and the four-tier output table (Embed / Mermaid / Canvas / Excalidraw). Defaults are conservative; embed is deterministic; Canvas and Excalidraw require user approval.

## Index

Add the new note to `index.md`. Find the section matching the note's type (per SCHEMA.md), add `- [[Note Title]] — one-line summary`, update `Last updated:`. No user confirmation (catalog registration, not a content decision). If `index.md` doesn't exist, suggest: *"No index yet — run audit lint to generate one."* Audit LINT does the full rebuild; this step is the incremental add.

## Propagate

After creating the new note, update related existing pages — one source typically touches a handful of pages.

1. **Search** for vault pages related to the new note's concepts (see `search-strategies.md` Propagate section).
2. **Match** — actions per related page type are vault-specific (see vault SCHEMA.md / AGENTS.md).
3. **Propose** — present all updates in one summary: *"This source would update N pages: [[Page A]] (...), [[Page B]] (...). Apply all / select / skip?"*
4. **Apply** approved updates.

**Contradiction detection:** If new claims conflict with existing page content, flag: *"⚠️ Conflict: new source says X, [[Entity]] says Y — update, keep existing, or note both?"*

**Scope guard:** Cap at 10 pages per ingest. If more related, update top 10 by relevance, report: *"10 pages updated, N more potentially related — run audit for full pass."*

Vault AGENTS.md may declare additional propagation rules (e.g., citation-aware propagation for paper types). Honor them.

## Log

Append to `<vault>/log.md`:

```
## [YYYY-MM-DD] create | <type> | <filename>
```

`obsidian-cli daily:append` is an optional best-effort dual-write — see `obsidian-cli-quirks.md` for plugin-detection rules and SIGPIPE caveat.

## Special Modes

- **Query-as-Ingest** ("file this back" / "save this insight" / "crystallize this") — skip Classify; context determines type per vault contract (typically Synthesis or Decision in LLM-Wiki vaults). Go straight to Create.
- **Batch (`--batch`)** — fast-path classification, **skip Index and Propagate during batch**; audit LINT rebuilds afterward. Parallel batch agents can't resolve cross-references between concurrently created notes — a post-batch `audit link` pass is mandatory.
- **LINK-on-Create (`--link`)** — after Create, trigger audit LINK on the new note only.
