---
name: arc-auditing-obsidian
description: Use when the user wants to check vault health, find missing links, detect orphan notes, identify knowledge gaps, or maintain their Obsidian knowledge graph. Trigger on mentions of vault audit, missing connections, orphan notes, wikilinks, knowledge graph maintenance, vault cleanup, or stale notes. Also trigger when the user says "check my notes," "what's missing," "link my notes," "audit my vault," or after bulk note creation in a session. Even if the user just says "clean up my vault" or "anything I should connect?" — this skill applies.
argument-hint: "[link|lint|grow] — or no argument to run all three"
---

# arc-auditing-obsidian

Wiki Lint Layer — maintain knowledge graph health through three operations: LINK, LINT, and GROW. Inspired by Karpathy's LLM Wiki "lint" concept — periodic health checks that keep a wiki compounding rather than decaying.

The core insight: wikis die from maintenance burden, not lack of content. This skill eliminates that burden by automating the tedious work — resolving links, checking consistency, finding gaps — so the vault keeps growing in value.

## Scope

The auditor operates on the **wiki layer** — plain Markdown notes (`.md`) that represent processed knowledge. It does not operate on Raw Sources directly.

### What to scan

- All `.md` files that are user-created knowledge artifacts

### What to skip

- **Plugin-managed folders** — Detect dynamically, not by hardcoded path. If the Excalidraw plugin is installed, read its script folder via `obsidian eval code="app.plugins.plugins['obsidian-excalidraw-plugin'].settings.scriptFolderPath"` and exclude that folder. Apply the same pattern for any plugin that stores non-note files in the vault.
- **Raw Source files** — Non-Markdown files (`.excalidraw.md`, `.html`, `.pdf`, `.png`, `.jpg`, `.canvas`) are Raw Sources, not wiki-layer notes. Their knowledge should be ingested into Source notes via `arc-writing-obsidian` before the auditor can work with it.

### GROW: Un-ingested Raw Sources

During GROW, detect non-Markdown files that have meaningful content but no corresponding Source note (no `.md` file with `source_url` pointing to the file).

| File Type | How to detect meaningful content |
|-----------|--------------------------------|
| `.excalidraw.md` | Has `## Text Elements` with text content |
| `.html` | File size > 1KB |
| `.pdf` | Exists in vault |
| `.png` / `.jpg` | Not inside a plugin-managed folder |

Suggest: "These files have content that hasn't been ingested into the wiki — consider running `arc-writing-obsidian` to create Source notes from them."

## Operations

### LINK — Resolve relationships into wikilinks

Scan notes that have plain-text relationship fields (created by `arc-writing-obsidian`) and wire them into the vault's knowledge graph.

1. Find notes with `## Relationships` sections containing plain text (no `[[` links)
2. For each relationship mention, search the vault using `obsidian-cli` for matching note titles and aliases
3. Replace plain text with `[[wikilinks]]` where matches are found
4. Add backlink references to target notes: append "Referenced by: `[[source note]]`" to the target's Relationships section
5. Update MOC notes when new notes match their declared scope

Only modify notes during LINK — never during LINT or GROW.

**Single-file mode:** When invoked with `link --file=<path>`, run LINK on only that one note instead of scanning the batch. This is used by `arc-writing-obsidian`'s `--link` flag for immediate post-creation linking. Same resolution logic, just scoped to one file.

**Example transformation:**
```
Before: Related to Karpathy's LLM Wiki concept
After:  Related to [[Karpathy's LLM Wiki]] concept
```

### LINT — Health check the knowledge graph

Scan the vault and report issues. LINT never modifies files — it only produces a report.

Check for:

| Check | What It Detects |
|-------|----------------|
| **Schema compliance** | Notes missing required frontmatter fields for their `type` |
| **Orphan detection** | Notes with zero inbound or outbound links |
| **Stale detection** | Source notes older than 30 days with no synthesis note referencing them |
| **Tag hygiene** | Unused tags, inconsistent naming (e.g., `#AI` vs `#ai`), missing tags |
| **Untyped notes** | Notes without a `type` field in frontmatter — report but never auto-fix |
| **Index freshness** | Auto-generate or update `index.md` in the vault root (see below) |
| **Log consistency** | Verify `log.md` entries reference existing vault files; flag gaps where notes exist without log entries |

#### index.md — Central Navigation

During every LINT pass, generate or update `index.md` in the vault root. This is the LLM's primary orientation file — it reads `index.md` first to find relevant pages before drilling into individual notes.

Format: organize by page type, one line per note with a wikilink and one-line summary.

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
```

Only include typed wiki-layer notes (skip Raw Sources, audit reports, and plugin-managed files). If a note has no `type` frontmatter, list it under an "Untyped" section at the bottom.

Do not attempt to detect contradictions automatically — that requires semantic understanding beyond reliable automation. Flag notes that discuss the same entity with different claims and let the user judge.

### GROW — Identify knowledge gaps and propose new artifacts

Analyze the vault structure and suggest artifacts that would strengthen the knowledge graph. GROW proposes — it never auto-creates.

| Pattern | Suggestion |
|---------|-----------|
| 5+ source notes reference a topic with no synthesis | "Consider a synthesis note connecting these sources" |
| 3+ notes mention an entity with no entity note | "Consider an entity note for [name]" |
| A topic area has 8+ notes with no MOC | "Consider a Map of Content for [topic]" |
| Source notes reference related entities that don't exist | "These entities appear in sources but have no notes: [list]" |
| **LINK failures** → unresolved plain-text mentions | "LINK couldn't resolve these mentions — consider creating entity notes: [list]" |

#### GROW from LINK Failures

When LINK runs before GROW (either in sequence or via full audit), collect all plain-text mentions that LINK could not resolve to a vault match. Pass these to GROW as high-confidence entity candidates — they represent concepts the user has written about but hasn't formalized into notes yet.

This creates a tight feedback loop: LINK → unresolved mentions → GROW suggestions → user approves → writer creates entity notes → next LINK pass resolves them.

Present suggestions as a ranked list — most impactful first. The user approves, then invokes `arc-writing-obsidian` to create.

## Invocation

| Command | Action |
|---------|--------|
| `/arc-auditing-obsidian link` | Run LINK on recent unlinked notes |
| `/arc-auditing-obsidian link --file=<path>` | Run LINK on a single note (used by writer's `--link` flag) |
| `/arc-auditing-obsidian lint` | Full vault health report |
| `/arc-auditing-obsidian grow` | Gap analysis + suggestions |
| `/arc-auditing-obsidian` (no args) | All three in sequence: LINK → LINT → GROW |

## Batch Mode

For vaults with many notes, operate in batches to avoid overwhelming context:

- **Default**: Process the 50 most recently modified notes
- **Full scan**: Pass `--all` to process the entire vault (e.g., `/arc-auditing-obsidian lint --all`)

Report batch scope at the start: "Scanning 50 most recent notes (use --all for full vault)."

## Audit Report Format

Output an audit report as a note in the vault:

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

## GROW Suggestions
1. [highest impact suggestion]
2. [next suggestion]
...
```

## Delegation

Use kepano's obsidian skills for vault operations:

- Vault search, backlinks, tags → invoke `/obsidian:obsidian-cli`
- Note formatting when modifying → invoke `/obsidian:obsidian-markdown`

## Error Handling

- If `obsidian-cli` is unavailable (Obsidian not running), report the error clearly — do not silently skip operations
- If a note has no `type` frontmatter, include it in the LINT report as "untyped" — never auto-add a type
- If GROW detects potential duplicates (80%+ title match with existing note), skip the suggestion

## Vault Path

Same as `arc-writing-obsidian` — check obsidian-cli first, then ask user, store for session.

## Completion Format

```
✅ Audit complete → [vault-path/audit-YYYY-MM-DD.md]
- LINK: resolved N relationships
- LINT: found N issues
- GROW: N suggestions
```

## Blocked Format

```
⚠️ Audit blocked
Issue: [what went wrong — e.g., Obsidian not running, vault path unknown]
To resolve: [specific action needed]
```
