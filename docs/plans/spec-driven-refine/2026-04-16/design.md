# spec-driven-refine — Design

## Vision

Convert arcforge's one-shot `brainstorming → refiner → planner` pipeline into an
iterable Spec-Driven Development workflow. Design docs become immutable raw sources;
specs become live contracts updated via delta integration; DAGs become derived views
that preserve execution state. Three foundational rules govern the entire flow.

## Architecture

### Three Foundational Rules

| Rule | Statement |
|---|---|
| **R1 — Human Consent** | Raw source (design doc) changes require human consent or initiation |
| **R2 — Unidirectional Flow** | Downstream artifacts cannot modify upstream artifacts |
| **R3 — Block on Contradictions** | Downstream stage blocks when upstream has contradictions; does not pass through broken artifacts |

### Three-Layer Model

Mapped from Karpathy's LLM Wiki three-layer architecture:

| Layer | Karpathy | arcforge SDD | Verb | Lifecycle |
|---|---|---|---|---|
| Raw Source | Articles, papers | Design doc | **Elicit** | Immutable per iteration; new iteration = new file |
| Wiki | LLM-maintained markdown | Spec (XML) | **Formalize** | Mutable via delta integration; self-versioned |
| Schema | CLAUDE.md / AGENTS.md | Skill routing + templates | — | Human + LLM co-evolve |
| (derived) | index.md | DAG + epics | **Decompose** | Rebuildable; preserves execution state |

Design docs are raw sources — human intent amplified by an LLM tool. The tool
used (LLM vs word processor) does not change the artifact's status; the flow
rules do.

### Artifact Directory Layout

```
docs/plans/
  <spec-id>/                      # topic folder (groups iterations)
    <YYYY-MM-DD>/                 # iteration (immutable snapshot)
      design.md                   # raw source
      refiner-report.md           # only if refiner blocked this iteration
    <YYYY-MM-DD>/
      design.md

specs/
  <spec-id>/                      # one folder per spec (multiple specs coexist)
    spec.xml                      # live contract with identity header
    details/
      <capability>.xml

dag.yaml                          # execution plan (derived from spec)
epics/
  <epic-id>/
    epic.md
    features/*.md
```

**Topic folder merge rule:** new iteration goes in same `<spec-id>/` folder only
if it will supersede or amend the same spec. Merely "related" topics get their own
folder.

### Spec Identity Header

```xml
<overview>
  <spec_id>example-feature</spec_id>
  <spec_version>1</spec_version>
  <status>active</status>
  <source>
    <design_path>docs/plans/example-feature/2026-04-16/design.md</design_path>
    <design_iteration>2026-04-16</design_iteration>
  </source>
  <scope>
    <includes>
      <feature id="f-xxx">description</feature>
    </includes>
    <excludes>
      <reason>why excluded</reason>
    </excludes>
  </scope>
  <supersedes>example-feature:v0</supersedes>
</overview>
```

## Components

### Stage 1: Brainstorming (Elicit) — SETTLED

**Entry flow:**
1. Scan `specs/` for existing spec_ids
2. Present findings to user — always confirm:
   - Similar spec found → "Iterating on `<spec-id>` (v\<N\> active)?"
   - No match → "New topic — proposed spec-id: `<suggestion>`. OK?"
3. User confirms → Path A or Path B

**Path A — New Spec:**

| Aspect | Detail |
|---|---|
| Flow | Standard brainstorming Phase 1-3 (Understanding → Exploring → Presenting) |
| spec_id | Derived from content at end of Phase 2 (scope clear); user confirms |
| Output | `docs/plans/<spec-id>/<date>/design.md` |
| REFINER_INPUT | `type: initial`, full requirements, scope declaration |
| Commit | `docs: add <spec-id> design` |

**Path B — Iteration:**

| Aspect | Detail |
|---|---|
| Phase 1 | Read existing spec.xml + previous iteration(s) to understand current state |
| Phase 2 | Explore delta only — what changes, why, interaction with existing scope |
| Phase 3 | Present context summary + delta; confirm section by section |
| Output | `docs/plans/<spec-id>/<date>/design.md` (γ mode) |
| REFINER_INPUT | `type: iteration`, `base_version: <N>`, Delta (ADDED/MODIFIED/REMOVED) |
| Commit | `docs: add <spec-id> iteration <date>` |

**Path B design doc structure (γ mode):**

```markdown
# <spec-id> — Iteration <YYYY-MM-DD>

## Context (from spec v<N>)
<2-3 sentence summary of current spec scope>
Reference: specs/<spec-id>/spec.xml v<N>

## Change Intent
<Why this change, what changes, what doesn't change>

## Architecture Impact
<Only delta — how changes interact with existing design>

## REFINER_INPUT
spec_id: <spec-id>
iteration: <YYYY-MM-DD>
type: iteration
base_version: <N>

### Delta
- ADDED: REQ-F010 — ...
- MODIFIED: REQ-F003 — from ..., to ...
- REMOVED: REQ-F005 — reason: ...

### Constraints (new or modified)
- CC-005: ...

### Scope Changes
added:
  - feature-c: ...
removed: []
modified:
  - feature-a: from ..., to ...
```

**Change type derived from delta content:**

| Delta Content | Inferred Type |
|---|---|
| All ADDED | extend |
| All MODIFIED | modify |
| All REMOVED | reduce |
| ADDED + REMOVED | restructure |
| Entire spec replaced | replace |

**Refiner rejection:** `<date>/refiner-report.md` stored alongside the rejected
design. Human opens new iteration to fix. No override mechanism — resolve at source.

**No lightweight amend path.** All changes go through the full pipeline.

### Stage 2: Refining (Formalize) — TBD

Settled:
- Blocks on contradictions (R3)
- Cannot modify design doc (R2)
- Produces spec with identity header
- Multi-spec support (`specs/<spec-id>/`)

Open:
- Delta format for Path B revisions
- Blocking report structure
- Spec version bump semantics (when does v1 → v2?)

### Stage 3: Planning (Decompose) — TBD

Settled:
- Cannot modify spec (R2)
- DAG is a derived view of spec
- Must preserve execution state (completed/in_progress locked)

Open:
- DAG update semantics for iteration scenarios
- Epic lifecycle when requirements are MODIFIED or REMOVED
- Relationship between spec_id and dag.yaml structure

## Data Flow

```
            R1: human consent     R2: no upstream modification
                    │                        │
User ──→ Brainstorm ──→ Design doc ──→ Refiner ──→ Spec ──→ Planner ──→ DAG
          (elicit)       (raw source)   (formalize)  (contract)  (decompose) (plan)
              │               │              │            │            │
              │          frozen after    blocks if     mutable     preserves
              │            commit       contradictions  via delta   exec state
              │               │         (R3)
              │               │              │
              │          if blocked:    refiner-report.md
              │          new iteration  alongside design
              │          (Path B)
              └──────────────┘
```

Iteration loop: blocked → new design iteration → re-run refiner. Always through
brainstorming (human elicits new intent), never by editing existing artifacts.

## Error Handling

| Error | Response | Rule |
|---|---|---|
| Refiner finds contradictions in design | Block, produce refiner-report.md, require new iteration | R3 |
| Design doc modified after spec produced | Stale lint flags; human decides whether to iterate | R1 |
| spec_id collision (proposed name already exists) | Brainstorming asks: iterate existing or rename? | — |
| Spec version conflict (two iterations target same base) | Not applicable — single-user tool | — |

## Testing

TBD — will follow arc-tdd when implementation begins. Key test scenarios:

- Path A: new spec_id → design doc in correct location → REFINER_INPUT has `type: initial`
- Path B: existing spec_id → design doc in correct location → REFINER_INPUT has `type: iteration` + delta
- Refiner block: design with contradiction → refiner-report.md produced → no spec.xml
- Iteration after block: new design addresses contradiction → spec produced
- Stale detection: design newer than spec → lint flags

## Considered and Rejected

| Scenario | Decision | Rationale |
|---|---|---|
| Human override of refiner block | Not needed | Resolve by adding rationale in new iteration |
| Lightweight amend path | Not needed | All changes through full pipeline |
| Exploration-only brainstorming | Not needed | Non-pipeline docs are just docs, not SDD artifacts |
| Spec rollback | Not needed | Rollback = new iteration (v3 reintroducing v1) |
| Cross-spec dependencies | TBD later | Not day-1; design when multi-spec usage established |

---

<!-- REFINER_INPUT_START -->

## REFINER_INPUT

spec_id: spec-driven-refine
iteration: 2026-04-16
type: initial

### Functional Requirements

- REQ-F001: Brainstorming scans `specs/` for existing spec_ids before starting
- REQ-F002: Brainstorming routes to Path A (new) or Path B (iteration) based on user confirmation
- REQ-F003: Path A produces design doc at `docs/plans/<spec-id>/<date>/design.md` with `type: initial` REFINER_INPUT
- REQ-F004: Path B reads existing spec.xml and previous iterations before eliciting delta
- REQ-F005: Path B produces design doc with `type: iteration`, `base_version`, and Delta section (ADDED/MODIFIED/REMOVED)
- REQ-F006: spec_id is derived from content at end of Phase 2 and confirmed by user (Path A only)
- REQ-F007: Change type is derived from delta content, not declared by user
- REQ-F008: Refiner blocks when design doc contains contradictions (R3)
- REQ-F009: Refiner rejection report stored at `<date>/refiner-report.md` alongside the rejected design
- REQ-F010: Spec has identity header: spec_id, spec_version, status, source (design_path + iteration), scope (includes/excludes), supersedes
- REQ-F011: Multiple specs coexist in `specs/<spec-id>/` folders
- REQ-F012: Stale detection lint flags when design is newer than corresponding spec
- REQ-F013: Design docs are immutable after commit; modifications require new iteration (R1)
- REQ-F014: Downstream stages cannot modify upstream artifacts (R2)

### Non-Functional Requirements

- REQ-N001: Pipeline works with existing arcforge CLI and skill infrastructure (no new runtime dependencies)
- REQ-N002: All artifacts are file-based (YAML, XML, Markdown) — no database

### Constraints

- CC-001: Zero external dependencies (Node.js standard library only)
- CC-002: Backward compatible with existing `specs/spec.xml` format (additive changes to XML schema only)
- CC-003: Stage 2 (Refiner) and Stage 3 (Planner) details are TBD — this design covers Stage 1 and cross-cutting rules only

### Scope

includes:
  - stage-1-brainstorming: Path A/B routing, design doc structure, REFINER_INPUT format
  - cross-cutting-rules: R1 (human consent), R2 (unidirectional), R3 (block on contradictions)
  - artifact-layout: directory structure for designs, specs, DAG
  - spec-identity-header: XML schema for spec self-identification
  - stale-lint: detection of upstream/downstream drift

excludes:
  - stage-2-refiner: delta format, blocking report structure, version bump semantics (TBD)
  - stage-3-planner: DAG update semantics, epic lifecycle on changes (TBD)
  - implementation: no code changes in this design — skill and library modifications deferred

<!-- REFINER_INPUT_END -->
