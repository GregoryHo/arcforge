# Audit Checks (mechanism)

The skill ships only the **mechanical** audit primitives that work on any
Obsidian vault. Domain choices — what's stale, which tags are allowed,
which thresholds trigger Internal/External GROW suggestions, how big the
log can grow before rotation — are declared per vault in `AGENTS.md` and
applied at runtime via "Vault-Declared LINT" at the bottom. The skill
never invents thresholds the vault hasn't declared.

## Scope

The auditor operates on the **wiki layer** — typed Markdown notes with
frontmatter. Raw Sources are subjected only to the Source Drift Check.

### What to scan
- All `.md` files declared as wiki-layer types by the resolved vault's
  AGENTS.md `## Schema` (or its sibling SCHEMA.md when split).

### What to skip
- **Plugin-managed folders** — Detect dynamically via
  `obsidian eval code="app.plugins.plugins['<id>'].settings.scriptFolderPath"`
  and exclude. Excalidraw plugin is the common case.
- **Raw Source files** — Non-Markdown (`.excalidraw.md`, `.html`, `.pdf`,
  `.png`, `.jpg`, `.canvas`). Subject to Source Drift Check (LINT) and
  Un-ingested detection (GROW), not schema compliance.
- **Excalidraw drawings stored as `.md`** — Detect by `excalidraw-plugin: parsed`
  in frontmatter. Skip in LINT, exclude from index.
- **Folders the vault AGENTS.md declares out of scope** — read AGENTS.md
  for the exclusion list.

## LINK — Relationship Resolution (mechanism)

- Find notes with plain-text `## Relationships` sections (no `[[` links).
- For each mention, search vault using `qmd query` — semantic match
  resolves mentions even when titles don't match (e.g., "Karpathy's wiki
  idea" → matches "LLM-Wiki-Mechanism").
- Replace plain text with `[[wikilinks]]` where matches are found.
- Add backlink references to target notes: append "Referenced by:
  `[[source note]]`".
- Update aggregator notes (e.g., MOC / Topic / Milestone / DailyAggregate, per vault SCHEMA.md) when new notes match their declared `scope:` or roll-up criteria.
- Collect unresolved mentions → pass to GROW as entity candidates.
- Single-file mode: `link --file=<path>` runs LINK on one note only.

## LINT — Mechanical Checks

### Schema Compliance

Validate each note's frontmatter against the type's frontmatter declared
by the vault's AGENTS.md `## Schema` (or its SCHEMA.md sibling). The skill
loaded the schema at Domain Contract Orientation; cross-check each `type:`
field against its declared shape.

**YAML format caution:** Obsidian uses two equivalent list formats. Both
are valid — check for both before reporting "missing" or "empty":

```yaml
# Inline
tags: [arcforge, tdd]

# Block (multi-line, indented)
tags:
  - arcforge
  - tdd
```

A field with no inline value is NOT empty if the next lines are indented
`  - ` items. Read the full frontmatter block.

### Orphan Detection
- Notes with zero inbound or outbound links.

### Untyped Notes
- Notes without a `type` field. Report under "Untyped"; never auto-fix.

### Log Consistency
- Verify `log.md` entries reference existing vault files.
- For notes with `created:` newer than their first `log.md` entry, flag
  missing log entries.

### Source Drift Check (uses sha256)

For each Raw Source:

1. **Local raw files (no URL):** re-hash the body bytes (after frontmatter,
   UTF-8, line endings normalized to `\n`) per `references/page-templates.md`.
2. **Remote URLs:** if fetchable, re-fetch and compute body sha256.
3. Compare to stored `sha256`:

| State | Action |
|---|---|
| New == stored | Fresh. No log line. |
| New ≠ stored | **Drift.** Append `drift | <filename> | sha=<old>→<new>` to log.md. Report under "Source Drift". Informational. |
| Stored is empty | **Unhashed.** Compute and write sha256 + `ingested`. Offer batch backfill via `audit lint --backfill-sha256`. |

Drift never auto-fixes the wiki layer.

### EVOLVE Pattern Detection

Detect schema drift — patterns in actual usage suggesting the vault's
declared schema should evolve:

| Check | Pattern Detected | Example |
|---|---|---|
| **Field usage analysis** | Fields 90%+ empty across a type, or extra fields appearing in 80%+ of a type | "`source_author` empty in 90% of Source notes" |
| **Type fit analysis** | Section structure doesn't match declared type | "12 Entity notes have `## Steps` — tutorial pattern?" |
| **Tag drift** | Tags used 10+ times not in vault's tag taxonomy | "#distributed-systems used 15× — formalize?" |

Observations, not errors. The user decides whether to evolve schema /
taxonomy.

## GROW — Pattern Detection (mechanism)

The mechanical patterns the skill detects. **All thresholds are
vault-declared in AGENTS.md `## Audit Thresholds`** — the skill never
invents numbers.

### Internal Patterns (suggest creating an artifact)

The skill detects clustering / coverage patterns; the vault declares
which note types play "leaf" vs "aggregator" roles, and what threshold
triggers a suggestion. Examples in the table use generic phrasing — the
preset's AGENTS.md maps these to its types (LLM-Wiki: Source/Synthesis,
news: Article/DailyAggregate, project-tracker: Task/Milestone, etc.).

| Pattern | Skill detects | Vault declares |
|---|---|---|
| Leaves without aggregator | Topic clusters of leaf-type notes lacking a roll-up note | Leaf type, aggregator type, threshold count |
| Recurring mentions without dedicated note | Plain-text mentions repeated across notes with no note for that mention | Mention-handling note type (Entity / Topic / etc.), threshold count |
| Note clusters without index/MOC | Topics with N+ notes lacking a map-of-content | Index type, threshold N |
| LINK failures | Unresolved plain-text mentions from LINK | (always reports) |

### External Patterns (suggest external research / investigation)

| Pattern | Skill detects | Vault declares |
|---|---|---|
| Thin coverage | Topics with 1-2 sources — suggest search terms to investigate | (informational) |
| Concept referenced but unexplored | Names appearing in N sources, no dedicated note | (informational) |
| Open questions | Listed in `## Open Questions` sections (per vault SCHEMA.md) | (informational) |
| Stale topics | Modified > N days ago | Threshold N |

### Un-ingested Raw Sources

During GROW, detect non-Markdown files with content but no corresponding
Source note (per `references/page-templates.md` "Detecting Un-ingested
Raw Sources").

### Duplicate Detection

Before suggesting a new artifact, check 80%+ title match with existing
notes. Skip the suggestion if a near-match exists.

## Vault-Declared LINT (extensibility)

The audit pipeline reads vault `AGENTS.md` at Domain Contract Orientation
and applies the additional checks declared there in addition to the
mechanical primitives above. The skill never invents thresholds the vault
hasn't declared.

Common categories a vault may declare:

| Category | Examples |
|---|---|
| Index size / split | "any `index.md` section > 50 → group", "total > 500 → per-type files" |
| MOC trigger | "total typed notes > 200 → suggest MOC" |
| Log rotation | "log.md > 500 entries → rotate to `log-YYYY.md`" |
| Tag taxonomy | "unknown top-level → flag", "near-duplicates → flag" |
| Entity creation | "central / 3+ refs / explicit only" |
| Split & archive | "notes > 200-250 lines → split candidate" |
| Synthesis citation | "3+ sources → inline `[[wikilink]]` cite required" |
| Stale detection | "Source notes > 30 days without synthesis" |
| Citation graph (papers) | "high-impact missing paper appears in 3+ vault `cites:`" |
| Reading status (papers) | "queued >14d", "skimmed >30d" |
| Claim consistency (papers) | "uncontested conflict", "evidence asymmetry" |

Honoring vault-declared LINT means: read the vault AGENTS.md sections,
apply the rules, include findings in the audit report under appropriately
named subsections.

## Batch Mode

- **Default**: 50 most recently modified notes.
- **Full scan**: `--all` flag.
- Report scope at start: "Scanning 50 most recent notes (use `--all` for
  full vault)."
