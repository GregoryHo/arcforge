# Raw Source Ingest (mechanism)

This file documents the **mechanical** primitives the skill needs during
ingest: Raw Source frontmatter, the `sha256` hashing rule, extraction
methods per file type, and the Paper URL fallback chain. Infrastructure
and tool knowledge — vault-agnostic.

Vault-specific note types, templates, language rules, and Visual Guidance
live in vault `AGENTS.md` `## Schema` (or its sibling `SCHEMA.md` when
split).

## Raw Source Ingest

Raw Sources are immutable originals — articles, PDFs, screenshots,
Excalidraw drawings, HTML exports. They live in `Raw/` (or vault-declared
raw folders). The wiki layer reads them and creates a typed note (per vault SCHEMA.md —
typically called Source, Article, or similar in different presets) that
points back via `source_url`. The original is never modified.

### Raw Source Frontmatter

```yaml
---
source_url: ""           # Original URL or "local" for files already in the vault
source_author: ""        # Author or organization
fetched: YYYY-MM-DD      # First capture date
ingested: YYYY-MM-DD     # Last successful wiki ingest from this raw body
sha256: ""               # sha256 of body bytes AFTER frontmatter
---
```

The body is the raw content exactly as extracted — no summarization, no
restructuring.

### Hashing Rule

When ingesting (or re-ingesting) a Raw Source:

1. Strip the frontmatter (everything between leading and trailing `---` fences).
2. Normalize line endings on the remaining body to `\n`; treat bytes as UTF-8.
3. Compute `sha256` of those bytes.
4. Store the digest in `sha256`. Set `ingested: YYYY-MM-DD` to the date the
   typed wiki note was (re)written.

### Re-ingest Behavior

| Condition | Behavior |
|---|---|
| New body sha256 == stored | Content unchanged. Skip wiki regeneration. Update `fetched` only if user asks for refresh. |
| New body sha256 ≠ stored | **Drift detected.** Append `drift | <filename> | sha=<old>→<new>` to `log.md`. Prompt user before overwriting typed wiki note. |
| Stored sha256 is empty | Compute and write sha256 + `ingested`. Offer batch backfill via audit LINT. |

### Extraction Methods

| File Type | Method |
|---|---|
| `.excalidraw.md` | Read `## Text Elements` (ignore `## Drawing` compressed data) |
| `.html` | `defuddle` skill or read raw HTML |
| `.pdf` | Claude PDF reader (requires `poppler` — see Paper URL chain) |
| `.png` / `.jpg` | Claude vision |
| URL | **Defuddle first** (`defuddle parse <url> --md`). WebFetch only for APIs / raw text endpoints. |
| `.md` (in `Raw/`) | Read full content directly |

### Paper URL Extraction Chain

For URLs pointing to academic papers (arXiv, ACL Anthology, Semantic
Scholar, conference proceedings), try in order — stop at first success:

| Priority | Method | When |
|---|---|---|
| **1a. Native HTML + defuddle** | `defuddle parse <html-url> --md` | arXiv `/html/` (~2023+), ACL Anthology, native-HTML sites |
| **1b. ar5iv HTML + defuddle** | `defuddle parse ar5iv.labs.arxiv.org/html/<id> --md` | arXiv pre-2023 |
| **2. PDF + Read tool** | Download to `Raw/Papers/`, read with `Read` | When PDF reader works (`brew install poppler`) |
| **3. Abstract page + defuddle** | `defuddle parse <abstract-url> --md` | Always available; enough for `queued` status |

**URL patterns:**
- arXiv (native): `arxiv.org/pdf/XXXX.XXXXX` → try `arxiv.org/html/XXXX.XXXXXvN` first
- arXiv (retroactive): if native HTML 404s → `ar5iv.labs.arxiv.org/html/XXXX.XXXXX`
- ACL Anthology / Semantic Scholar: most have HTML at the same URL

**Why HTML over PDF:** PDFs lose structure (multi-column interleaving, table
alignment, math → garbled Unicode). HTML preserves DOM; defuddle extracts
cleanly as markdown.

**Always download the PDF to `Raw/Papers/`** regardless of which extraction
method succeeds — the PDF is the canonical immutable original.

**Why Defuddle over WebFetch:** WebFetch runs raw HTML through AI
summarization — output is interpreted, not original. SPA / client-rendered
sites often return only the JS shell. Defuddle renders in a real browser
and extracts clean DOM as markdown — faithful to original.

### Ingest Output

The result is always a typed typed wiki note (per vault contract) with
`source_url` pointing to the original. Never modify the original.

```
Raw Source: Excalidraw/AI/autonomous-agent-core-concepts.excalidraw.md
     ↓ Ingest (hash body, compute sha256)
Wiki note: autonomous-agent-core-concepts.md
     source_url: "Excalidraw/AI/autonomous-agent-core-concepts.excalidraw.md"
     sha256: "<digest>"
     ingested: YYYY-MM-DD
```

### Detecting Un-ingested Raw Sources (used by audit GROW)

Detect files with meaningful content but no corresponding typed wiki note:

| File Type | Content signal | Has Source? |
|---|---|---|
| `.excalidraw.md` | Has `## Text Elements` with content | Check for `.md` with `source_url` pointing to it |
| `.html` | File size > 1KB | Same |
| `.pdf` | Exists in vault | Same |
| `.png` / `.jpg` | Not in plugin-managed folder | Same |

GROW suggests: *"These files have content that hasn't been ingested —
consider running ingest."*

This detection runs only for vaults whose AGENTS.md declares
`raw_source: adopted`. Vaults without the Raw Source pattern skip it.

## Audit Report (frontmatter shell)

The audit report is a typed vault note. Vault contract may extend the type:

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---

## LINK Results

## LINT Results
### Schema Issues
### Source Drift
### Orphan Notes
### Tag Issues
### Schema Evolution

## GROW Suggestions
### Internal
### External
### Open Questions
```
