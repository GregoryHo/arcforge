# Obsidian Skills Design

## Vision

Two complementary skills that bring Karpathy's LLM Wiki pattern to Obsidian:
- **arc-obsidian-writer**: Conversational Crystallizer — classifies ideas into Karpathy page types and creates opinionated Obsidian artifacts
- **arc-obsidian-auditor**: Wiki Lint Layer — maintains knowledge graph health through linking, linting, and gap detection

Philosophy: kepano's "file over app" (plain markdown, no plugins) + Karpathy's "persistent compounding wiki" (LLM-maintained, schema-driven).

## Architecture Decision

### Two-Skill Split
The writer creates artifacts. The auditor wires the graph. They never overlap:
- Writer has NO vault awareness — outputs plain text relationships
- Auditor has FULL vault awareness — resolves relationships into wikilinks
- Auditor proposes new artifacts → user approves → writer creates

### Opinionated Schema (Karpathy-inspired)
All notes follow a strict frontmatter schema per page type. This is the contract between writer and auditor — the auditor can lint because the schema is stable.

### Three Artifact Tiers
- **Tier 1 (core)**: Markdown notes + embedded Mermaid diagrams
- **Tier 2 (spatial)**: Canvas (.canvas) for mind maps and relationship webs
- **Tier 3 (skip for now)**: Bases (.base), Excalidraw

## Document Writer — arc-obsidian-writer

### Skill Type
Workflow (sequential pipeline with clear start/end)

### Pipeline

```
User input (idea/brainstorm/source)
       ↓
  ┌─────────┐
  │ Classify │  Detects Karpathy page type + artifact tier
  └────┬─────┘
       ↓
  ┌──────────┐
  │ Confirm   │  "This is a synthesis note with Mermaid — agree?"
  └────┬──────┘  (skip if unambiguous — fast path)
       ↓
  ┌──────────┐
  │ Template  │  Selects page type template + frontmatter
  └────┬──────┘
       ↓
  ┌──────────┐
  │ Create    │  Writes via kepano skills (obsidian-markdown, json-canvas)
  └────┬──────┘
       ↓
  ┌──────────┐
  │ Place     │  Outputs to vault path based on page type conventions
  └──────────┘
```

### Page Type Classification

| Page Type | Trigger Signal | Template |
|-----------|---------------|----------|
| **Source** | User shares a URL, article, or reference | Summary + metadata + key takeaways |
| **Entity** | User discusses a person, tool, concept, company | Definition + properties + relationships |
| **Synthesis** | User connects multiple ideas or asks "how does X relate to Y" | Argument + evidence + Mermaid diagram |
| **MOC** | User wants an overview of a topic area | Index of related notes + navigation structure |
| **Decision** | User weighs trade-offs or makes a choice | Context + options + decision + rationale |
| **Log** | User captures something timestamped | Append to daily note |

### Template Schema

**Universal frontmatter (all page types):**
```yaml
---
type: source | entity | synthesis | moc | decision | log
created: YYYY-MM-DD
tags: []
aliases: []
---
```

**Source:**
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
[2-3 sentence overview]

## Key Takeaways
- ...

## Raw Notes
[detailed extraction]
```

**Entity:**
```yaml
---
type: entity
created: YYYY-MM-DD
entity_type: person | tool | concept | company | framework
tags: []
aliases: []
---
## What It Is
[definition]

## Properties
[key attributes]

## Relationships
[plain text — auditor adds wikilinks later]
```

**Synthesis:**
```yaml
---
type: synthesis
created: YYYY-MM-DD
sources: []
tags: []
aliases: []
---
## Thesis
[core argument]

## Evidence
[supporting points]

## Relationships
` ``mermaid
graph LR
    A --> B
` ``

## Open Questions
- ...
```

**MOC (Map of Content):**
```yaml
---
type: moc
created: YYYY-MM-DD
scope: ""
tags: []
aliases: []
---
## Overview
[what this map covers]

## Core Notes
[organized list — auditor populates links later]

## Frontier
[areas not yet explored]
```

**Decision:**
```yaml
---
type: decision
created: YYYY-MM-DD
status: proposed | decided | superseded
tags: []
aliases: []
---
## Context
[why this decision is needed]

## Options
### Option A
- Pros / Cons

### Option B
- Pros / Cons

## Decision
[what was chosen]

## Rationale
[why]
```

**Log:** No dedicated file — appends to daily note via obsidian-cli.

### Key Design Choice
Writer leaves relationship fields as plain text (not wikilinks). The auditor resolves these into `[[wikilinks]]` after scanning the vault. Writer does not need vault awareness.

### Delegation
- Format correctness → `/obsidian:obsidian-markdown`
- Canvas creation → `/obsidian:json-canvas`
- Daily note append → `/obsidian:obsidian-cli`

## Wiki Auditor — arc-obsidian-auditor

### Skill Type
Discipline (cross-cutting quality gate, fires standalone or during workflows)

### Three Operations

#### LINK — Resolve relationships into wikilinks
- Scan notes with plain-text relationship fields
- Search vault for matching entities/concepts via obsidian-cli
- Replace plain text with `[[wikilinks]]`
- Add backlink references to target notes
- Update MOCs when new notes match their scope

#### LINT — Health check the knowledge graph
- Schema compliance: all notes have required frontmatter for their type
- Orphan detection: notes with zero inbound/outbound links
- Stale detection: source notes older than N days with no synthesis
- Contradiction flags: multiple notes making conflicting claims
- Tag hygiene: unused tags, inconsistent naming, missing tags

#### GROW — Identify and propose new artifacts
- Gap analysis: "5 source notes about X but no synthesis"
- Entity extraction: "3 notes mention Y but no entity note exists"
- MOC suggestions: "Topic Z has 8+ notes — consider a MOC"
- Proposes only — user approves, writer creates

### Invocation

| Command | Action |
|---------|--------|
| `/auditor link` | LINK on recent unlinked notes |
| `/auditor lint` | Full vault health report |
| `/auditor grow` | Gap analysis + suggestions |
| `/auditor` | All three: link → lint → grow |

### Output
Audit report note in vault (type: audit-report) with findings and suggested actions. Only LINK modifies existing notes (adding wikilinks). LINT and GROW are suggestions only.

## Skill Composition

### Dependency Chain
```
User
 ├── /arc-obsidian-writer   (Workflow)
 │    ├── /obsidian:obsidian-markdown
 │    ├── /obsidian:json-canvas
 │    └── /obsidian:obsidian-cli
 │
 └── /arc-obsidian-auditor  (Discipline)
      ├── /obsidian:obsidian-cli
      ├── /obsidian:obsidian-markdown
      └── proposes → /arc-obsidian-writer (user approves)
```

### arc-using Routing

| Condition | Routes to |
|-----------|-----------|
| User asks to create a note/document/diagram for Obsidian | arc-obsidian-writer |
| User asks about vault health, missing links, orphan notes | arc-obsidian-auditor |
| User says "audit my vault" or "check my notes" | arc-obsidian-auditor |
| Writer finishes creating 3+ artifacts in one session | Suggest arc-obsidian-auditor link |

### What We Do NOT Build
- No MCP server (use obsidian-cli skill)
- No custom Obsidian plugin (file-first philosophy)
- No RAG/vector search (Neural Composer territory)
- No sync/backup (Obsidian Sync or git)

## Error Handling

### Writer

| Scenario | Handling |
|----------|---------|
| Can't classify page type | Ask user explicitly |
| Obsidian not running | Fall back to direct file write. Warn about wikilink resolution. |
| Vault path unknown | Ask user on first run, store path |
| Ambiguous fast path | Default to confirm step |
| Mermaid syntax error | Validate before writing, fallback to code block |

### Auditor

| Scenario | Handling |
|----------|---------|
| Vault too large (1000+ notes) | Batch by most recent 50. `--all` for full scan. |
| Notes without type frontmatter | Report as "untyped" in LINT. Never auto-add. |
| Contradictions detected | Flag, never resolve |
| GROW suggests duplicates | Check title + alias match before suggesting |
| CLI errors | Report in audit report. Never silently swallow. |

### Shared — Vault Path Configuration
1. Check obsidian-cli for vault path
2. If unavailable → ask user once, store path
3. Subsequent runs use stored path

### Explicitly Out of Scope
- Multi-vault workflows
- Concurrent editing conflict resolution
- Undo/rollback (git handles this)

---

<!-- REFINER_INPUT_START -->

## Requirements for Refiner

### Functional Requirements

- REQ-F001: Writer classifies user input into 6 page types (source, entity, synthesis, moc, decision, log)
- REQ-F002: Writer confirms classification with user before creating (conversational crystallizer pattern)
- REQ-F003: Writer supports fast path — skip confirmation when classification is unambiguous
- REQ-F004: Writer creates Tier 1 artifacts (markdown + Mermaid) for all page types
- REQ-F005: Writer creates Tier 2 artifacts (canvas) when spatial thinking is needed
- REQ-F006: Writer applies opinionated frontmatter schema per page type
- REQ-F007: Writer delegates format correctness to kepano's obsidian skills
- REQ-F008: Writer leaves relationships as plain text (no vault awareness)
- REQ-F009: Auditor LINK resolves plain-text relationships into wikilinks
- REQ-F010: Auditor LINK updates MOCs when new notes match their scope
- REQ-F011: Auditor LINT checks schema compliance, orphans, staleness, contradictions, tag hygiene
- REQ-F012: Auditor GROW detects gaps (missing synthesis, missing entities, MOC candidates)
- REQ-F013: Auditor GROW proposes but never auto-creates
- REQ-F014: Auditor outputs audit-report note in vault
- REQ-F015: Auditor operates in batches (default 50 most recent) with --all override

### Non-Functional Requirements

- REQ-N001: Writer must work without Obsidian running (fallback to direct file write)
- REQ-N002: Auditor must not silently swallow errors
- REQ-N003: Both skills must follow arcforge's zero-external-dependencies rule (Node.js stdlib only for any scripting)
- REQ-N004: Both skills are markdown SKILL.md definitions (no compiled code in the skill itself)

### Constraints

- Must delegate to kepano's obsidian skills for format correctness — no duplicating OFM syntax rules
- Must not build MCP server, Obsidian plugin, or RAG system
- Writer and auditor communicate only through vault artifacts — no direct skill-to-skill calls
- Single vault only — no multi-vault support
<!-- REFINER_INPUT_END -->
