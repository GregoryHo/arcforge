# Obsidian Skills Improvements Design

## Vision

Six improvements to arc-writing-obsidian and arc-auditing-obsidian that close gaps identified by comparing the arcforge implementation against Karpathy's LLM Wiki pattern. Each improvement strengthens the knowledge compounding loop — making it easier to capture knowledge, faster to connect it, and more reliable to maintain it.

## Architecture Decision

All improvements are additive — no existing behavior changes. Each is implemented as a new section or table row in the SKILL.md files, maintaining backward compatibility with existing vault workflows.

### Improvements by Skill

#### arc-writing-obsidian (4 additions)

| # | Feature | Mechanism |
|---|---------|-----------|
| 1 | **Query-as-Ingest** | New trigger signals ("file this back", "save this insight") skip Classify and auto-select Synthesis or Decision based on conversation context |
| 2 | **Batch Mode** | `--batch` flag processes a folder of raw files with fast-path-only classification, emitting a batch summary |
| 3 | **Session Log** | Dual-write: after every Create, append structured entry to `log.md` (for LLM grep) alongside daily notes (for human browsing) |
| 4 | **LINK-on-Create** | `--link` flag delegates to `arc-auditing-obsidian link --file=<path>` for immediate post-creation graph connectivity |

#### arc-auditing-obsidian (4 additions)

| # | Feature | Mechanism |
|---|---------|-----------|
| 5 | **Single-file LINK** | `link --file=<path>` runs LINK on one note only, used by writer's `--link` flag |
| 6 | **index.md generation** | LINT auto-generates/updates `index.md` — vault-wide table of contents organized by page type |
| 7 | **log.md validation** | LINT checks `log.md` entries reference existing files, flags gaps |
| 8 | **GROW from LINK failures** | Unresolved plain-text mentions from LINK are piped to GROW as entity candidates |

### Key Design Decisions

**Query-as-Ingest skips Classify, not Confirm.** The conversation context already determines the type (choice → Decision, everything else → Synthesis). No ambiguity to resolve.

**Batch Mode warns about cascading errors.** The Confirm gate exists to prevent misclassification. Batch mode removes it for speed, but documents the trade-off explicitly.

**Session Log dual-writes to two audiences.** Daily notes serve the human browsing in Obsidian. log.md serves the LLM scanning for recent activity via grep. Different audiences, different formats, same data.

**LINK-on-Create preserves separation of concerns.** The writer delegates to the auditor via `link --file=<path>` rather than implementing vault search itself. The writer remains vault-unaware.

**GROW from LINK failures creates a tight feedback loop.** LINK → unresolved mentions → GROW suggestions → user approves → writer creates entity notes → next LINK resolves them. Self-healing knowledge graph.

**index.md is generated during LINT, not maintained eagerly.** Eagerly updating on every write would require vault awareness in the writer. Generating during LINT keeps the auditor as the single vault-aware component.

---

<!-- REFINER_INPUT_START -->

## Requirements for Refiner

### Functional Requirements

- REQ-F001: Writer recognizes "file this back" / "save this insight" / "keep this" / "crystallize this" as Query-as-Ingest triggers
- REQ-F002: Writer `--batch` flag processes folder contents with fast-path classification only
- REQ-F003: Writer appends structured `## [YYYY-MM-DD] create | [type] | [filename]` to log.md after every Create
- REQ-F004: Writer `--link` flag invokes auditor's single-file LINK after creation
- REQ-F005: Auditor `link --file=<path>` runs LINK on exactly one specified note
- REQ-F006: Auditor LINT generates/updates index.md organized by page type
- REQ-F007: Auditor LINT validates log.md references match existing vault files
- REQ-F008: Auditor GROW accepts unresolved LINK mentions as entity candidates

### Non-Functional Requirements

- REQ-N001: All changes are additive — no existing behavior regresses
- REQ-N002: Both skills remain under 500 lines (comprehensive tier)
- REQ-N003: All 202 pytest skill tests pass after changes

### Constraints

- Writer must remain vault-unaware (no direct vault search)
- Auditor is the only component that modifies existing notes
- GROW proposes only, never auto-creates
<!-- REFINER_INPUT_END -->
