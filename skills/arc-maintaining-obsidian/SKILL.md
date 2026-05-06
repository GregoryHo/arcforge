---
name: arc-maintaining-obsidian
description: Use when the user wants to create, query, audit, or initialize an Obsidian vault — wiki / knowledge base / second brain, project tracker, news pipeline, journal, or any typed-note vault. Trigger on saving notes, capturing ideas / decisions / sources, sharing URLs to document, asking vault questions ("what do I know about", "search my vault", "remind me"), auditing vault health (missing links, orphans, stale content, source drift), ingesting raw files (PDFs, Excalidraw, screenshots, articles), logging tasks / milestones / decisions, queueing articles into aggregates, journaling, "init a new vault", "set up a project vault", or "file this back" / "save this insight" / "track this". Also trigger on mentions of any registered Obsidian vault, wiki, knowledge base, second brain, task tracker — even casual "save this" or "what did I write". Do NOT trigger for Excalidraw diagram creation (use arc-diagramming-obsidian), general code implementation, debugging, PR reviews, web searches.
argument-hint: "help | ingest <url|text> [--batch] [--link] [--vault=<name>] | query <question> [--vault=<name>] | audit [link|lint|grow] [--vault=<name>] | init-vault <path> --name <name> [--preset=<minimal|llm-wiki|news|project-tracker>] | register <path> --name <name> [--default] | list-vaults | unregister <name> | set-default <name>"
---

# arc-maintaining-obsidian

A **vault interface**: the skill resolves which Obsidian vault to operate on, reads that vault's paired contract (`AGENTS.md` runtime contract + `SCHEMA.md` domain schema), and dispatches the requested action. Different vaults serve different domains — wiki / news / project tracker / journal / etc. — and the contract files declare each vault's specific behavior. The skill stays domain-agnostic; presets bootstrap new vaults into a chosen domain.

The skill owns: vault resolution + registry, init-vault bootstrap workflow, generic ingest/query/audit pipelines, mechanical primitives (sha256 hashing, LINK/LINT/GROW algorithms, search routing). Each vault's AGENTS.md + SCHEMA.md owns: types, thresholds, taxonomy, language policy, citation rules.

## Mode Selection

Three universal vault actions — every vault grows (ingest), reads (query), and benefits from periodic health checks (audit). Determine the mode from user intent:

| User Intent | Mode | Pipeline |
|---|---|---|
| Create, save, capture, ingest, "file this back" | **ingest** | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| Ask, search, "what do I know about", query | **query** | Orient → Search → Read → Synthesize → (File Back) |
| Audit, link, lint, grow, "check my vault" | **audit** | LINK → LINT → GROW |

**Bare invocation** (no mode argument, no clear intent) — do **not** ask "which mode?" blindly. Run Domain Contract Orientation first, then respond with what this vault is and what's available. Example response shape:

```
Operating on: <vault name>
Scope: <one-line scope from AGENTS.md>
Types: <comma-separated note types declared in SCHEMA.md>
Last activity: <most recent log.md entry>
Available: ingest, query, audit. What would you like to do?
```

Only ask "ingest / query / audit?" when the user's intent words exist but are ambiguous (e.g., "I want to do something with my vault").

### Help

If the argument is `help`, display this summary and stop:

```
arc-maintaining-obsidian — vault interface for Obsidian-based knowledge bases

REGISTRY-LEVEL (manage the vault registry; vault-agnostic):
  help                                Print this help
  list-vaults                         Show registered vaults
  init-vault <path> --name <name> [--preset=<name>]
                                      Bootstrap a new vault from a preset:
                                        minimal | llm-wiki | news | project-tracker
  register <path> --name <name>       Register existing vault [--default sets default]
  unregister <name>                   Remove from registry (files untouched)
  set-default <name>                  Change default vault

VAULT-LEVEL (operate on a resolved vault; respect --vault=<name>):
  ingest <url|text> [--batch] [--link]   Create notes from sources
  query <question>                       Search & synthesize from vault
  audit [link|lint|grow]                 Vault health (LINK + LINT + GROW + vault-declared)

GLOBAL FLAG (any vault-level mode):
  --vault=<name>            Override vault auto-resolution

BARE INVOKE (no mode):
  Run Domain Contract Orientation, then respond with what this vault is
  (name, scope, declared types, last activity) and ask what to do.

Also accepts natural language: "file this back", "check my vault", "save this insight",
"what's in this vault", etc.
```

### Path Convention

All `references/` and `presets/` paths in this file are **skill-relative**. The Claude Code Skill harness provides the absolute skill base directory at every invocation (the LLM sees `Base directory for this skill: <abs-path>`). Construct absolute paths by prepending that base. The skill never relies on the user's CWD.

### Mode Entry Gate

Each mode depends on **mechanism references** the skill ships, plus the **vault contract** (AGENTS.md + SCHEMA.md). Read in this order:

| Mode | Read first (mechanism) | Then (vault contract) |
|---|---|---|
| **init-vault** | `references/bootstrap-workflow.md` (11-step bootstrap, preset selection, worked example) | n/a — there is no vault to read yet; the workflow writes one |
| **Ingest** | `references/page-templates.md` (Raw Source mechanism, sha256, extraction methods) | `AGENTS.md` (runtime rules) + `SCHEMA.md` (types, frontmatter, body templates) |
| **Query** | `references/search-strategies.md` (route selection, output adaptation) | `AGENTS.md` (scope, citation rules) + `SCHEMA.md` (types — for type-aware grouping) |
| **Audit** | `references/audit-checks.md` (LINK/LINT/GROW primitives, Source Drift, vault-declared LINT) | `AGENTS.md` (thresholds, taxonomy, declared LINT) + `SCHEMA.md` (schema compliance target) |

The skill's `references/` files describe **mechanism** (algorithms, tool routing); vault AGENTS.md + SCHEMA.md describe **domain** (what types exist, what rules apply). The vault contract wins where they overlap.

## Shared Context

### Vault Resolution

The skill supports multiple registered vaults. On every invocation, resolve which vault to operate on using this 5-step cascade:

1. **Explicit override** — if the invocation includes `--vault=<name>`, use that vault. Skip remaining steps.
2. **Active Obsidian** — run `obsidian-cli vault`. If the returned `path` matches a registry entry, use it. Print `Operating on: <name> vault` so the user can abort if wrong.
3. **Session cache** — if step 2 didn't resolve but the session has already picked a vault on a prior turn, reuse it.
4. **Default** — if the registry has a `default` key, use that vault. Print resolved name.
5. **Ask** — if registry is empty or has no default, prompt the user with the list of registered vaults.

Once resolved, the choice is sticky for the session unless `--vault` overrides it.

**First-run state:** If `~/.arcforge/obsidian-vaults.json` does not exist or has zero registered vaults, do NOT fall through to ad-hoc file writes. Suggest `init-vault <path> --name <name> --preset=<name>` (bootstrap from a preset) or `register <path> --name <name>` (existing vault, author AGENTS.md + SCHEMA.md manually) before any operation.

If Obsidian is not running for step 2, fall back to step 3 → step 4 → step 5. Warn once that LINK resolution and live search require the Obsidian CLI.

### Domain Contract Orientation

After resolving the vault and BEFORE entering any mode, read the **paired contract**:

1. Read `<vault>/AGENTS.md` — agent runtime contract: scope, language policy, tag taxonomy, audit thresholds, citation rules, schema authority meta-rules.
2. Read `<vault>/SCHEMA.md` — domain schema: note types, frontmatter fields, body templates, Visual Guidance per type.
3. If AGENTS.md declares an index path, read `<vault>/index.md`.
4. If AGENTS.md declares a log path, read the **last 20-30 entries** of `<vault>/log.md`.
5. Treat AGENTS.md + SCHEMA.md as authoritative. The skill's `references/` files are mechanism only; the vault contract wins where they overlap.

The two files are paired and required:

| Missing | Bare invoke / `query` / `help` | `ingest`, `audit` (mutating) |
|---|---|---|
| **AGENTS.md missing** | Allow with warning: "vault has no AGENTS.md — running with skill defaults only." Bare invoke prints stub orientation (registry entry only). | **Block.** Suggest: run `init-vault <path> --name <name> --preset=<name>` or author the contract manually. |
| **SCHEMA.md missing** | Allow with warning: "vault has no SCHEMA.md — type-aware behavior degraded." | **Block.** Without SCHEMA.md the skill can't classify (ingest) or validate schema compliance (audit). |
| **AGENTS.md ↔ SCHEMA.md conflict** | Stop and ask the user before any mode runs. Per AGENTS.md schema authority rules, conflicts are not auto-resolved. | Same — block until user clarifies. |

### Registry Maintenance

The vault registry lives at `~/.arcforge/obsidian-vaults.json`. **The skill manages this file end-to-end — never hand-edit.** Schema:

```json
{
  "default": "<vault-name>",
  "vaults": [
    {
      "name": "<short-name>",
      "path": "<absolute path to vault root>",
      "qmd_collection": "obsidian-<short-name>",
      "scope": "<one-line scope statement>",
      "preset": "<preset-name-used-at-init>"
    }
  ]
}
```

Maintenance subcommands (LLM-driven via standard file tools and `obsidian:obsidian-cli`):

| Subcommand | Behavior |
|---|---|
| `init-vault <path> --name <name> [--preset=<name>]` | Run the **init-vault Bootstrap** workflow below. |
| `register <path> --name <name> [--default]` | Adds an existing populated vault. Validates path. Optionally creates QMD collection. **Does NOT auto-write AGENTS.md or SCHEMA.md** — prints reminder: *"Vault registered. Author AGENTS.md (runtime contract) + SCHEMA.md (domain schema) at `<path>/` before first ingest/audit."* |
| `list-vaults` | Prints registered vaults (name, path, default marker, preset, QMD collection). |
| `unregister <name>` | Removes the entry. If `default` was the unregistered name, clears default. Prompts: *"Also remove QMD collection `obsidian-<name>`? Vault files at `<path>` untouched."* |
| `set-default <name>` | Updates `default`. Errors if `<name>` not registered. |

To inspect a registered vault without switching to it, use **bare invoke** with `--vault=<name>` — Domain Contract Orientation runs and prints the named vault's name / scope / types / last activity, no mode entered.

**Why never hand-edit `obsidian-vaults.json`:** the schema is small but error-prone; mutations should be paired with side effects (preset write, QMD collection lifecycle, audit lint seed); a user who hand-edits today drifts from schema tomorrow when fields are added.

### init-vault Bootstrap

When the user runs `init-vault <path> --name <name>` (with or without `--preset=<name>`), the skill drives an 11-step conversation: validate path → pick preset → ask minimal questions → **author** AGENTS.md + SCHEMA.md from the preset (do not copy verbatim) → seed index/log → register → advertise commands.

**Read `references/bootstrap-workflow.md` before running any step.** That file owns the full workflow including a worked example showing how "author from preset" plays out concretely. Presets are one-shot authoring guidance, not stamping templates.

Available presets: `minimal`, `llm-wiki`, `news`, `project-tracker`. Each ships its paired starter under `presets/<name>/AGENTS.md` + `presets/<name>/SCHEMA.md`.

### Vault Structure — Two Layers

Generic pattern (vault AGENTS.md / SCHEMA.md may extend or replace):

**Raw Sources** (`Raw/` and format-specific folders) — Immutable originals when the vault adopts the Raw Source pattern (most knowledge-base presets do). The LLM reads but never modifies these. Whether a vault uses this pattern is declared in its AGENTS.md.

**Wiki / Domain Layer** (everything else) — Typed notes per the vault's SCHEMA.md.

When a Raw Source is ingested, the original stays where it is — a new typed note is created with `source_url` pointing back. Knowledge flows Raw → Wiki as text. See `references/page-templates.md` for the Raw Source frontmatter schema, sha256 hashing rule, extraction methods, and Paper URL chain.

### Session Log

After every operation, append to `log.md` in vault root:

```
## [YYYY-MM-DD] <operation> | <detail>
```

Operations: `create | [type] | [filename]`, `query | [question summary]`, `audit | [scope]`, `drift | [filename]`, `init-vault | preset=<preset>`.

Dual-write: `log.md` for LLM scanning (`grep "^## [" log.md | tail -10`), daily notes for human browsing via `obsidian-cli daily:append`. On first use in a session, verify the Daily Notes plugin is configured: `obsidian eval code="app.internalPlugins.plugins['daily-notes']?.instance?.options?.folder"`. If unconfigured, skip daily:append and log to `log.md` only.

### Delegation

**Search:** Prefer QMD (hybrid keyword + semantic + reranking). Fall back to `obsidian-cli search` (keyword only). Read `references/search-strategies.md` Route Selection on first search; the QMD route includes `qmd update && qmd embed` (~3s incremental) after each ingest or audit.

**Read/write:**
- Vault operations → `obsidian:obsidian-cli`
- Markdown formatting → `obsidian:obsidian-markdown`
- Canvas creation → `obsidian:json-canvas`
- Excalidraw diagrams → `arc-diagramming-obsidian`
- URL content extraction → `obsidian:defuddle` (Defuddle first, WebFetch only for APIs/raw text)

**obsidian-cli path safety:** `file=` (name-based, like wikilinks) for notes with special characters; `path=` only for clean paths. Never use `file=` with `create` (silently ignored, produces `Untitled.md`). For subfolder placement: `obsidian create path="folder/My-Note.md" content="..."`. Never pipe `obsidian read` through `head`/`tail` — the CLI doesn't handle SIGPIPE and hangs.

## Mode: Ingest

### Pipeline

```
Classify → Confirm → Create → Visuals → Index → Propagate → Log
```

### Classify

Determine which note type the user's input fits. The set of types comes from the vault's SCHEMA.md. Use judgment, not keyword matching. If the vault declares specialized types (Paper variant, DailyAggregate, Sprint, etc.), follow their detection criteria.

### Confirm

Tell the user: "This looks like a **[type]** note — agree?" Wait for confirmation.

**Fast path:** Skip confirmation when classification is unambiguous. When in doubt, confirm — false confidence wastes more time than one extra question.

### Create

Apply the type's template from vault SCHEMA.md, write to vault. Write relationships as plain text, not wikilinks — Propagate and audit mode resolve these later. Honor the vault's language policy per AGENTS.md.

#### Raw Source Ingest (when the vault adopts the pattern)

If the vault's AGENTS.md declares Raw Source adoption, ingest of a URL / file / non-Markdown artifact is two distinct writes:

1. **Save the raw content** to `Raw/` (or leave it if already in the vault). Immutable original.
2. **Create the typed wiki note** with `source_url` pointing back, plus `sha256` of the body bytes after frontmatter.

Skipping step 1 conflates "what the source said" with "what I understood" — and you lose the ability to re-extract or verify later.

See `references/page-templates.md` for the Raw Source frontmatter schema, the **hash body after frontmatter** rule (UTF-8, line endings normalized to `\n`), re-ingest behavior (drift detected → prompt before overwrite), and extraction methods per file type.

If the vault does NOT adopt the Raw Source pattern (e.g., project-tracker may not), Create writes only the typed note and skips the immutable-original step.

### Visuals

After creating the note, decide whether it benefits from visual elements. Vault SCHEMA.md may declare per-type Visual Guidance — follow it. Generic decision tree (use when the vault is silent on the type):

```
Q1: Does the raw source contain an image or diagram?
    → Yes → Embed: ![[filename]]. Deterministic — no judgment needed.
    → No  → Continue.
Q2: Does the note content have 3+ named entities with directional relationships?
    → No  → Skip visuals. Text is sufficient.
    → Yes → Continue.
Q3: Is the insight ABOUT how entities relate (hierarchies, flows, cycles, dependencies)?
    Test: if you removed the relationship description, would the insight collapse?
    → Yes → Mermaid by default. Continue to Q4 only if Excalidraw seems warranted.
    → No  → Explanatory content; skip visuals.
Q4: Is the spatial/architectural layout complex enough to warrant manual positioning?
    → No  → Stay with Mermaid (text-based, diffable, LLM-generatable).
    → Yes → Suggest Excalidraw delegation: "This has complex spatial layout — want me to create an Excalidraw diagram?" Do not auto-create.
```

**Tier outputs:**

| Tier | Output | When | LLM judgment? |
|---|---|---|---|
| **Embed** (Markdown) | `![[image.png]]` in note body | Raw source has image/diagram | No — deterministic |
| **Mermaid** | Fenced `mermaid` block | 3+ entities with relationships | Yes — conservative |
| **Canvas** | Separate `.canvas` file | MOC with 8+ notes in scope | Yes — suggest to user |
| **Excalidraw** | Delegate to `arc-diagramming-obsidian` | Complex spatial/architectural content | Yes — suggest to user |

If you reach Q3 = yes, generate Mermaid. Do not second-guess with "but text could also work" — the question is whether the shape communicates faster. Mermaid is cheap; Canvas and Excalidraw are expensive tiers that wait for user approval.

### Index

Add the new note to `index.md`. Read it, find the section matching the note's type (per SCHEMA.md), add `- [[Note Title]] — one-line summary`, update `Last updated:`. No user confirmation (this is catalog registration, not a content decision). If `index.md` doesn't exist, suggest: *"No index yet — run audit lint to generate one."*

Audit LINT does the full rebuild; this step is the incremental add.

### Propagate

After creating the new note, update related existing pages — one source typically touches a handful of pages.

1. **Search** for vault pages related to the new note's concepts (see search-strategies.md, Propagate section).
2. **Match** — the actions per related page type are vault-specific (see vault SCHEMA.md / AGENTS.md).
3. **Propose** — present all updates in one summary: *"This source would update N pages: [[Page A]] (...), [[Page B]] (...). Apply all / select / skip?"*
4. **Apply** approved updates.

**Contradiction detection:** If new claims conflict with existing page content, flag: *"⚠️ Conflict: new source says X, [[Entity]] says Y — update, keep existing, or note both?"*

**Scope guard:** Cap at 10 pages per ingest. If more related, update top 10 by relevance, report: *"10 pages updated, N more potentially related — run audit for full pass."*

Vault AGENTS.md may declare additional propagation rules (e.g., citation-aware propagation for paper types). Honor them.

### Special Modes

**Query-as-Ingest:** When user says "file this back," "save this insight," "crystallize this" — skip Classify. Context determines type per vault contract (typically Synthesis or Decision in LLM-Wiki vaults; might be a Reflection in journal vaults). Go straight to Create.

**Batch mode (`--batch`):** Process a folder of raw files with fast-path classification. **Skip Index and Propagate during batch** — audit LINT rebuilds afterward: *"Batch complete: N notes created. Run audit to link, index, and propagate?"*

**Parallel batch caveat:** When parallel agents ingest in the same batch, cross-references between notes being created concurrently can't resolve (they don't exist yet). A post-batch `audit link` pass is **mandatory** to resolve them.

**LINK-on-Create (`--link`):** After Create, trigger audit LINK on the new note only for immediate graph connectivity.

## Mode: Query

### Pipeline

```
Orient → Search → Read → Synthesize → (File Back)
```

1. **Orient** — Read `index.md` for the vault map. If none exists, suggest: *"No index — run audit lint to generate one."*
2. **Search** — Use the active route (see `references/search-strategies.md`).
3. **Read** — Drill into matching notes. Read frontmatter first (understand type), then content. Follow `sources:` arrays for provenance.
4. **Synthesize** — Answer with inline `[[citations]]`. Every key claim references its source note.

Read `references/search-strategies.md` for output format adaptation (prose, tables, timelines, Marp, Canvas).

**Vault-only answers — including surrounding commentary.** Never fall back to general knowledge, not just in the direct answer but in framing, insights, or comparisons. If the vault has notes on topic A but not topic B, don't fill in B from general knowledge — name the gap: *"Your vault covers A but has nothing on B. Want to add sources for B via ingest?"* Gaps feed the audit GROW cycle.

### File Back

If the answer is substantive (comparison, analysis, discovered connection), suggest filing back: *"This connects several notes in a new way — file as a Synthesis note?"* (Or whichever cross-cutting type the vault SCHEMA.md declares.)

File Back triggers ingest mode internally — same skill, same context, no handoff. Uses Query-as-Ingest (skip Classify).

Always state your file-back decision: either suggest it, or explain why not (e.g., "A Synthesis covering this already exists at [[Note]]").

## Mode: Audit

### Pipeline

```
LINK → LINT → GROW
```

Invoke with `audit link`, `audit lint`, `audit grow`, or no argument for all three. Every audit sub-command produces a typed audit report at `_audits/audit-YYYY-MM-DD-<scope>.md` so future sessions can reference past results.

### LINK — Resolve Relationships

Scan notes with plain-text `## Relationships` sections. For each mention, search vault for matching titles/aliases. Replace with `[[wikilinks]]`, add backlinks to targets, update MOCs (if the vault declares them).

**Single-file mode (`audit link --file=<path>`):** Run on one note only — used by ingest's `--link` flag.

Only LINK modifies existing notes. LINT and GROW never modify.

### LINT — Health Check

Read `references/audit-checks.md` for mechanical primitives: schema compliance (validates against vault SCHEMA.md), orphan detection, untyped notes, basic tag hygiene, **Source Drift** (sha256 mismatch — only for vaults adopting Raw Source pattern), and EVOLVE pattern detection (field usage, type fit, tag drift).

**Vault-declared LINT.** The audit pipeline reads vault AGENTS.md `## Audit Thresholds` and `## Tag Taxonomy` (and any other declared check sections) and applies the additional checks declared there. Treat vault thresholds as authoritative — the skill never invents numbers.

**Verify before fix:** LINT findings are hypotheses, not facts. Before fixing any reported issue, read the actual file. Common false positive: YAML multi-line lists (`tags:\n  - a\n  - b`) look empty to line-by-line extraction but contain values on indented lines. Always verify frontmatter by reading the file, not by trusting extraction output.

**Broken wikilink resolution:** when LINT finds links to non-existent notes:
- **Has Raw Source backing** → create the entity via ingest (the link reflects real knowledge)
- **No Raw Source, referenced from 3+ notes** → flag for user decision
- **No Raw Source, referenced from 1-2 notes** → convert to plain text (preserves relationship without creating unsourced stubs)

Never create stub entity notes without source backing — this was identified as an anti-pattern in prior audits.

LINT generates/updates `index.md` in vault root — organized per vault-declared note types. This is what query mode reads first in Orient.

### GROW — Gap Analysis

Read `references/audit-checks.md` for generic gap patterns. Vault AGENTS.md declares the thresholds (synthesis triggers, entity triggers, MOC triggers, stale topic days, etc.) — honor those.

**Internal** suggestions create artifacts when patterns exceed declared thresholds.

**External** suggestions investigate topics (thin coverage, open questions in Synthesis notes, stale topics).

GROW proposes — never auto-creates, never auto-fetches. User approves, then ingest mode creates.

### Batch Mode

Default: 50 most recently modified notes. Full scan: `--all`. Report scope at start.

### Audit Report

Save as typed vault note at `_audits/audit-YYYY-MM-DD-<scope>.md`. The vault SCHEMA.md may declare an `audit-report` type with vault-specific extensions. The generic shell:

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---
```

## Completion Formats

**Ingest:**
```
✅ Created [type] note → [path]
   Propagated: updated N existing pages
```

**Query:**
```
✅ Query answered — cited N notes
```

**Audit:**
```
✅ Audit complete → [audit-report-path]
- LINK: resolved N relationships
- LINT: found N issues (M Source Drift)
- GROW: N suggestions (P internal, Q external)
```

**Bare invoke (orient response):**
```
Operating on: [vault name]
Scope: [one-line]
Types: [list]
Last activity: [latest log entry]
Available: ingest, query, audit. What would you like to do?
```

**init-vault:**
```
✅ Bootstrapped [vault name] (preset: [preset])
   Registered at: [path]
   QMD collection: [obsidian-<name>] (or "skipped")
   Next: ingest a source, run query, or check capabilities via bare invoke.
```

## Blocked Format

```
⚠️ [Mode] blocked
Issue: [what went wrong]
To resolve: [specific action needed]
```
