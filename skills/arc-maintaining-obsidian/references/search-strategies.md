# Search Strategies

Search is used by all three modes (query, ingest propagate, audit LINK). The skill supports two search backends — select the route once per session, then follow that route's section for all operations.

## Route Selection

On first search operation, determine which backend to use:

1. Run `qmd status`
2. If QMD reports collections with indexed files → **QMD Route**
3. If QMD is not installed, reports 0 documents, or has no collections → **Fallback Route**

When using fallback, warn once: *"QMD not available — search quality will be reduced (keyword-only, no semantic matching). Run `qmd collection add <vault-path> --name obsidian-vault && qmd embed` to enable hybrid search."*

The route stays the same for the entire session. Don't re-check between operations.

---

## QMD Route

QMD provides hybrid search: BM25 lexical + vector semantic + LLM reranking. A single query finds both exact keyword matches and conceptually related notes using different words.

### Query Syntax

```bash
# Simple query — auto-expands keywords, searches both lexically and semantically
qmd query "machine learning optimization" -c obsidian-vault

# Structured query — control lexical vs semantic independently
qmd query $'lex: Docker container security\nvec: how to secure containerized applications' -c obsidian-vault

# Phrase search with negation
qmd query $'lex: "exact phrase" topic -exclude_this' -c obsidian-vault

# Hypothetical document embedding (great for "what would an answer look like?")
qmd query $'hyde: A note explaining the tradeoffs between consistency and availability in distributed systems' -c obsidian-vault
```

**Key flags:**
- `-c obsidian-vault` — Always scope to the vault collection
- `-n <num>` — Max results (default 5, use 10-20 for broad searches)
- `--full` — Return full document content instead of snippets
- `--json` — Machine-readable output for programmatic use
- `--line-numbers` — Include line numbers for precise references

### Query Mode

| Question Type | Strategy |
|---|---|
| "What do I know about X?" | `qmd query "X"` — auto-expansion catches related terms. Check MOCs first for structured overviews |
| "How does X relate to Y?" | `qmd query $'vec: relationship between X and Y'` — semantic search finds connection notes even without exact terms |
| "What's the latest on X?" | `qmd query "X"` then sort results by `created:` date, check `log.md` for recent activity |
| "Summarize everything about X" | `qmd query "X" -n 20` — broad search. Start from MOC if one exists, expand to linked notes |
| "Do I have notes on X?" | `qmd query "X" --files` — quick count of matching files |
| "What's the evidence for X?" | `qmd query $'lex: claims evidence\nvec: X'` — combines keyword precision with semantic breadth |
| "What papers cite / are cited by X?" | Follow `cites:` and `cited_by:` fields in paper Source frontmatter |
| "What should I read next?" | `qmd query $'lex: reading_status: queued'` — find queued papers, prioritize by `cited_by` count |

### Propagate Search (Ingest Mode)

After creating a new note, search the vault for related pages to update:

1. Extract key concepts from the new note (entities, topics, proper nouns)
2. Search with a structured query combining key concepts:
   ```bash
   qmd query $'lex: <entity names, proper nouns>\nvec: <conceptual summary of the note>' -c obsidian-vault -n 15
   ```
   The semantic layer catches related notes that don't share exact keywords with the new note.
3. Filter results to wiki-layer notes only (skip Raw Sources, audit reports)
4. Prioritize by type: Entity > Synthesis > MOC > Source
5. Cap at 10 results — update top 10 by relevance

### LINK Resolution (Audit Mode)

When resolving plain-text mentions to wikilinks:

1. Extract the mention text (e.g., "Karpathy's LLM Wiki")
2. Search: `qmd query "<mention text>" -c obsidian-vault -n 5` — hybrid search handles exact matches, alias matches, and semantic near-matches in one pass
3. From results, pick the best match by relevance score — don't create ambiguous links
4. If no results or all results score below threshold, add to unresolved mentions list for GROW

QMD's semantic layer makes the old multi-step resolution (exact → alias → fuzzy) unnecessary — a single query catches all three match types.

### Index Sync

After creating or modifying vault notes, keep the QMD index current so subsequent search operations find the new content:

```bash
qmd update -c obsidian-vault && qmd embed
```

Both commands are incremental — they detect changes via content hashing, so the cost is proportional to what changed, not vault size. Typical overhead: ~3 seconds for a few changed files.

- `update` re-indexes changed files into BM25 (keyword searchability)
- `embed` generates vector embeddings for changed files (semantic searchability)

**When to sync:**
- After each ingest cycle completes (post-Log, before the next operation)
- After audit LINK completes (LINK modifies existing notes)
- In batch mode: once at the end, not per-note
- Skip `embed` if you only need keyword matches for the immediate next step

Without sync, newly created notes are invisible to QMD until the next manual update. This matters most for consecutive ingests — the second ingest's Propagate step won't find the first ingest's notes.

---

## Fallback Route: obsidian-cli

When QMD is unavailable, use `obsidian-cli search` for all search operations. This provides keyword-only BM25 matching — no semantic search, no query expansion, no reranking.

### Query Mode

Run `obsidian-cli search query="<text>"` for each question. Without semantic matching, compensate by running multiple keyword variations and manually merging results.

| Question Type | Strategy |
|---|---|
| "What do I know about X?" | `obsidian search query="X"` — keyword match only |
| "How does X relate to Y?" | `obsidian search query="X"` then `obsidian search query="Y"` — merge results manually |
| "Summarize everything about X" | `obsidian search query="X" limit=20` |
| "Do I have notes on X?" | `obsidian search query="X" total` — count matches |
| "What papers cite / are cited by X?" | Follow `cites:` and `cited_by:` fields directly (same as QMD route) |

### Propagate Search (Ingest Mode)

1. Extract key concepts from the new note
2. Run `obsidian search query="<concept>"` separately for each key concept
3. Union and deduplicate results
4. Filter and prioritize same as QMD route (Entity > Synthesis > MOC > Source)
5. Cap at 10 results

The main loss: notes that discuss the same concept using different words won't be found. Compensate by trying synonyms and related terms as additional searches.

### LINK Resolution (Audit Mode)

Without QMD's semantic layer, resolve mentions with a multi-step cascade:

1. `obsidian search query="<exact title>"` — exact match
2. If no match: `obsidian search query="<alias or abbreviation>"` — alias match
3. If no match: `obsidian search query="<partial key words>"` — fuzzy match
4. If multiple matches: pick best by context. If no match: add to unresolved list for GROW.

### Index Sync

No sync needed — `obsidian-cli search` reads the vault filesystem directly and always reflects the current state.

### What You Lose

| Capability | QMD | Fallback |
|---|---|---|
| Keyword matching (BM25) | Yes | Yes |
| Semantic matching (vector) | Yes | No |
| Query expansion | Yes | No |
| LLM reranking | Yes | No |
| Single-query LINK resolution | Yes | No (multi-step cascade) |
| Structured queries (lex+vec) | Yes | No |
| Hypothetical doc search (hyde) | Yes | No |

---

## Shared Strategies

These apply regardless of which search route is active.

### Result Prioritization

If search returns 20+ results, narrow by prioritizing:
1. MOCs and Syntheses (processed knowledge)
2. Entities (structured definitions)
3. Sources (raw material — lower priority unless user needs provenance)

### Provenance Tracing

For Synthesis notes, follow the `sources:` array to trace claims back to original sources when the user needs deeper evidence.

### Citation Graph Traversal (Papers)

For questions about academic topics, leverage the citation graph in addition to search:

1. **Forward citations** (`cites:`) — "What is this paper built on?" Follow `cites:` to find foundational papers
2. **Backward citations** (`cited_by:`) — "Who uses this paper's work?" Follow `cited_by:` to find downstream applications
3. **Citation clustering** — Papers that share 3+ citations likely belong to the same research thread — group them in answers

### Claim-Aware Synthesis (Papers)

When answering questions about contested topics, don't just cite notes — report the claim landscape:

- Count how many papers support vs. contest each relevant claim
- Weight by evidence strength (strong > moderate > weak)
- Note conditional claims: "X holds for Y but not Z"
- Surface `superseded` claims explicitly: "Earlier work claimed X, but this has been superseded by Y"

Format: *"4 papers support [claim] (3 strong, 1 moderate). 1 paper contests it on [specific condition] (moderate evidence)."*

### Output Format Adaptation

| Question Style | Output Format |
|---|---|
| Explanation ("what is X?") | Markdown prose with inline [[citations]] |
| Comparison ("X vs Y?") | Table with cited cells |
| Timeline ("what happened with X?") | Chronological list using `created:` dates |
| Overview ("summarize X") | Structured summary with links to deeper notes |
| Presentation ("make a presentation about X") | Marp slide deck — delegate to Marp plugin |
| Spatial ("show me as a mind map") | Canvas file — delegate to `json-canvas` |

Marp and Canvas are triggered only by explicit user request. Default is always markdown prose.

### Inline Citation Format

Every key claim references the wiki page it came from:

```
According to [[Docker Setup Notes]], the team standardized on Docker Compose
for local development. [[Deployment Architecture]] adds that production uses
Kubernetes with Helm charts.
```

### File Back Decision

After synthesizing an answer, decide whether to suggest filing back:

**Suggest file back when:**
- Answer is a comparison or analysis
- Answer discovers a connection between notes not previously linked
- Answer synthesizes information from 3+ notes into a new insight

**Don't suggest file back when:**
- Simple factual lookup from a single note
- Quick count or list ("how many notes about X?")
- A Synthesis note covering this already exists

Always state the decision: either suggest filing back, or briefly explain why not.
