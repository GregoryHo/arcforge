# Search Strategies

## Query Mode: Search Strategy by Question Type

| Question Type | Strategy |
|---|---|
| "What do I know about X?" | Keyword search, check MOCs first for structured overviews |
| "How does X relate to Y?" | Search both terms, follow `## Relationships` sections in results |
| "What's the latest on X?" | Search + sort by `created:` date, check `log.md` for recent activity |
| "Summarize everything about X" | Start from MOC if one exists, expand to linked notes |
| "Do I have notes on X?" | Quick search, report count and types found |
| "What's the evidence for X?" | Search Claims sections across paper Sources, trace evidence strength |
| "What papers cite / are cited by X?" | Follow `cites:` and `cited_by:` fields in paper Source frontmatter |
| "What should I read next?" | Check `reading_status: queued` papers, prioritize by `cited_by` count |

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
2. Search vault for each concept via `obsidian-cli search`
3. Filter results to wiki-layer notes only (skip Raw Sources, audit reports)
4. Prioritize by type: Entity > Synthesis > MOC > Source
5. Cap at 10 results — update top 10 by relevance

## Audit Mode: LINK Search

When resolving plain-text mentions to wikilinks:

1. Extract the mention text (e.g., "Karpathy's LLM Wiki")
2. Search vault by exact title match first
3. If no exact match, search by aliases
4. If no alias match, try partial/fuzzy match (e.g., "LLM Wiki" matching "Karpathy-LLM-Wiki-Mechanism")
5. If multiple matches, pick the best match by relevance — don't create ambiguous links
6. If no match found, add to unresolved mentions list for GROW
