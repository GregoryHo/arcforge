---
name: arc-writing-obsidian
description: Use when the user wants to capture ideas, research, decisions, or conversations as structured Obsidian vault artifacts. Trigger on any mention of creating notes, documents, diagrams, or saving something to a vault. Also trigger when the user shares a URL or article to save, discusses a concept worth documenting, makes a decision worth recording, or when a brainstorm produces something worth preserving — even if they don't explicitly say "Obsidian" or "vault." Also trigger when the user wants to ingest non-Markdown files into the vault — Excalidraw drawings, PDFs, HTML reports, screenshots, or any Raw Source that should become a wiki note. Covers knowledge capture, second brain, note-taking, wiki workflows, and Raw Source ingestion.
---

# arc-writing-obsidian

Conversational Crystallizer — turn ideas into structured Obsidian artifacts using Karpathy's LLM Wiki page types and kepano's file-over-app philosophy.

The core insight: most ideas start as conversation, not documents. This skill bridges the gap — it classifies what you're talking about, confirms the right artifact type, and creates it with an opinionated schema that makes your vault auditable and linkable over time.

## Pipeline

Every invocation follows three steps:

```
Classify → Confirm → Create
```

1. **Classify** — Determine which page type fits the user's input (see table below)
2. **Confirm** — Tell the user: "This looks like a **[type]** note — agree?" Wait for confirmation before proceeding
3. **Create** — Apply the template, write the artifact, place it in the vault

### Fast Path

Skip the Confirm step when classification is unambiguous. A single obvious keyword trigger (e.g., "log this meeting" → Log, "document this decision" → Decision) means you can go straight to Create. When in doubt, confirm — false confidence wastes more time than one extra question.

### Query-as-Ingest

When the user says "file this back," "save this insight," "keep this," or "crystallize this" during conversation, skip Classify — the conversation context determines the type:

- If the conversation contains a choice or trade-off → **Decision**
- Otherwise → **Synthesis**

Go straight to Create with the conversational context as input. This makes compounding frictionless — valuable discussion threads become vault artifacts without re-deriving the page type. The insight here is from Karpathy: good answers should be filed back into the wiki as new pages, so explorations compound just like ingested sources.

## Page Types

Classify user input into one of these six types. The trigger signals help — but use judgment, not keyword matching.

| Type | Trigger Signal | What It Produces |
|------|---------------|-----------------|
| **Source** | User shares a URL, article, paper, or reference material | Summary + metadata + key takeaways |
| **Entity** | User discusses a person, tool, concept, company, or framework | Definition + properties + plain text relationships |
| **Synthesis** | User connects ideas, asks "how does X relate to Y", or makes an argument spanning sources | Thesis + evidence + Mermaid relationship diagram |
| **MOC** | User wants an overview of a topic area or asks "what do I know about X" | Index of related notes + navigation + frontier |
| **Decision** | User weighs trade-offs, compares options, or announces a choice | Context + options + decision + rationale |
| **Log** | User captures something timestamped — meeting notes, observations, events | Append to daily note |

## Template Schema

Every artifact gets opinionated frontmatter. This schema is the contract with the auditor skill — it enables automated linking, linting, and gap detection later.

### Universal Frontmatter

All page types include:

```yaml
---
type: source | entity | synthesis | moc | decision | log
created: YYYY-MM-DD
tags: []
aliases: []
---
```

### Source

```yaml
---
type: source
created: YYYY-MM-DD
source_url: ""
source_author: ""
tags: []
aliases: []
---
## Summary
[2-3 sentence overview of the source material]

## Key Takeaways
- [Most important points, not exhaustive]

## Raw Notes
[Detailed extraction — quotes, data, arguments worth preserving]
```

### Entity

```yaml
---
type: entity
created: YYYY-MM-DD
entity_type: person | tool | concept | company | framework
tags: []
aliases: []
---
## What It Is
[Concise definition — what would someone need to know in 30 seconds]

## Properties
[Key attributes — depends on entity_type]

## Relationships
[Plain text descriptions of how this entity connects to other concepts.
The auditor resolves these into wikilinks later — write naturally here.]
```

### Synthesis

```yaml
---
type: synthesis
created: YYYY-MM-DD
sources: []
tags: []
aliases: []
---
## Thesis
[The core argument or connection being made]

## Evidence
[Supporting points from sources]

## Relationships
` ``mermaid
graph LR
    A[Concept A] --> B[Concept B]
` ``

## Open Questions
- [What remains unresolved or worth exploring]
```

### MOC (Map of Content)

```yaml
---
type: moc
created: YYYY-MM-DD
scope: ""
tags: []
aliases: []
---
## Overview
[What this map covers and why it exists]

## Core Notes
[Organized list of related notes — the auditor populates wikilinks later.
Group by subtopic or chronology, whichever makes more sense.]

## Frontier
[Areas not yet explored — gaps worth filling]
```

### Decision

```yaml
---
type: decision
created: YYYY-MM-DD
status: proposed | decided | superseded
tags: []
aliases: []
---
## Context
[Why this decision is needed — what prompted it]

## Options

### Option A: [Name]
**Pros:** ...
**Cons:** ...

### Option B: [Name]
**Pros:** ...
**Cons:** ...

## Decision
[What was chosen]

## Rationale
[Why — the reasoning that tipped the scale]
```

### Log

Logs do not create a new file. Append to the daily note using the obsidian-cli skill:

```
## HH:MM — [Title]
[Content — brief, timestamped, factual]
```

## Raw Source Ingest

In Karpathy's three-layer model, anything that isn't a Markdown wiki note is a **Raw Source** — immutable originals that should be ingested into the wiki layer as text. This includes Excalidraw drawings, PDFs, HTML reports, screenshots, and any other non-Markdown file in the vault.

When the user shares a non-Markdown file or asks to document one:

1. **Detect format** — Determine file type and choose extraction method:

   | File Type | Extraction Method |
   |-----------|------------------|
   | `.excalidraw.md` | Read `## Text Elements` section (ignore `## Drawing` compressed data) |
   | `.html` | Use `defuddle` skill or read raw HTML |
   | `.pdf` | Read with Claude's PDF reader |
   | `.png` / `.jpg` | Describe with Claude's vision |
   | URL | Use `defuddle` skill or WebFetch |

2. **Classify** — The result is always a **Source** note
3. **Create** — Write a Source note with:
   - `source_url` pointing to the original file (relative vault path or URL)
   - Summary synthesized from extracted content
   - Key Takeaways distilled from the source material
4. **Preserve** — Never modify the original file

**Example:**
```
Raw Source: Excalidraw/AI/autonomous-agent-core-concepts.excalidraw.md
     ↓ Ingest
Source note: autonomous-agent-core-concepts.md
     source_url: "Excalidraw/AI/autonomous-agent-core-concepts.excalidraw.md"
```

The original file stays immutable. Knowledge flows into the wiki as text, where the auditor can LINK it into the knowledge graph.

## Batch Mode

When invoked with `--batch` on a folder of raw files:

1. **Scan** — List all files in the target folder
2. **Auto-classify** — Classify each file using fast-path only (skip Confirm unless classification is genuinely ambiguous)
3. **Create** — Process each file sequentially, creating typed notes
4. **Log** — Append each creation to `log.md` (see Session Log)
5. **Summarize** — Emit a batch summary: `✅ Batch complete: N notes created (X sources, Y entities, ...)`

Batch mode trades per-source discussion for throughput. Use it for initial vault population or bulk ingestion of reference material. For ongoing curation where each source deserves attention, use the standard one-at-a-time pipeline.

**Warning:** Classification errors cascade in batch mode — a misclassified source won't get a Confirm gate to catch it. Review the batch summary and spot-check a few notes after completion.

## Artifact Tiers

**Tier 1 (default):** Markdown notes + embedded Mermaid diagrams. Use for all page types.

**Tier 2 (spatial):** Canvas (.canvas) files. Use when the user explicitly asks for a mind map, visual board, or relationship web — or when the content is fundamentally spatial (many nodes with cross-connections that linear text can't capture). Delegate canvas creation to the `json-canvas` skill.

**Tier 3 (visual argument):** Excalidraw diagrams. Use when the user explicitly asks for a diagram, architecture visualization, or when a Synthesis note needs a relationship diagram more expressive than Mermaid. Delegate to `arc-diagramming-obsidian`.

## Delegation

Delegate format correctness to kepano's obsidian skills — they know the syntax rules, this skill knows the workflow:

- Markdown formatting → invoke `/obsidian:obsidian-markdown`
- Canvas creation → invoke `/obsidian:json-canvas`
- Daily note append → invoke `/obsidian:obsidian-cli`
- Excalidraw diagrams → invoke `arc-diagramming-obsidian`

## Relationship Handling

Write relationships as plain text, not wikilinks. The auditor skill (`arc-auditing-obsidian`) resolves plain text into `[[wikilinks]]` after scanning the vault. This keeps the writer simple — it does not need vault awareness.

**Example (Entity note):**
```
## Relationships
Related to Karpathy's LLM Wiki concept for persistent knowledge management.
Used alongside kepano's obsidian-skills for format correctness.
Competes with traditional RAG approaches.
```

The auditor later converts these into `[[Karpathy's LLM Wiki]]`, `[[kepano]]`, `[[RAG]]` etc.

## Session Log

After creating any artifact (including Log appends to daily notes), append a structured entry to `log.md` in the vault root:

```
## [YYYY-MM-DD] create | [type] | [filename]
```

This dual-write serves two audiences:
- **Daily notes** → for the human browsing in Obsidian
- **log.md** → for the LLM to quickly scan recent vault activity (`grep "^## \[" log.md | tail -10`)

If `log.md` doesn't exist, create it with a `# Vault Log` header. Entries are append-only — never edit or remove existing entries. The auditor validates `log.md` consistency during LINT.

## Vault Path

On first invocation, determine the vault path:
1. Check if `obsidian-cli` is available — ask it for the vault location
2. If Obsidian is not running, ask the user for the vault path
3. Store the path for subsequent invocations in the session

If Obsidian is not running, fall back to direct file writes using the `obsidian-markdown` skill. Warn the user that wikilink resolution (done by the auditor) requires the CLI.

## Completion Format

```
✅ Created [type] note → [vault-path/filename.md]
```

### LINK-on-Create

When invoked with `--link`, run a targeted LINK pass on the newly created note immediately after creation:

1. Create the note (normal pipeline)
2. Invoke `arc-auditing-obsidian link --file=<path>` on the new note only
3. Report both results:

```
✅ Created [type] note → [vault-path/filename.md]
   Linked: N relationships resolved
```

This preserves separation of concerns — the writer delegates linking to the auditor — while giving the user immediate graph connectivity instead of waiting for a full audit pass.

## Blocked Format

```
⚠️ Writing blocked
Issue: [what went wrong]
To resolve: [specific action needed]
```

## After This Skill

If you created 3+ artifacts in this session, suggest running the auditor:
"You've created several notes — want me to run `/arc-auditing-obsidian link` to wire them into your vault?"
