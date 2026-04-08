# arc-maintaining-obsidian Design

## Vision

Merge three Obsidian skills (arc-writing-obsidian, arc-querying-obsidian, arc-auditing-obsidian) into a single skill with three modes. This closes the six remaining gaps between arcforge's implementation and Karpathy's LLM Wiki pattern — most critically, cross-page update on ingest.

The core insight: Karpathy's model is ONE agent doing ingest, query, and lint. The three-skill split was arcforge's addition — and it's what causes the biggest gap (writer can't update existing pages because it has no vault awareness). Merging eliminates this by design.

Target model: Opus 4.6 / 1M context. The combined skill (~4,400 words with references) is ~6K tokens — trivial for this model class.

## Architecture Decision

### Merge Three Skills → One Skill, Three Modes

**Before (three skills, coordination overhead):**
```
arc-writing-obsidian  → creates ONE note, zero vault awareness
arc-querying-obsidian → reads vault, hands off file-back to writer
arc-auditing-obsidian → full vault awareness, links/lints/grows
```

**After (one skill, shared vault awareness):**
```
arc-maintaining-obsidian
├── ingest mode  → creates note + PROPAGATES to related pages
├── query mode   → searches vault + files back (no handoff needed)
├── audit mode   → LINK + LINT (with EVOLVE checks) + GROW (outward)
```

**What stays separate:** `arc-diagramming-obsidian` — Excalidraw JSON generation is a genuinely different domain. Remains a delegation target for Tier 3 artifacts.

### Why Merge (Not Enhance or Add New Skills)

1. Karpathy's design is one agent — the split was our addition, not his
2. The split causes Gap 1 — writer can't update existing pages without vault awareness
3. Opus 4.6 / 1M context handles a unified skill easily
4. Eliminates coordination overhead (--link flags, "After This Skill" handoffs, skill-to-skill delegation)
5. Closes Gaps 1, 2, 3, 5 automatically through shared context

### File Structure

```
skills/
  arc-maintaining-obsidian/
    SKILL.md                    (main — <2500w)
    references/
      page-templates.md         (6 page type schemas — from writer)
      audit-checks.md           (LINT checks, GROW thresholds — from auditor)
      search-strategies.md      (query patterns, output formats — from querier)
  arc-diagramming-obsidian/     (unchanged)
```

## Mode: Ingest (Closes Gaps 1 + 2)

### Pipeline

```
Classify → Confirm → Create → PROPAGATE → Log
```

Classify, Confirm, Create, and Log are unchanged from arc-writing-obsidian. The new step is PROPAGATE.

### PROPAGATE — Cross-Page Update

After creating the new note, fan out to update related pages:

1. **Search** — Search vault for pages related to the new note's concepts
2. **Match** — Filter by type to determine update action:

| Existing Page Type | Update Action |
|---|---|
| Entity | Add new properties or relationships from the source |
| Synthesis | Add new supporting/contradicting evidence |
| MOC | Add the new note if it matches MOC scope |
| Source | Cross-reference if both discuss same topic |

3. **Propose** — Present all proposed updates in a single summary: "This source would update 3 existing pages: [[Docker]] (new security properties), [[Container Security]] (new evidence), [[DevOps MOC]] (add to index). Apply?"
4. **Apply** — User approves (all, some, or none) → apply approved updates

**Scope guard:** Cap at 10 pages per ingest. If more than 10 related, update top 10 by relevance, report remainder.

### Contradiction Detection (Gap 2)

During PROPAGATE step 2, compare new source claims against existing page content. Flag conflicts:

"⚠️ Conflict: new source says X, [[Entity]] says Y — update, keep existing, or note both?"

This is proactive (at ingest time) rather than reactive (waiting for audit).

### Retained Features

All existing writer features carry over unchanged:
- Six page types (Source, Entity, Synthesis, MOC, Decision, Log)
- Fast path (skip Confirm when unambiguous)
- Query-as-Ingest ("file this back" → skip Classify)
- Batch mode (--batch)
- LINK-on-Create (--link, now triggers audit mode LINK internally)
- Raw Source Ingest (Excalidraw, PDF, HTML, images, URLs)
- Three artifact tiers (Markdown, Canvas, Excalidraw)
- Session log dual-write (log.md + daily notes)

## Mode: Query (Closes Gap 3)

### Pipeline

```
Orient → Search → Read → Synthesize → (File Back)
```

Unchanged from arc-querying-obsidian, with two enhancements:

### Enhancement 1: Seamless File Back

Previously delegated to arc-writing-obsidian via Query-as-Ingest. Now triggers ingest mode internally — same skill, same context, no handoff:

```
query: Synthesize → user says "file this back"
   ↓
ingest: skip Classify → Create Synthesis → PROPAGATE
```

### Enhancement 2: Output Format Diversity (Gap 3)

Two additional output formats:

| Question Style | Output Format |
|---|---|
| Explanation | Markdown prose with citations (existing) |
| Comparison | Table with cited cells (existing) |
| Timeline | Chronological list (existing) |
| Overview | Structured summary (existing) |
| Presentation | Marp slide deck — delegate to Marp plugin (new) |
| Spatial/relational | Canvas file — delegate to json-canvas (new) |

Marp and Canvas triggered only by explicit user request. Default remains markdown.

Not adding matplotlib/charts — not Obsidian-native, would require external dependencies. YAGNI.

### Retained Features

All existing querier features carry over:
- Orient via index.md
- obsidian-cli search
- Inline [[citations]]
- Vault-only answers (never fall back to general knowledge)
- Adaptive output format
- Session log append

## Mode: Audit (Closes Gap 4, partially Gap 5)

### Pipeline

```
LINK → LINT → GROW
```

### LINK — Unchanged

Resolves plain-text relationships into wikilinks. Single-file mode (`link --file=<path>`) retained.

### LINT — Enhanced with EVOLVE Checks (Gap 5)

All existing checks retained. Three new checks integrated into LINT (not a separate mechanism):

| Check | What It Detects |
|---|---|
| Field usage analysis | Fields that are 90%+ empty, or extra fields appearing in 80%+ of a type |
| Type fit analysis | Notes whose structure doesn't match their declared type |
| Tag drift | Actual tag usage vs. schema expectations |

Results appear in the existing Schema Issues section of the audit report. Not a separate EVOLVE section — just LINT being smarter about what it checks.

Schema co-evolution happens naturally: user sees the data, discusses changes in conversation, LLM updates `references/page-templates.md`.

### GROW — Enhanced with Outward Suggestions (Gap 4)

Existing inward suggestions retained. New outward suggestions:

| Pattern | Suggestion Type |
|---|---|
| Topic has 1-2 sources only | "Thin coverage — search terms: [list]" |
| Concept in sources but no dedicated note or external source | "Worth investigating?" |
| Synthesis has open questions | "These questions might be answerable: [list]" |
| Stale sources (>90 days) | "May have new developments: [list]" |

GROW never auto-fetches external content. User decides whether to investigate.

Audit report gains new subsections:

```markdown
## GROW Suggestions
### Internal (create these artifacts)
1. [ranked by impact]

### External (investigate these topics)
1. [search terms + reasoning]

### Open Questions (from existing notes)
1. [question + source note]
```

### Retained Features

All existing auditor features carry over:
- LINK with backlinks and MOC updates
- LINT schema compliance, orphans, staleness, tag hygiene
- GROW quantitative thresholds (5+ sources, 3+ mentions, 8+ notes)
- GROW from LINK failures
- Batch mode (50 recent default, --all for full vault)
- Audit report as typed vault note
- index.md auto-generation
- log.md consistency validation

## Gap 6: Advanced Search — Deferred

Current: obsidian-cli search (keyword-based). Sufficient for vaults under ~200 notes.

Future upgrade path: qmd (by Tobi Lütke) — local BM25/vector/LLM-reranking hybrid search. Recommended by Karpathy. Available as CLI and MCP server. Install: `npm install -g @tobilu/qmd`.

Not building now — YAGNI. When search results become noisy at scale, the skill's search commands can be swapped to qmd. No architectural change needed.

## Migration

### Delete

| Path | Reason |
|---|---|
| `skills/arc-writing-obsidian/` | Merged into ingest mode |
| `skills/arc-querying-obsidian/` | Merged into query mode |
| `skills/arc-auditing-obsidian/` | Merged into audit mode |
| `tests/skills/test_skill_arc_writing_obsidian.py` | Replaced |
| `tests/skills/test_skill_arc_querying_obsidian.py` | Replaced |
| `tests/skills/test_skill_arc_auditing_obsidian.py` | Replaced |

### Update

| Path | Change |
|---|---|
| `arc-using` routing table | 3 entries → 1 entry with mode hints |
| `arc-diagramming-obsidian` | Delegation reference: writer → `arc-maintaining-obsidian ingest` |
| Vault: [[Obsidian-Skills-Mechanism]] | Update to reflect merged architecture |
| Vault: [[Obsidian-Skills-vs-LLM-Wiki]] | Update to reflect gaps closed |

### Create

| Path | Content |
|---|---|
| `skills/arc-maintaining-obsidian/SKILL.md` | Main skill file (<2500w) |
| `skills/arc-maintaining-obsidian/references/page-templates.md` | Page type schemas |
| `skills/arc-maintaining-obsidian/references/audit-checks.md` | LINT checks + GROW thresholds |
| `skills/arc-maintaining-obsidian/references/search-strategies.md` | Query patterns + output formats |
| `tests/skills/test_skill_arc_maintaining_obsidian.py` | Skill validation tests |

### Eval Workspaces

Migrate eval scenarios from existing workspaces to `skills/arc-maintaining-obsidian-workspace/`. Update skill references. Keep `arc-diagramming-obsidian-workspace/` unchanged.

---

<!-- REFINER_INPUT_START -->

## Requirements for Refiner

### Functional Requirements

- REQ-F001: Skill has three modes: ingest, query, audit — selected by user intent
- REQ-F002: Ingest mode follows Classify → Confirm → Create → PROPAGATE → Log pipeline
- REQ-F003: PROPAGATE searches vault for related pages and proposes updates (capped at 10 pages)
- REQ-F004: PROPAGATE detects contradictions between new source and existing pages
- REQ-F005: PROPAGATE follows propose-don't-auto-modify principle — user approves all changes
- REQ-F006: All existing writer features retained (6 page types, fast path, Query-as-Ingest, batch mode, LINK-on-Create, Raw Source Ingest, 3 artifact tiers, session log)
- REQ-F007: Query mode follows Orient → Search → Read → Synthesize → (File Back) pipeline
- REQ-F008: File Back triggers ingest mode internally (no skill handoff)
- REQ-F009: Query output supports Marp and Canvas in addition to existing formats
- REQ-F010: All existing querier features retained (vault-only answers, inline citations, adaptive output)
- REQ-F011: Audit mode follows LINK → LINT → GROW pipeline
- REQ-F012: LINT includes EVOLVE checks (field usage, type fit, tag drift) integrated into schema section
- REQ-F013: GROW includes outward suggestions (search terms, open questions, thin coverage, stale topics)
- REQ-F014: GROW never auto-fetches external content
- REQ-F015: All existing auditor features retained (LINK with backlinks, LINT checks, GROW thresholds, batch mode, audit reports, index.md, log.md validation)
- REQ-F016: Shared vault path detection, log.md dual-write, and obsidian-cli delegation across all modes
- REQ-F017: arc-diagramming-obsidian remains separate as delegation target for Tier 3 artifacts

### Non-Functional Requirements

- REQ-N001: Main SKILL.md under 2500 words — progressive loading via references/
- REQ-N002: All modes must work without Obsidian running (fallback to direct file write with warning)
- REQ-N003: Propose-don't-auto-modify for all vault changes (PROPAGATE, LINK, GROW)
- REQ-N004: Skill is markdown SKILL.md definition (no compiled code)

### Constraints

- Must delegate format correctness to kepano's obsidian skills (obsidian-markdown, json-canvas, obsidian-cli)
- Must not build MCP server, Obsidian plugin, or RAG system
- Single vault only — no multi-vault support
- Advanced search (qmd) deferred — not in scope for this design
- Implementation via skill-creator
<!-- REFINER_INPUT_END -->
