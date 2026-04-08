# Audit Checks

## Scope

The auditor operates on the **wiki layer** — plain Markdown notes (`.md`) that represent processed knowledge.

### What to scan
- All `.md` files that are user-created knowledge artifacts

### What to skip
- **Plugin-managed folders** — Detect dynamically. If the Excalidraw plugin is installed, read its script folder via `obsidian eval code="app.plugins.plugins['obsidian-excalidraw-plugin'].settings.scriptFolderPath"` and exclude that folder. Apply the same pattern for any plugin that stores non-note files.
- **Raw Source files** — Non-Markdown files (`.excalidraw.md`, `.html`, `.pdf`, `.png`, `.jpg`, `.canvas`) are Raw Sources, not wiki-layer notes.

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

## Batch Mode

- **Default**: 50 most recently modified notes
- **Full scan**: `--all` flag
- Report scope at start: "Scanning 50 most recent notes (use --all for full vault)."
