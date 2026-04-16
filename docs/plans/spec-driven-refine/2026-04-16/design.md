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
  <spec-id>/                      # complete project unit (one per spec)
    spec.xml                      # live contract with identity header
    details/
      <capability>.xml
    dag.yaml                      # execution plan (derived from spec)
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

### Stage 2: Refining (Formalize) — SETTLED

**Two modes:**

| | Initial (Path A) | Iteration (Path B) |
|---|---|---|
| **Input** | design doc with `type: initial` | design doc with `type: iteration` + existing `specs/<spec-id>/spec.xml` |
| **Validation** | Requirements non-contradictory; each req has testable AC; no ambiguous terms | Same + delta doesn't conflict with unchanged requirements; REMOVED doesn't break dependency chains |
| **Block (R3)** | Contradictions / missing AC / circular dependencies | Same + delta conflicts with existing spec |
| **Output** | New `specs/<spec-id>/spec.xml` v1 + `details/*.xml` | Updated spec.xml v(N+1) + updated details/ |
| **spec_version** | `1` | `base_version + 1` |

**Replace mode:** When design doc has `type: iteration` but no `### Delta` section
(full REFINER_INPUT instead), refiner treats it as a complete rewrite. Produces
spec v(N+1) from scratch, supersedes previous version. Used when user wants to
redo an entire spec.

**Refiner flow:**

```
Read design doc
     │
     ├── type: initial ──→ Formalize from scratch
     │                      ├── Build <requirement> + <acceptance_criteria> + <trace>
     │                      ├── Split by capability into details/*.xml
     │                      └── Write identity header (v1, active)
     │
     └── type: iteration ──→ Read existing spec.xml
                              ├── Has Delta section?
                              │   ├── Yes → Apply delta:
                              │   │    ADDED   → new <requirement> + details
                              │   │    MODIFIED → update existing <requirement>
                              │   │    REMOVED → remove <requirement> + clean details
                              │   └── No  → Replace: formalize from scratch (like initial)
                              ├── Validate merged/new spec has no contradictions
                              ├── Bump spec_version
                              ├── Update <source> to new design iteration
                              ├── Update <scope>
                              └── Set <supersedes> to previous version
```

**Blocking report** (`<date>/refiner-report.md` alongside rejected design):

```markdown
# Refiner Report — <spec-id> iteration <date>

## Status: BLOCKED

## Issues

### Contradictions
- REQ-Fxxx vs REQ-Fyyy: [specific conflict description]

### Missing Acceptance Criteria
- REQ-Fxxx: no testable AC defined

### Dependency Issues
- REMOVED REQ-Fxxx is referenced by REQ-Fyyy (dependency broken)

## Recommendations
- [specific suggestion for each issue]
```

**Output artifacts:**

```
specs/<spec-id>/
  spec.xml              ← current (refiner writes)
  details/*.xml         ← current (refiner writes)
```

No CHANGELOG. History lives in `docs/plans/<spec-id>/` (design iterations).
Previous spec versions live in git history.

**Commit:** `feat(specs): formalize <spec-id> v<N>` or
`feat(specs): update <spec-id> v<N-1> → v<N>`

### Stage 3: Planning (Decompose) — SETTLED

**Planner reads delta from the design doc via spec's source pointer:**

```
Read specs/<spec-id>/spec.xml
  → follow <source><design_path>
  → read design doc REFINER_INPUT
  → type: initial → build DAG from scratch
  → type: iteration + has Delta → incremental update
  → type: iteration + no Delta (replace) → build DAG from scratch
```

**Two modes:**

| | Initial / Replace | Iteration (incremental) |
|---|---|---|
| **Input** | spec.xml | spec.xml + existing `specs/<spec-id>/dag.yaml` |
| **Output** | New dag.yaml + `epics/` | Updated dag.yaml + new/modified epics |
| **Tagging** | All epics: `source_spec_version: N` | New/changed epics: `source_spec_version: N` |

**DAG lives inside the spec folder:** `specs/<spec-id>/dag.yaml` +
`specs/<spec-id>/epics/`. Each spec is a self-contained project unit.

**dag.yaml structure:**

```yaml
epics:
  - id: capability-a
    status: completed
    source_requirement: fr-ca-001
    source_spec_version: 1

  - id: capability-c
    status: pending
    source_requirement: fr-cc-001
    source_spec_version: 2

  - id: capability-a-v2          # rework epic
    status: pending
    source_requirement: fr-ca-001
    source_spec_version: 2
    rework_of: capability-a       # traces back to original
```

No `spec_id` field needed — folder location is the scope.

**Delta × epic state matrix:**

| Delta | Epic: completed | Epic: in_progress | Epic: pending |
|---|---|---|---|
| **ADDED** | — (new epic) | — (new epic) | — (new epic) |
| **MODIFIED** | New rework epic | **Block — ask human** | Update epic in place |
| **REMOVED** | Mark `deprecated` | **Block — ask human** | Remove from DAG |

**Planner blocking:** unlike refiner (which blocks on spec contradictions),
planner blocks on **execution state conflicts** — specifically when an
in_progress epic is affected by MODIFIED or REMOVED. Human decides:
complete first, abort, or merge.

**Diff report** (when blocking or when auto-applied changes need confirmation):

```markdown
# Planner Report — <spec-id> v<N>

## Auto-applied
- ADDED: epic capability-c (pending, spec_version: N)
- REMOVED: epic capability-d (was pending, removed)
- MODIFIED: capability-a → rework epic capability-a-v2

## Needs Decision
- MODIFIED: REQ-Fxxx → epic capability-b is IN_PROGRESS
  1. Complete current work first, then rework
  2. Abort current, create rework epic
  3. Merge changes into current work
```

**"Done" signal:** all epics with `source_spec_version: N` are `completed`
→ iteration N is done.

**Commit:** `feat(dag): plan <spec-id> v<N>` or
`feat(dag): update dag for <spec-id> v<N-1> → v<N>`

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
| Refiner delta conflicts with existing spec | Block, produce refiner-report.md | R3 |
| Planner: MODIFIED/REMOVED hits in_progress epic | Block, produce planner report, human decides | R3 |
| Design doc modified after spec produced | Stale lint flags; human decides whether to iterate | R1 |
| Design folder exists but no spec | Stale lint flags: "unrefined design" | — |
| Spec exists but no dag.yaml | Stale lint flags: "unplanned spec" | — |
| spec_id collision (proposed name already exists) | Brainstorming asks: iterate existing or rename? | — |

## Testing

Will follow arc-tdd when implementation begins. Key test scenarios:

**Stage 1 (Brainstorming):**
- Path A: new spec_id → design doc at `docs/plans/<spec-id>/<date>/design.md` → `type: initial`
- Path B: existing spec_id → design doc with `type: iteration` + delta
- Path B replace: existing spec_id → design doc with `type: iteration` + no Delta section

**Stage 2 (Refiner):**
- Initial: design doc → spec.xml v1 with identity header + details/
- Iteration (delta): design delta + existing spec → spec.xml v(N+1) with updated scope/supersedes
- Iteration (replace): complete design + existing spec → spec.xml v(N+1) from scratch
- Block: contradictory design → refiner-report.md produced → no spec.xml
- Block (delta): delta conflicts with existing requirements → refiner-report.md

**Stage 3 (Planner):**
- Initial: spec.xml → dag.yaml + epics/ from scratch, all `source_spec_version: 1`
- Iteration: delta ADDED → new epic with `source_spec_version: N`
- Iteration: delta MODIFIED + completed epic → rework epic with `rework_of`
- Iteration: delta REMOVED + pending epic → removed from DAG
- Block: MODIFIED/REMOVED + in_progress epic → planner report → human decides
- Done signal: all `source_spec_version: N` epics completed

**Stale lint:**
- Design newer than spec → flag
- Design folder without spec → flag "unrefined design"
- Spec without dag.yaml → flag "unplanned spec"

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

**Stage 1 — Brainstorming:**
- REQ-F001: Brainstorming scans `specs/` for existing spec_ids before starting
- REQ-F002: Brainstorming routes to Path A (new) or Path B (iteration) based on user confirmation
- REQ-F003: Path A produces design doc at `docs/plans/<spec-id>/<date>/design.md` with `type: initial` REFINER_INPUT
- REQ-F004: Path B reads existing spec.xml and previous iterations before eliciting delta
- REQ-F005: Path B produces design doc with `type: iteration`, `base_version`, and Delta section (ADDED/MODIFIED/REMOVED)
- REQ-F006: spec_id is derived from content at end of Phase 2 and confirmed by user (Path A only)
- REQ-F007: Change type is derived from delta content, not declared by user

**Stage 2 — Refiner:**
- REQ-F008: Refiner blocks when design doc contains contradictions (R3)
- REQ-F009: Refiner rejection report stored at `<date>/refiner-report.md` alongside the rejected design
- REQ-F010: Spec has identity header: spec_id, spec_version, status, source, scope, supersedes
- REQ-F011: Multiple specs coexist in `specs/<spec-id>/` folders
- REQ-F012: Initial mode: formalize from scratch → spec v1 + details/
- REQ-F013: Iteration mode (delta): apply ADDED/MODIFIED/REMOVED to existing spec → v(N+1)
- REQ-F014: Iteration mode (replace): no Delta section → formalize from scratch as v(N+1)
- REQ-F015: Refiner validates merged spec has no contradictions before producing output

**Stage 3 — Planner:**
- REQ-F016: Planner reads delta info by following spec's `<source>` pointer to design doc
- REQ-F017: Initial/replace mode: build dag.yaml + epics/ from scratch
- REQ-F018: Iteration mode: ADDED → new epic; MODIFIED + completed → rework epic; REMOVED + pending → remove
- REQ-F019: Planner blocks when MODIFIED/REMOVED affects in_progress epics; produces diff report
- REQ-F020: Each epic tagged with `source_spec_version` for completion tracking
- REQ-F021: Rework epics include `rework_of` field tracing back to original epic
- REQ-F022: DAG + epics live inside `specs/<spec-id>/` (self-contained project unit)
- REQ-F023: "Done" = all epics with `source_spec_version: N` are completed

**Cross-cutting:**
- REQ-F024: Design docs are immutable after commit; modifications require new iteration (R1)
- REQ-F025: Downstream stages cannot modify upstream artifacts (R2)
- REQ-F026: Stale lint: design newer than spec → flag
- REQ-F027: Stale lint: design folder without spec → flag "unrefined design"
- REQ-F028: Stale lint: spec without dag.yaml → flag "unplanned spec"

### Non-Functional Requirements

- REQ-N001: Pipeline works with existing arcforge CLI and skill infrastructure (no new runtime dependencies)
- REQ-N002: All artifacts are file-based (YAML, XML, Markdown) — no database

### Constraints

- CC-001: Zero external dependencies (Node.js standard library only)
- CC-002: Backward compatible with existing `specs/spec.xml` format (additive changes to XML schema only)

### Scope

includes:
  - stage-1-brainstorming: Path A/B routing, design doc structure, REFINER_INPUT format
  - stage-2-refiner: initial/iteration/replace modes, blocking report, identity header
  - stage-3-planner: initial/iteration modes, delta processing, rework epics, done signal
  - cross-cutting-rules: R1 (human consent), R2 (unidirectional), R3 (block on contradictions)
  - artifact-layout: directory structure for designs, specs, DAG (per-spec)
  - spec-identity-header: XML schema for spec self-identification
  - stale-lint: detection of upstream/downstream drift + completeness checks

excludes:
  - implementation: no code changes in this design — skill and library modifications deferred
  - cross-spec-dependencies: deferred until multi-spec usage is established

<!-- REFINER_INPUT_END -->
