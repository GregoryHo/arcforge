# Audit: LINK / LINT / GROW

Read before running an audit. Invoke as `audit link`, `audit lint`, `audit grow`,
or bare for all three. Default scope is the 50 most recently modified notes;
`--all` scans everything. Report the scope before starting.

This file holds the **mechanical** primitives — the checks that work on any
Obsidian vault. Every threshold ("what is stale", "which tags are allowed", "how
many notes before a map-of-content is warranted") is declared per vault in
`SCHEMA.md`. Where the vault declares none, report the observation instead of
inventing a number.

## What to scan, what to skip

The auditor works on the **wiki layer**: typed Markdown notes with frontmatter,
as declared by the resolved vault's `SCHEMA.md`. Skip:

- **Plugin-managed folders.** Detect dynamically, don't hard-code:
  `obsidian eval code="app.plugins.plugins['<id>'].settings.scriptFolderPath"`.
  The Excalidraw plugin's script folder is the common case.
- **Raw Sources** (`.html`, `.pdf`, `.png`, `.jpg`, `.canvas`). Subject to the
  Source Drift check and to un-ingested detection, not to schema compliance.
- **Excalidraw drawings stored as `.md`** — identified by `excalidraw-plugin: parsed`
  in frontmatter. Skip in LINT, exclude from the index.
- **Folders the vault's AGENTS.md declares out of scope.**

## LINK — resolve relationships

The only sub-check that modifies existing notes.

1. Find notes whose `## Relationships` section is still plain text (no `[[`).
2. Search the vault for each mention on the active search route. A semantic route
   resolves mentions whose wording differs from the title ("Karpathy's wiki idea"
   → `LLM-Wiki-Mechanism`); a keyword-only route needs the exact/alias/partial
   cascade in `search-strategies.md`.
3. Replace resolved mentions with `[[wikilinks]]` and append
   `Referenced by: [[source note]]` to each target.
4. Update aggregator notes (map-of-content, Topic, Milestone, DailyAggregate — per
   the vault's SCHEMA.md) whose declared `scope:` or roll-up criteria now match.
5. Collect unresolved mentions and hand them to GROW as candidates.

Single-file mode — `audit link --file=<path>` — runs on one note only; ingest's
`--link` flag uses it.

## LINT — mechanical checks

**Verify before fix.** Every finding here is a hypothesis. Read the actual file
before acting on it.

### Schema compliance

Validate each note's frontmatter against the shape its `type:` declares in the
vault's SCHEMA.md. Obsidian accepts two equivalent list spellings and both are
valid:

```yaml
tags: [arcforge, tdd]     # inline
tags:                     # block
  - arcforge
  - tdd
```

A field with no inline value is **not** empty when the next lines are indented
`- ` items. Read the whole frontmatter block — this is the most common false
positive in the whole audit.

### Orphans, untyped notes, log consistency

- **Orphans** — notes with zero inbound and zero outbound links.
- **Untyped** — no `type:` field. Report; never auto-fix.
- **Log consistency** — `log.md` entries that name files which no longer exist,
  and notes whose `created:` predates any log entry for them.

### Source Drift (sha256)

For each Raw Source: re-hash the body bytes after the frontmatter (UTF-8, line
endings normalized to `\n`) per `raw-sources.md`; for remote URLs, re-fetch first
when fetchable. Then:

| Comparison | Action |
|---|---|
| New == stored | Fresh. No log line. |
| New ≠ stored | **Drift.** Append `drift \| <filename> \| sha=<old>→<new>` to `log.md` and report it. Informational only. |
| Stored is empty | **Unhashed.** Compute and write `sha256` + `ingested`. Offer `audit lint --backfill-sha256` for the rest. |

Drift never auto-fixes the wiki layer — a changed source is a fact for the user
to act on, not a licence to rewrite their note.

### EVOLVE — schema drift

Patterns in actual usage suggesting the vault's own schema should change. These
are observations, not errors; the user decides.

| Check | Pattern | Example |
|---|---|---|
| Field usage | A field 90%+ empty across a type, or an undeclared field in 80%+ of a type | "`source_author` empty in 90% of Source notes" |
| Type fit | Section structure that does not match the declared type | "12 Entity notes carry `## Steps` — a tutorial type?" |
| Tag drift | A tag used 10+ times that is not in the declared taxonomy | "`#distributed-systems` used 15× — formalize?" |

### Vault-declared LINT

After the primitives, apply the additional checks the vault's SCHEMA.md declares
and file them under their own named subsections in the report. Categories vaults
commonly declare: index size and split points, map-of-content triggers, log
rotation, tag taxonomy, entity-creation rules, note split-and-archive length,
synthesis citation minimums, staleness windows, and — for paper vaults —
citation-graph gaps, reading-status ageing, and claim consistency.

## GROW — gap analysis

GROW **proposes**. It never creates a note and never fetches a source; the user
approves, then ingest creates.

### Internal — suggest creating an artifact

The skill detects the clustering pattern; the vault declares which types play
leaf versus aggregator and at what count.

| Pattern | The skill detects | The vault declares |
|---|---|---|
| Leaves with no aggregator | A topic cluster of leaf-type notes with no roll-up note | Leaf type, aggregator type, threshold |
| Recurring mention with no note | The same plain-text mention across several notes, with no note for it | Which type absorbs mentions, threshold |
| Cluster with no index | A topic with N+ notes and no map-of-content | Index type, N |
| LINK failures | Mentions LINK could not resolve | (always reported) |

### External — suggest investigation

Thin coverage (a topic resting on 1–2 sources), a concept referenced across
several notes but never explored, open questions listed in the sections the
vault declares for them, and topics unmodified beyond the declared staleness
window.

### Un-ingested Raw Sources

Files with real content and no typed note pointing at them — detection table in
`raw-sources.md`. Runs only for vaults whose AGENTS.md declares
`raw_source: adopted`.

### Duplicate guard

Before proposing any new artifact, check for an 80%+ title match against
existing notes and drop the suggestion if one exists.

## The report

Every run writes a typed note to `<vault>/_audits/audit-YYYY-MM-DD-<scope>.md`
so a later session can cite it. The vault's SCHEMA.md may extend the type.

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
