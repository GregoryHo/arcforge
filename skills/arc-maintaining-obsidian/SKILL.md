---
name: arc-maintaining-obsidian
description: Use when the user wants to create, query, or maintain their Obsidian vault. Trigger on saving notes, capturing ideas/decisions, sharing URLs to document, asking vault questions ("what do I know about", "search my vault", "remind me about", "do I have notes on"), auditing vault health (missing links, orphan notes, stale content), ingesting raw files (Excalidraw, PDFs, screenshots) into wiki notes, or saying "file this back" / "save this insight" / "crystallize this". Also trigger on mentions of their wiki, knowledge base, or second brain — even casual "save this" or "what did I write about Y". Do NOT trigger for Excalidraw diagram creation (use arc-diagramming-obsidian), general code implementation, debugging, PR reviews, web searches, or explaining concepts the user doesn't have vault notes about.
argument-hint: "help | ingest <url|text> [--batch] [--link] | query <question> | audit [link|lint|grow]"
---

# arc-maintaining-obsidian

One skill, three modes — the LLM incrementally builds and maintains a persistent, compounding wiki. The human curates sources, asks questions, and directs analysis. The LLM does all the bookkeeping.

The core insight: wikis die from maintenance burden, not lack of content. This skill eliminates that burden by handling ingest, query, and lint as a single agent with shared vault awareness.

## Mode Selection

Determine the mode from user intent:

| User Intent | Mode | Pipeline |
|---|---|---|
| Create, save, capture, ingest, "file this back" | **ingest** | Classify → Confirm → Create → Visuals → Index → Propagate → Log |
| Ask, search, "what do I know about", query | **query** | Orient → Search → Read → Synthesize → (File Back) |
| Audit, link, lint, grow, "check my vault" | **audit** | LINK → LINT → GROW |

When intent is ambiguous, ask: "Do you want to create a note, search your vault, or run an audit?"

### Help

If the argument is `help`, display this usage summary and stop:

```
arc-maintaining-obsidian — Obsidian wiki lifecycle manager

INGEST (create notes):
  ingest <url>              Ingest URL as Source note (paper auto-detected)
  ingest <text>             Classify and create from description
  ingest --batch            Batch ingest a folder of raw files
  ingest --link             Create + immediately resolve wikilinks

QUERY (search vault):
  query <question>          Search vault and synthesize answer
  "what do I know about X"  Natural language query

AUDIT (vault health):
  audit                     Run all three: LINK → LINT → GROW
  audit link                Resolve plain-text mentions → wikilinks
  audit lint                Schema check + rebuild index.md
  audit grow                Gap analysis and suggestions

Also accepts natural language: "file this back", "check my vault", "save this insight"
```

### Mode Entry Gate

Each mode depends on reference knowledge that isn't in the SKILL.md body — extraction methods, search strategies, audit checks. Reading the wrong reference (or none) causes cascading errors: wrong schemas, skipped pipeline steps, mishandled sources.

Before executing any mode, read its reference file:

| Mode | Read first | What it provides |
|---|---|---|
| **Ingest** | `references/page-templates.md` | Frontmatter schemas, extraction methods per file type, Raw Source ingest flow |
| **Query** | `references/search-strategies.md` | Search strategy by question type, output format adaptation |
| **Audit** | `references/audit-checks.md` | Full check list, GROW thresholds, EVOLVE checks |

This is a gate, not a suggestion — the reference file contains information the mode needs to execute correctly. Skip it and you'll improvise schemas, miss pipeline steps, or use the wrong extraction method.

## Shared Context

### Vault Path

On first invocation:
1. Check if `obsidian-cli` is available — ask it for vault location
2. If Obsidian not running, ask the user for the vault path
3. Store the path for subsequent invocations in the session

If Obsidian is not running, fall back to direct file writes. Warn that LINK resolution and search require the CLI.

### Vault Structure — Two Layers

The vault has two layers of content. Never mix them:

**Raw Sources (`Raw/` and format-specific folders like `Excalidraw/`)** — Immutable originals. Articles, PDFs, screenshots, Excalidraw drawings, HTML exports. The LLM reads but never modifies. These are the source of truth.

**Wiki Layer (everything else)** — LLM-generated typed notes with frontmatter schema. Source notes, Entity notes, Synthesis notes, MOCs, Decisions. The LLM owns this layer entirely.

When a Raw Source is ingested, the original stays where it is — a new Source note is created in the wiki layer with `source_url` pointing back to the original. Knowledge flows from Raw → Wiki as text.

**First-time setup:** If the vault has no `Raw/` folder or has Raw Sources scattered outside it, note this in the audit report but do not reorganize — the user decides folder structure. The skill works with Raw Sources wherever they are.

### Session Log

After every operation (create, query, or audit), append to `log.md` in vault root:

```
## [YYYY-MM-DD] <operation> | <detail>
```

Operations: `create | [type] | [filename]`, `query | [question summary]`, `audit | [scope]`

This dual-write pattern serves two audiences: `log.md` for LLM scanning (`grep "^## [" log.md | tail -10`), daily notes for human browsing via `obsidian-cli daily:append`.

**Daily notes folder:** `daily:append` respects Obsidian's Daily Notes plugin settings (folder, date format). On first use in a session, verify the plugin is configured: `obsidian eval code="app.internalPlugins.plugins['daily-notes']?.instance?.options?.folder"`. If it returns a folder path, daily:append will write there. If unconfigured or the plugin is disabled, skip daily:append and log to `log.md` only — do not create date-stamped files at vault root.

### Delegation

**Search:** Prefer QMD — it provides hybrid search (keyword + semantic + reranking) that finds both exact matches and conceptually related notes. Fall back to `obsidian-cli search` (keyword only) when QMD is unavailable. Read `references/search-strategies.md` Route Selection on first search to confirm availability, then follow the active route for all operations: query, propagate, LINK resolution, and index sync. The QMD route includes an Index Sync step (`qmd update && qmd embed`, ~3s incremental) that runs after each ingest or audit cycle to keep newly created notes searchable.

**Read/Write (vault operations):**
- Vault operations (read, create, append, properties) → `obsidian:obsidian-cli`
- Markdown formatting → `obsidian:obsidian-markdown`
- Canvas creation → `obsidian:json-canvas`
- Excalidraw diagrams → `arc-diagramming-obsidian`
- URL content extraction → `obsidian:defuddle` (Defuddle first, WebFetch only for APIs/raw text)

**obsidian-cli path safety:** Use `file=` (name-based, like wikilinks) for notes with special characters (`&`, spaces, CJK). Use `path=` only for clean paths without shell-sensitive characters.

**obsidian-cli pipe safety:** Never pipe `obsidian read` through `head` or `tail` — the CLI doesn't handle SIGPIPE and the process hangs indefinitely. Read the full output without piping, or use the Read tool with the vault filesystem path for partial reads.

**obsidian-cli create syntax:** `create` uses `name=` (filename only, no slashes) or `path=` (full path with folder). Never use `file=` with create — it's silently ignored and produces `Untitled.md`. For subfolder placement: `obsidian create path="ai/My-Note.md" content="..."`. Use `name=` only for vault-root notes without subdirectories.

## Mode: Ingest

### Pipeline

```
Classify → Confirm → Create → Visuals → Index → Propagate → Log
```

### Classify

Determine which of 6 page types fits the user's input. Use judgment, not keyword matching.

| Type | Trigger Signal |
|---|---|
| **Source** | User shares URL, article, paper, reference material |
| **Entity** | User discusses person, tool, concept, company, framework |
| **Synthesis** | User connects ideas, asks "how does X relate to Y" |
| **MOC** | User wants topic overview, asks "what do I know about X" |
| **Decision** | User weighs trade-offs, compares options, announces choice |
| **Log** | User captures something timestamped — meeting notes, events |

Read `references/page-templates.md` for full frontmatter schema and templates for each type.

**Paper detection:** When the source is a PDF with Abstract/References sections, or the user says "paper"/"論文", use the **Paper variant** of the Source template (see `references/page-templates.md`). Paper variant adds: `reading_status`, `methodology`, `venue`, `year`, `cites`, `cited_by`, and a structured Claims section. Default `reading_status` to `queued` if user just drops the paper without discussion, `deep-read` if they ask for analysis.

### Confirm

Tell the user: "This looks like a **[type]** note — agree?" Wait for confirmation.

**Fast path:** Skip when classification is unambiguous (e.g., "log this meeting" → Log). When in doubt, confirm — false confidence wastes more time than one extra question.

### Create

Apply the template from `references/page-templates.md`, write to vault. Write relationships as plain text, not wikilinks — Propagate and audit mode resolve these later.

**Raw Source Ingest — Raw first, wiki second.** When the source is a URL, file, or non-Markdown artifact, the pipeline has two distinct writes:

1. **Save the raw content** to `Raw/` (or leave it where it is if already in the vault). This is the immutable original — the thing you can diff against later when the source is updated.
2. **Create the wiki Source note** with `source_url` pointing back to the Raw file. This is your summary and extraction — the wiki layer's interpretation of the original.

Skipping step 1 and writing directly to the wiki layer conflates "what the source said" with "what I understood" — and you lose the ability to re-extract or verify later. See `references/page-templates.md` for extraction methods per file type and the exact `source_url` schema.

### Visuals

After creating the note, assess whether it benefits from visual elements. This step reads the note content you just wrote and applies a decision framework — you need the content to exist before you can judge its structure.

**Decision tree:**

```
Q1: Does the raw source contain an image or diagram?
    → Yes → Embed reference: ![[filename.png]] in the note body. Always do this — no judgment needed.
    → No  → Continue to Q2.

Q2: Does the note content have 3+ named entities with directional relationships?
    → No  → Skip visuals. Text is sufficient.
    → Yes → Continue to Q3.

Q3: Is the insight primarily ABOUT how entities relate — hierarchies, flows,
    cycles, dependencies, abstraction layers, pipelines, or state transitions?
    Test: if you removed the relationship description from the prose, would
    the insight collapse? If yes, the shape IS the insight.
    → Yes → Mermaid by default. Continue to Q4 only if considering Excalidraw.
    → No  → The content is explanatory (definitions, reasoning, narrative).
             Skip visuals — text carries explanations better than diagrams.

Q4: Is the spatial/architectural layout complex enough to warrant manual
    positioning (freeform architecture sketches, not auto-layoutable graphs)?
    → No  → Stay with Mermaid (text-based, diffable, LLM-generatable).
    → Yes → Suggest Excalidraw delegation to user: "This has complex spatial
             layout — want me to create an Excalidraw diagram?" Do not auto-create.
```

**Tier outputs:**

| Tier | Output | When | LLM Judgment? |
|---|---|---|---|
| **Embed** | `![[image.png]]` in note body | Raw source has image/diagram | No — deterministic |
| **Mermaid** | Fenced `mermaid` block in note | 3+ entities with relationships | Yes — conservative |
| **Canvas** | Separate `.canvas` file | MOC with 8+ notes in scope | Yes — suggest to user |
| **Excalidraw** | Delegate to `arc-diagramming-obsidian` | Complex spatial/architectural content | Yes — suggest to user |

**Default behavior, not conservative skipping:**

The decision tree should produce a clear answer for most notes. Two common failure modes to avoid:

1. **Over-generation** — adding Mermaid to purely explanatory content (definitions, reasoning, narratives). A bullet list is faster to read than a diagram for these.
2. **Under-generation** — skipping Mermaid when the content IS relational because you're "not 100% sure." For relational content (Q3 = yes), the shape carries the insight — prefer Mermaid even under uncertainty.

If you reach Q3 = yes, generate Mermaid. Do not second-guess with "but text could also work" — text always *could* work, the question is whether the shape communicates faster. Mermaid is cheap: text-based, easy to revise, costs only a few tokens. Canvas and Excalidraw are the expensive tiers that wait for user approval.

**Placement:** See `references/page-templates.md` Visual Guidance sections for where each visual type goes within each note template (inside/outside callouts, which section).

### Index

Add the new note to `index.md` — the vault's table of contents. Every new note gets registered in the catalog so subsequent queries and human browsing reflect the current state.

1. Read `index.md`, find the section matching the note's type (Sources, Entities, Syntheses, MOCs, Decisions)
2. Add one line: `- [[Note Title]] — one-line summary`
3. Update the `Last updated:` date
4. Write directly — no user confirmation needed (this is catalog registration, not a content decision)

If `index.md` doesn't exist, suggest: *"No index yet — run audit lint to generate one, or I can create a starter index now."*

Audit LINT does a full index rebuild (scanning all notes). This step does an incremental add — one note at a time, keeping the index current between audits.

### Propagate

After creating the new note, update related existing pages — one source typically touches 5-15 pages across the wiki.

1. **Search** — Find vault pages related to the new note's concepts (see search-strategies.md, Propagate section for the active route)
2. **Match** — Determine what each related page needs:

| Existing Page Type | Update Action |
|---|---|
| Entity | Add new properties or relationships from the source |
| Synthesis | Add new evidence (supporting or contradicting) |
| MOC | Add the new note if it matches the MOC's scope |
| Source | Cross-reference if both discuss same topic |

3. **Propose** — Present all updates in one summary: *"This source would update 3 pages: [[Docker]] (new security properties), [[Container Security]] (new evidence), [[DevOps MOC]] (add to index). Apply all / select / skip?"*
4. **Apply** — User approves (all, some, or none) → apply approved updates

**Contradiction detection:** During step 2, if new source claims conflict with existing page content, flag: *"⚠️ Conflict: new source says X, [[Entity]] says Y — update, keep existing, or note both?"*

**Scope guard:** Cap at 10 pages per ingest. If more related, update top 10 by relevance, report: *"10 pages updated, N more potentially related — run audit for full pass."*

**Citation-aware propagation (papers only):** For paper Source notes at `deep-read` or `extracted` status, Propagation has an additional step: parse the `## Related Work (Graph Seeds)` section for cited paper titles. For each cited paper, search the vault — if found, add a `[[wikilink]]` to the new paper's `cites:` and update the found paper's `cited_by:`. If not found, leave as plain text in `cites:` — audit GROW will surface high-impact missing papers later.

**Claim-level contradiction (papers only):** During Propagation step 2, if the new paper's Claims conflict with Claims in existing paper Source notes, flag at claim level: *"⚠️ Paper A claims X (strong evidence), but [[Paper B]] claims Y (moderate evidence) — mark contested on both?"* Update claim `Status` fields on approval.

### Special Modes

**Query-as-Ingest:** When user says "file this back," "save this insight," "crystallize this" — skip Classify. Context determines type: trade-off → Decision, otherwise → Synthesis. Go straight to Create.

**Batch mode (`--batch`):** Process a folder of raw files with fast-path-only classification. Skip Confirm unless ambiguous. **Skip Index and Propagate during batch** — audit LINT rebuilds the full index afterward: *"Batch complete: N notes created. Run audit to link, index, and propagate?"*

**Parallel batch caveat:** When batch ingest uses parallel agents (e.g., 4 agents ingesting 7 papers simultaneously), each agent cannot cross-reference notes being created by other agents — they don't exist yet. This leaves `cites:`/`cited_by:` fields as plain text for vault papers being created in the same batch. A post-batch `audit link` pass is **mandatory** after parallel ingest to resolve these cross-references. State this explicitly when reporting batch completion.

**LINK-on-Create (`--link`):** After Create, trigger audit mode's LINK on the new note only for immediate graph connectivity.

## Mode: Query

### Pipeline

```
Orient → Search → Read → Synthesize → (File Back)
```

1. **Orient** — Read `index.md` for vault map. If none exists, suggest: *"No index — run audit lint to generate one."*
2. **Search** — Search the vault using the active route. Read `references/search-strategies.md` for strategy by question type.
3. **Read** — Drill into matching notes. Read frontmatter first (understand type), then content. Follow `sources:` arrays for provenance.
4. **Synthesize** — Answer with inline `[[citations]]`. Every key claim references its source note.

Read `references/search-strategies.md` for output format adaptation (prose, tables, timelines, Marp, Canvas).

**Vault-only answers — including surrounding commentary.** Never fall back to general knowledge, not just in the direct answer but in any framing, insights, or comparisons you provide around it. If the vault has notes on topic A but not topic B, don't fill in B from general knowledge and present a comparison — that creates a false sense of completeness. Instead, name the gap: *"Your vault covers A but has nothing on B. Want to add sources for B via ingest?"* Gaps feed the audit GROW cycle and are more valuable surfaced than papered over.

### File Back

If the answer is substantive (comparison, analysis, discovered connection), suggest filing back: *"This connects several notes in a new way — file as a Synthesis note?"*

File Back triggers ingest mode internally — same skill, same context, no handoff. Uses Query-as-Ingest (skip Classify).

Always state your file-back decision: either suggest it, or explain why not (e.g., "A Synthesis covering this already exists at [[Note]]").

## Mode: Audit

### Pipeline

```
LINK → LINT → GROW
```

Invoke with arguments: `audit link`, `audit lint`, `audit grow`, or no argument for all three.

Every audit sub-command (link, lint, grow, or full) produces an audit report note — this gives the user a persistent record of what was found and fixed, and allows future sessions to reference past audit results. Use the Audit Report template below. Name the file `audit-YYYY-MM-DD-<subcommand>.md`.

### LINK — Resolve Relationships

Scan notes with plain-text `## Relationships` sections. For each mention, search vault for matching titles/aliases. Replace with `[[wikilinks]]`, add backlinks to targets, update MOCs.

**Single-file mode (`audit link --file=<path>`):** Run on one note only — used by ingest's `--link` flag.

Only LINK modifies existing notes. LINT and GROW never modify.

### LINT — Health Check

Read `references/audit-checks.md` for the full check list. Core checks: schema compliance, orphan detection, stale sources, tag hygiene, untyped notes, index.md generation, log.md consistency, and EVOLVE checks (field usage analysis, type fit analysis, tag drift).

**Verify before fix:** LINT findings are hypotheses, not facts. Before fixing any reported issue, read the actual file to confirm. Common false positive: YAML multi-line lists (`tags:\n  - a\n  - b`) look empty to line-by-line extraction but contain values on subsequent indented lines. Always verify frontmatter by reading the file, not by trusting extraction output.

**Broken wikilink resolution:** When LINT finds links to non-existent notes, choose based on context:
- **Has Raw Source backing** → create the entity via ingest (the link reflects real knowledge)
- **No Raw Source, referenced from 3+ notes** → flag for user decision (may warrant a new source)
- **No Raw Source, referenced from 1-2 notes** → convert to plain text (preserves relationship without creating unsourced stubs)
Never create stub entity notes without source backing — these were identified as an anti-pattern in prior audits.

LINT generates/updates `index.md` in vault root — organized by page type, one wikilink per note with summary. This is what query mode reads first in Orient.

### GROW — Gap Analysis

Read `references/audit-checks.md` for thresholds. Two categories:

**Internal** (create these artifacts):
- 5+ sources on topic without synthesis → suggest synthesis
- 3+ mentions without entity note → suggest entity
- 8+ notes without MOC → suggest MOC
- LINK failures (unresolved mentions) → suggest entity notes

**External** (investigate these topics):
- Topic with only 1-2 sources → suggest search terms for more
- Synthesis with open questions → surface as research leads
- Stale sources (>90 days) → suggest checking for updates

GROW proposes — never auto-creates, never auto-fetches. User approves, then ingest mode creates.

### Batch Mode

Default: 50 most recently modified notes. Full scan: `--all`. Report scope at start.

### Audit Report

Save as typed vault note:

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
- LINT: found N issues
- GROW: N suggestions (M internal, K external)
```

## Blocked Format

```
⚠️ [Mode] blocked
Issue: [what went wrong]
To resolve: [specific action needed]
```
