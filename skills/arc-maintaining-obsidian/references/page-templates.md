# Page Templates

## Universal Frontmatter

All page types include:

```yaml
---
type: source | entity | synthesis | moc | decision | log
created: YYYY-MM-DD
tags: []
aliases: []
---
```

## Source

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

## Entity

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

## Synthesis

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

## MOC (Map of Content)

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
[Organized list of related notes — audit mode populates wikilinks.
Group by subtopic or chronology, whichever makes more sense.]

## Frontier
[Areas not yet explored — gaps worth filling]
```

## Decision

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

## Log

Logs do not create a new file. Append to daily note via obsidian-cli:

```
## HH:MM — [Title]
[Content — brief, timestamped, factual]
```

## Raw Source Ingest

### Raw Source Frontmatter

Raw Sources are immutable originals, but they need minimal metadata for traceability. When saving a new Raw Source to the vault, include this frontmatter:

```yaml
---
source_url: ""
source_author: ""
fetched: YYYY-MM-DD
---
```

- `source_url` — Original URL or "local" for files already in the vault
- `source_author` — Author or organization name
- `fetched` — Date the content was captured (not the content's publication date)

The body is the raw content exactly as extracted — no summarization, no restructuring. The Wiki-layer Source note handles interpretation.

### What is a Raw Source?

In Karpathy's model, anything that isn't a typed wiki-layer Markdown note is a Raw Source — immutable originals that should be ingested into the wiki layer as text. Common types:

| Raw Source | Where It Lives | Example |
|-----------|---------------|---------|
| Excalidraw drawings | `Excalidraw/` | Architecture diagrams, concept maps |
| Web articles | Clipped to vault or URL | Blog posts, documentation |
| PDFs | Vault root or subfolders | Papers, reports, exported slides |
| Screenshots | Various folders | Whiteboard photos, UI captures |
| HTML exports | Vault root or subfolders | Analytics reports, dashboards |

### Extraction Methods

| File Type | Extraction Method |
|-----------|------------------|
| `.excalidraw.md` | Read `## Text Elements` section (ignore `## Drawing` compressed data) |
| `.html` | Use `defuddle` skill or read raw HTML |
| `.pdf` | Read with Claude's PDF reader |
| `.png` / `.jpg` | Describe with Claude's vision |
| URL | **Defuddle first** (`defuddle parse <url> --md`). Only fall back to WebFetch for APIs or raw text endpoints. |
| `.md` (in Raw/) | Read full content — already markdown, no extraction needed |

**Why Defuddle over WebFetch for URLs:** WebFetch fetches raw HTML and runs it through an AI summarization layer — the output is AI-interpreted, not the original content. For SPA/client-rendered sites (React, Obsidian docs, etc.) it often gets only the JavaScript shell. Defuddle renders the page in a real browser and extracts the DOM as clean markdown, preserving tables, code blocks, and structure without AI interpretation. Raw Sources must be faithful to the original — AI-processed content defeats the purpose of an immutable source layer.

### Ingest Output

The result is always a **Source** note with `source_url` pointing to the original file (relative vault path or URL). Never modify the original file.

**Example:**
```
Raw Source: Excalidraw/AI/autonomous-agent-core-concepts.excalidraw.md
     ↓ Ingest
Source note: autonomous-agent-core-concepts.md
     source_url: "Excalidraw/AI/autonomous-agent-core-concepts.excalidraw.md"
```

### Detecting Un-ingested Raw Sources (used by audit GROW)

During audit, detect files that have meaningful content but no corresponding Source note:

| File Type | Meaningful content signal | Has Source note? |
|-----------|-------------------------|-----------------|
| `.excalidraw.md` | Has `## Text Elements` with text content | Check for `.md` with `source_url` pointing to it |
| `.html` | File size > 1KB | Check for `.md` with `source_url` pointing to it |
| `.pdf` | Exists in vault | Check for `.md` with `source_url` pointing to it |
| `.png` / `.jpg` | Not inside a plugin-managed folder | Check for `.md` with `source_url` pointing to it |

If no Source note exists, GROW suggests: "These files have content that hasn't been ingested — consider running ingest to create Source notes from them."

## Audit Report

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---
## LINK Results
- Resolved N relationships across M notes
- [list of changes made]

## LINT Results
### Schema Issues
- [list]

### Orphan Notes
- [list]

### Stale Sources
- [list]

### Tag Issues
- [list]

### Schema Evolution
- [field usage and type fit observations]

## GROW Suggestions
### Internal (create these artifacts)
1. [highest impact suggestion]

### External (investigate these topics)
1. [search terms + reasoning]

### Open Questions (from existing notes)
1. [question + source note]
```
