# Audit Checks

## Scope

The auditor operates on the **wiki layer** — plain Markdown notes (`.md`) that represent processed knowledge.

### What to scan
- All `.md` files that are user-created knowledge artifacts

### What to skip
- **Plugin-managed folders** — Detect dynamically. If the Excalidraw plugin is installed, read its script folder via `obsidian eval code="app.plugins.plugins['obsidian-excalidraw-plugin'].settings.scriptFolderPath"` and exclude that folder. Apply the same pattern for any plugin that stores non-note files.
- **Raw Source files** — Non-Markdown files (`.excalidraw.md`, `.html`, `.pdf`, `.png`, `.jpg`, `.canvas`) are Raw Sources, not wiki-layer notes.
- **Excalidraw drawings stored as `.md`** — Some Excalidraw drawings use plain `.md` extension instead of `.excalidraw.md`. Detect by checking frontmatter for `excalidraw-plugin: parsed`. These are Raw Sources, not wiki-layer notes — skip them in LINT and exclude from the index. During GROW, treat them the same as `.excalidraw.md` files (check for un-ingested content via `## Text Elements`).

## LINK Checks

### Relationship Resolution
- Find notes with `## Relationships` sections containing plain text (no `[[` links)
- For each mention, search vault using `obsidian-cli` for matching note titles and aliases
- Replace plain text with `[[wikilinks]]` where matches are found
- Add backlink references to target notes: append "Referenced by: `[[source note]]`"
- Update MOC notes when new notes match their declared scope

### Unresolved Mentions
- Collect all plain-text mentions where no vault match was found
- Pass to GROW as high-confidence entity candidates

### Single-File Mode
When invoked with `link --file=<path>`, run LINK on only that one note. Same resolution logic, scoped to one file.

## LINT Checks

### Schema Compliance
- Every note with a `type` field must have the required frontmatter for that type:
  - Source: `type`, `created`, `source_url`, `tags`, `aliases`
  - Entity: `type`, `created`, `entity_type`, `tags`, `aliases`
  - Synthesis: `type`, `created`, `sources`, `tags`, `aliases`
  - MOC: `type`, `created`, `scope`, `tags`, `aliases`
  - Decision: `type`, `created`, `status`, `tags`, `aliases`

**YAML format caution:** Obsidian uses two equivalent list formats. Both are valid — check for both before reporting "missing" or "empty" fields:
```yaml
# Inline (single line)
tags: [arcforge, tdd]

# Block (multi-line, indented with -)
tags:
  - arcforge
  - tdd
```
A field like `tags:` with no inline value is NOT empty if the next lines are indented `  - ` items. Read the full frontmatter block, not just the key's line.

### Orphan Detection
- Notes with zero inbound or outbound links

### Stale Detection
- Source notes older than 30 days with no synthesis note referencing them

### Tag Hygiene
- Unused tags (defined but never used)
- Inconsistent naming (e.g., `#AI` vs `#ai`)
- Missing tags (notes with no tags at all)

### Untyped Notes
- Notes without a `type` field in frontmatter
- Report but never auto-fix — list under "Untyped" in reports

### Index Freshness
Auto-generate or update `index.md` in vault root every LINT pass:

```markdown
# Vault Index
Last updated: YYYY-MM-DD

## Sources
- [[Note Title]] — one-line summary

## Entities
- [[Note Title]] — one-line summary

## Syntheses
- [[Note Title]] — one-line summary

## Maps of Content
- [[Note Title]] — one-line summary

## Decisions
- [[Note Title]] — one-line summary

## Untyped
- [[Note Title]] — (no type)
```

Only include typed wiki-layer notes (skip Raw Sources, audit reports, plugin-managed files).

### Log Consistency
- Verify `log.md` entries reference existing vault files
- For notes with `created:` date newer than first `log.md` entry, flag missing log entries

### EVOLVE Checks (Schema Evolution)

These checks detect schema drift — patterns in actual usage that suggest the schema should evolve:

| Check | What It Detects | Example |
|---|---|---|
| **Field usage analysis** | Fields that are 90%+ empty across a type, or extra fields appearing in 80%+ of a type | "`source_author` is empty in 90% of Source notes" |
| **Type fit analysis** | Notes whose section structure doesn't match their declared type | "12 Entity notes have `## Steps` sections — tutorial pattern?" |
| **Tag drift** | Tags used 10+ times that aren't in any schema definition | "#distributed-systems used in 15 notes — formalize?" |

Report in the Schema Issues section of the audit report. These are observations, not errors — the user decides whether to evolve the schema.

## GROW Thresholds

### Internal Suggestions (create artifacts)

| Pattern | Threshold | Suggestion |
|---|---|---|
| Sources without synthesis | 5+ source notes reference a topic with no synthesis | "Consider a synthesis note connecting these sources" |
| Mentions without entity | 3+ notes mention an entity with no entity note | "Consider an entity note for [name]" |
| Notes without MOC | 8+ notes in a topic area with no MOC | "Consider a Map of Content for [topic]" |
| Referenced entities missing | Source notes reference entities that don't exist | "These entities appear in sources but have no notes: [list]" |
| LINK failures | Unresolved plain-text mentions from LINK | "LINK couldn't resolve these — consider creating entity notes: [list]" |

### External Suggestions (investigate topics)

| Pattern | Suggestion |
|---|---|
| Thin coverage (1-2 sources on a topic) | "Thin coverage — consider searching for more. Try: [2-3 search terms]" |
| Concept referenced but unexplored | "[Concept] appears in N sources but has no dedicated note or external sources — worth investigating?" |
| Open questions in Synthesis notes | "These open questions might be answerable with research: [list from ## Open Questions sections]" |
| Stale topics (>90 days, no updates) | "These topics may have new developments worth checking: [list]" |

### Un-ingested Raw Sources

During GROW, detect non-Markdown files with meaningful content but no corresponding Source note:

| File Type | Meaningful content signal |
|---|---|
| `.excalidraw.md` | Has `## Text Elements` with text content |
| `.html` | File size > 1KB |
| `.pdf` | Exists in vault |
| `.png` / `.jpg` | Not inside a plugin-managed folder |

Suggest: "These files have content that hasn't been ingested — consider running ingest to create Source notes from them."

### Duplicate Detection

Before suggesting new artifacts, check for potential duplicates (80%+ title match with existing note). Skip the suggestion if a near-match exists.

### Citation Graph Checks (Paper Sources)

These checks apply only to Source notes with `reading_status` in their frontmatter (i.e., paper variants).

| Check | What It Detects | Action |
|---|---|---|
| **Citation orphans** | `cites:` entries that are plain text (not wikilinks to vault notes) | GROW suggestion: "This paper cites [title] which isn't in your vault — ingest it?" Prioritize by: how many vault papers cite the same missing paper |
| **Reverse citation updates** | A newly ingested paper cites an existing vault paper, but the existing paper's `cited_by:` doesn't include it | Auto-fix: add to `cited_by:` (this is a LINK-level fix, not GROW) |
| **High-impact missing papers** | A paper appears in 3+ vault papers' `cites:` but has no vault note | High-priority GROW: "N papers in your vault cite [title] — strongly consider ingesting" |
| **Citation island** | A paper has empty `cites:` and `cited_by:` despite being `deep-read` or `extracted` | Flag: "This paper has no citation connections — was Related Work parsed?" |

### Reading Status Checks

| Check | What It Detects | Suggestion |
|---|---|---|
| **Queued backlog** | Papers in `queued` status for >14 days | Report count: "N papers queued for >2 weeks" |
| **Priority queue** | `queued` papers with high `cited_by` count in vault | "These queued papers are cited by N vault papers — prioritize reading: [list]" |
| **Stale skimmed** | Papers in `skimmed` status for >30 days | "N papers skimmed but never deep-read — promote or archive?" |
| **Incomplete extraction** | Papers in `deep-read` with empty `cites:` | "These papers were deep-read but Related Work wasn't parsed — run extraction to complete?" |

### Claim Consistency Checks

Scan all paper Source notes with `## Claims` sections:

| Check | What It Detects | Report |
|---|---|---|
| **Uncontested conflicts** | Two papers make contradictory claims but neither has `Status: contested` | "⚠️ Claim conflict: Paper A says X, Paper B says Y — neither is marked contested" |
| **Evidence asymmetry** | A `contested` claim has weaker evidence than the contesting paper's claim | Note in report: "Paper A's claim (weak evidence) contested by Paper B (strong evidence) — consider marking superseded" |
| **Stale supported claims** | Claims marked `supported` from papers >1 year old with no recent corroboration | "These claims haven't been corroborated by recent papers — worth checking" |

Claim checks are observations — flag in the audit report but never auto-modify claim statuses. The user decides.

## Batch Mode

- **Default**: 50 most recently modified notes
- **Full scan**: `--all` flag
- Report scope at start: "Scanning 50 most recent notes (use --all for full vault)."
