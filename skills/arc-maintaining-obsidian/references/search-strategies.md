# Search Strategies

## Primary Search Tool: QMD

All vault search goes through `qmd query` first. QMD provides hybrid search (BM25 lexical + vector semantic + LLM reranking) that finds both exact keyword matches and conceptual/semantic matches.

### QMD Query Patterns

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

### Fallback: obsidian-cli search

Use `obsidian-cli search query=<text>` only when QMD is unavailable (not installed, index empty, or embeddings not generated). It provides keyword-only BM25 — no semantic matching, no reranking.

**Fallback equivalents by operation:**

| Operation | QMD (primary) | obsidian-cli (fallback) |
|---|---|---|
| Simple lookup | `qmd query "X" -c obsidian-vault` | `obsidian search query="X"` |
| Semantic / relational | `qmd query $'vec: how X relates to Y'` | `obsidian search query="X"` then `obsidian search query="Y"` — merge results manually |
| Broad search | `qmd query "X" -n 20` | `obsidian search query="X" limit=20` |
| File count | `qmd query "X" --files` | `obsidian search query="X" total` |
| Structured (lex+vec) | `qmd query $'lex: ...\nvec: ...'` | `obsidian search query="<lex terms>"` — semantic part is lost |
| Hypothetical (hyde) | `qmd query $'hyde: ...'` | Not possible — use multiple keyword searches with synonyms |
| Propagate (new note) | Structured lex+vec query | Run separate `obsidian search` per key concept, union results |
| LINK resolution | Single hybrid query per mention | `obsidian search query="<exact title>"`, then `obsidian search query="<partial>"` if no match |

**What you lose with fallback:** Semantic matches (notes about the same concept using different words), automatic query expansion, reranking by relevance. Compensate by running multiple keyword variations and manually prioritizing results.

## Query Mode: Search Strategy by Question Type

| Question Type | QMD Strategy |
|---|---|
| "What do I know about X?" | `qmd query "X"` — auto-expansion catches related terms. Check MOCs first for structured overviews |
| "How does X relate to Y?" | `qmd query $'vec: relationship between X and Y'` — semantic search finds connection notes even without exact terms |
| "What's the latest on X?" | `qmd query "X"` then sort results by `created:` date, check `log.md` for recent activity |
| "Summarize everything about X" | `qmd query "X" -n 20` — broad search. Start from MOC if one exists, expand to linked notes |
| "Do I have notes on X?" | `qmd query "X" --files` — quick count of matching files |
| "What's the evidence for X?" | `qmd query $'lex: claims evidence\nvec: X'` — combines keyword precision with semantic breadth |
| "What papers cite / are cited by X?" | Follow `cites:` and `cited_by:` fields in paper Source frontmatter |
| "What should I read next?" | `qmd query $'lex: reading_status: queued'` — find queued papers, prioritize by `cited_by` count |

### Result Prioritization

If search returns 20+ results, narrow by prioritizing:
1. MOCs and Syntheses (processed knowledge)
2. Entities (structured definitions)
3. Sources (raw material — lower priority unless user needs provenance)

### Provenance Tracing

For Synthesis notes, follow the `sources:` array to trace claims back to original sources when the user needs deeper evidence.

### Citation Graph Traversal (Papers)

For questions about academic topics, leverage the citation graph in addition to semantic search:

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

## Query Mode: Output Format Adaptation

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

## File Back Decision

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

## Ingest Mode: Propagate Search

After creating a new note, search the vault for related pages to update:

1. Extract key concepts from the new note (entities, topics, proper nouns)
2. Search vault via `qmd query` with a structured query combining key concepts:
   ```bash
   qmd query $'lex: <entity names, proper nouns>\nvec: <conceptual summary of the note>' -c obsidian-vault -n 15
   ```
   The semantic layer catches related notes that don't share exact keywords with the new note.
   **Fallback:** Run `obsidian search query="<concept>"` separately for each key concept, then union and deduplicate results.
3. Filter results to wiki-layer notes only (skip Raw Sources, audit reports)
4. Prioritize by type: Entity > Synthesis > MOC > Source
5. Cap at 10 results — update top 10 by relevance

## Audit Mode: LINK Search

When resolving plain-text mentions to wikilinks:

1. Extract the mention text (e.g., "Karpathy's LLM Wiki")
2. Search with `qmd query "<mention text>" -c obsidian-vault -n 5` — hybrid search handles exact matches, alias matches, and semantic near-matches in one pass
3. From QMD results, pick the best match by relevance score — don't create ambiguous links
4. If QMD returns no results or all results score below threshold, add to unresolved mentions list for GROW

QMD's semantic layer makes the old multi-step resolution (exact → alias → fuzzy) unnecessary — a single query catches all three match types.

**Fallback (obsidian-cli):** Without QMD, resolve mentions with the multi-step cascade:
1. `obsidian search query="<exact title>"` — exact match
2. If no match: `obsidian search query="<alias or abbreviation>"` — alias match
3. If no match: `obsidian search query="<partial key words>"` — fuzzy match
4. If multiple matches: pick best by context. If no match: add to unresolved list for GROW.
