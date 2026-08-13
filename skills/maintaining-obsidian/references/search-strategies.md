# Search Strategies

All three modes search: query directly, ingest at Propagate, audit at LINK. Read
this on the first search of a session to pick a route, then again for output
adaptation when answering.

## Route selection

Decide once per session; the route holds until the user changes the registry.

1. If the registry entry has `search.qmd_collection` set, run `qmd status`.
2. QMD installed, collection present, files indexed → **QMD route**.
3. Else Obsidian running and `obsidian-cli search` works for this vault →
   **Obsidian runtime route**.
4. Else → **filesystem route**.

Filesystem is the contractual baseline: ordinary vault maintenance must work with
QMD off and Obsidian closed. The other two are acceleration. Warn about a missing
QMD only when the user expected semantic search — *"QMD is not configured, so this
is keyword search; semantic matching and reranking are unavailable until you
enable it."*

## What each route can do

| Capability | QMD | Obsidian runtime | Filesystem |
|---|---|---|---|
| Keyword matching | Yes | Yes | Yes |
| Semantic matching | Yes | No | No |
| Query expansion | Yes | No | Manual only |
| Reranking | Yes | No | No |
| Single-query LINK resolution | Yes | No | No |
| Structured `lex:` + `vec:` queries | Yes | No | No |
| Works with Obsidian closed | Yes | No | Yes |
| Needs an index refresh after writes | Yes | No | No |

## The three search tasks, per route

### Answering a question (query mode)

| Question shape | QMD | Keyword routes (Obsidian / filesystem) |
|---|---|---|
| "What do I know about X?" | `qmd query "X"` — auto-expansion catches related terms | Search X across filenames, aliases, tags, headings, body. Read `index.md` first if present |
| "How does X relate to Y?" | `qmd query $'vec: relationship between X and Y'` finds connection notes without exact terms | Search X, search Y, then read the overlap and any map-of-content or synthesis notes |
| "Summarize everything about X" | `qmd query "X" -n 20` | Search X, then expand through wikilinks and `sources:` from the strongest hits |
| "What's the latest on X?" | `qmd query "X"`, sort by `created:`, check `log.md` | Same, minus expansion |
| "Do I have notes on X?" | `qmd query "X" --files` | Count matching files, list the most relevant titles |
| "What's the evidence for X?" | `qmd query $'lex: claims evidence\nvec: X'` | Search claim/evidence wording plus X, merge manually |
| "What cites / is cited by X?" | Follow `cites:` / `cited_by:` frontmatter | Identical — the citation graph is frontmatter, not search |

On a keyword-only route, compensate for the missing semantic layer by running
several narrow searches with synonyms and merging, rather than one broad query.

### Propagate (ingest mode)

1. Extract the new note's key concepts — entities, topics, proper nouns.
2. Search. QMD does it in one structured call:
   ```bash
   qmd query $'lex: <entity names, proper nouns>\nvec: <conceptual summary of the note>' -c obsidian-vault -n 15
   ```
   Keyword routes: one search per concept, then union and deduplicate.
3. Filter to wiki-layer notes — drop Raw Sources and audit reports.
4. Prioritize by the roles the vault's SCHEMA.md declares (processed knowledge
   before raw material).
5. Cap at 10. The rest are audit's problem.

### LINK resolution (audit mode)

QMD resolves a mention in one pass: `qmd query "<mention text>" -c obsidian-vault -n 5`,
then pick the best-scoring match. Its semantic layer collapses what keyword
routes need three steps for — do **not** create an ambiguous link to clear a
mention.

Keyword routes cascade: exact title → alias or abbreviation → partial key words.
Ambiguous after all three, or nothing above threshold: leave it unresolved and
report it to GROW. Never create a stub.

## QMD query syntax

```bash
# Simple — auto-expands keywords, searches lexically and semantically
qmd query "machine learning optimization" -c obsidian-vault

# Structured — control lexical and semantic independently
qmd query $'lex: Docker container security\nvec: how to secure containerized applications' -c obsidian-vault

# Phrase search with negation
qmd query $'lex: "exact phrase" topic -exclude_this' -c obsidian-vault

# Hypothetical document embedding — "what would an answer look like?"
qmd query $'hyde: A note explaining the tradeoffs between consistency and availability' -c obsidian-vault
```

Flags: `-c <collection>` (always scope to the vault), `-n <num>` (default 5; 10–20
for broad searches), `--full` (whole documents instead of snippets), `--json`,
`--line-numbers`.

## Index sync (QMD route only)

```bash
qmd update -c obsidian-vault && qmd embed
```

Both are incremental — change detection is by content hash, so cost tracks what
changed, not vault size (typically ~3s for a few files). `update` refreshes
keyword searchability; `embed` refreshes semantic searchability.

Sync after each ingest completes, after audit LINK (it modifies notes), and once
at the end of a batch rather than per note. Skip `embed` when the next step only
needs keyword matches. **Without a sync, notes just created are invisible to
QMD** — which bites hardest on consecutive ingests, where the second ingest's
Propagate cannot see the first's output.

The other two routes need no sync; both read current files.

## Shared strategies

### Narrowing 20+ results

Prefer processed knowledge over raw material: maps-of-content and syntheses
first, then entities, then sources — sources only when the user needs
provenance. (Substitute the vault's own type names.)

### Provenance and citation graphs

Follow a synthesis note's `sources:` array back to originals when the user needs
the evidence itself. For academic vaults, the graph is a second axis alongside
search: `cites:` answers "what is this built on", `cited_by:` answers "who uses
this", and papers sharing 3+ citations usually belong to one research thread —
group them in the answer.

### Claim-aware synthesis

On contested topics, report the landscape rather than citing one note: how many
notes support versus contest each claim, weighted by declared evidence strength,
with conditional claims kept conditional and superseded claims marked as such.
Format: *"4 notes support [claim] (3 strong, 1 moderate); 1 contests it on
[condition] (moderate)."*

### Output format

| Question style | Output |
|---|---|
| Explanation ("what is X?") | Prose with inline `[[citations]]` |
| Comparison ("X vs Y?") | Table with cited cells |
| Timeline ("what happened with X?") | Chronological list by `created:` |
| Overview ("summarize X") | Structured summary linking to deeper notes |
| Presentation | Marp slide deck — only on explicit request |
| Spatial ("as a mind map") | Canvas file via `obsidian:json-canvas` — only on explicit request |

Default is always Markdown prose. Every key claim names the note it came from:

```
According to [[Docker Setup Notes]], the team standardized on Docker Compose for
local development. [[Deployment Architecture]] adds that production uses
Kubernetes with Helm charts.
```

### File-back decision

Suggest filing the answer back when it is a comparison or analysis, when it
discovers a connection the notes did not already link, or when it synthesizes 3+
notes into something new. Do not suggest it for a single-note lookup, a count, or
when a synthesis covering the ground already exists. State the decision either
way.
