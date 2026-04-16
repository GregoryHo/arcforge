# Iterable SDD Pipeline — Research Notes

Exploration for converting arcforge's `brainstorming → refiner → planner` pipeline
into an iterable Spec-Driven Development workflow with a clear source of truth.

## Decisions Made

### Three Foundational Rules

| Rule | Statement | Rationale |
|---|---|---|
| **Rule 1** | Upstream (raw source) changes require human consent or initiation | Human controls intent; LLM is a tool |
| **Rule 2** | Downstream cannot modify upstream (unidirectional flow) | Prevents invisible drift; audit trail stays clean |
| **Rule 3** | Downstream blocks on upstream contradictions — does not pass through broken artifacts | (b) chosen: contradictions must be resolved at source, not carried forward |

### Three-Layer Model (Option C — Hybrid)

Mapped from Karpathy's LLM Wiki three-layer architecture:

| Layer | Karpathy | arcforge SDD | Verb | Lifecycle |
|---|---|---|---|---|
| Raw Source | Articles, papers, URLs | Design doc (`docs/plans/<spec-id>/<date>/design.md`) | **Elicit** | Immutable per iteration; new iteration = new file in same topic folder |
| Wiki | LLM-maintained markdown | Spec (`specs/<spec-id>/spec.xml` + `details/`) | **Formalize** | Mutable via delta integration; identity header self-declares version/scope/status |
| Schema | CLAUDE.md / AGENTS.md | Skill routing + templates + `.arcforge/` config | (co-evolved) | Human + LLM co-evolve |
| (derived view) | index.md | DAG (`dag.yaml` + `epics/`) | **Decompose** | Rebuildable from spec; preserves execution state |

Key insight: design doc IS a raw source (human intent amplified by LLM tool), not a
separate "Design Intent" category. The tool used (LLM vs word processor) doesn't change
the artifact's status — the flow rules do.

### Artifact Definitions

| Artifact | Role | Author | Immutability |
|---|---|---|---|
| **Design doc** | Captures WHY — explores problem space, converges on approach, produces structured requirements | Human + LLM (brainstorming) | Frozen per iteration. New iteration = new subfolder. |
| **Spec** | Captures WHAT — formalizes requirements into machine-parseable, testable contract with acceptance criteria and traceability | LLM (refiner), human approves | Mutable via delta integration. Self-versioned. |
| **DAG** | Captures HOW — decomposes spec into executable epics/features with dependency ordering | LLM (planner), human approves | Derived view of spec. Preserves execution state (completed/in_progress locked). |

### Design Folder Structure

```
docs/plans/
  <spec-id>/                    # topic folder — groups iterations of same spec
    <date>/                     # iteration folder — immutable snapshot
      design.md                 # the raw source
    <date>/
      design.md
```

Merge rule for topic folder: new iteration goes in same `<spec-id>/` folder
only if it will **supersede or amend** an existing iteration. If it's merely
"related" but won't modify the same spec, open a new topic folder.

### Spec Identity Header

```xml
<overview>
  <spec_id>agent-eval-extension</spec_id>
  <spec_version>1</spec_version>
  <status>active</status>                     <!-- active | superseded | draft -->
  <source>
    <design_path>docs/plans/agent-eval-extension/2026-04-02/design.md</design_path>
    <design_iteration>2026-04-02</design_iteration>
  </source>
  <scope>
    <includes>
      <feature id="f-xxx">description</feature>
    </includes>
    <excludes>
      <reason>why excluded</reason>
    </excludes>
  </scope>
  <supersedes>agent-eval-extension:v0</supersedes>  <!-- optional -->
</overview>
```

Multiple specs coexist: `specs/<spec-id>/spec.xml` per topic.

### Lint Strategy

Stale detection (option a) — cheap, time/relationship-based:
- Design iteration newer than spec's `<design_iteration>` → flag
- Change workspace open >14 days without progress → flag
- Spec has requirements not covered by any DAG epic → flag

No drift detection (option b) at this time. No EVOLVE-style checks yet.

### Refiner Blocking Behavior

Option (b): refiner **blocks** when it finds contradictions in the design doc.
Does not produce spec.xml. Reports issues. Human must fix via new brainstorming
iteration (Path B). This enforces Rule 2 (downstream can't fix upstream) and
Rule 3 (don't pass through broken artifacts).

## Pipeline Stages — Design Space

### Stage 1: Brainstorming (Elicit) — SETTLED

**Entry flow:** Always scan `specs/` for existing spec_ids. Always confirm with user.
- Similar spec found → "Iterating on `<spec-id>` (v<N> active)?" → Path B
- No match → "New topic — proposed spec-id: `<suggestion>`. OK?" → Path A

**Path A (new spec):**
- Standard brainstorming (Phase 1-3)
- spec_id derived from content at end of Phase 2, user confirms
- Output: `docs/plans/<spec-id>/<date>/design.md`
- REFINER_INPUT: `type: initial`, full requirements + scope declaration

**Path B (iteration):**
- Read existing spec.xml + previous iterations for context
- Brainstorming focuses on delta (what changes, why, interaction with existing)
- Output: `docs/plans/<spec-id>/<date>/design.md` (γ mode: context summary + delta)
- REFINER_INPUT: `type: iteration`, `base_version: <N>`, Delta (ADDED/MODIFIED/REMOVED)

**Change type derived, not declared:** Inferred from delta content:
- All ADDED → extend; All MODIFIED → modify; All REMOVED → reduce
- ADDED + REMOVED → restructure; Entire spec replaced → replace

**Refiner rejection:** `<date>/refiner-report.md` alongside rejected design.
Human opens new iteration to fix, refiner re-runs.

**No lightweight amend path.** All changes go through full pipeline.

### Stage 2: Refining (Formalize)

- Input: design doc (read-only) + existing spec if Path B
- Output: `specs/<spec-id>/spec.xml` with identity header
- Blocks on contradictions (Rule 3)
- Reports issues but never modifies design doc (Rule 2)

Open questions:
- Delta format for Path B revisions
- Change workspace structure (proposed (ii) — `changes/<id>/`)

### Stage 3: Planning (Decompose)

- Input: spec.xml (read-only) + existing dag.yaml state
- Output: dag.yaml + epics/
- Cannot modify spec (Rule 2)

Open questions:
- DAG update semantics (proposed (II) — diff + reconcile)
- How execution state (completed/in_progress) is preserved

## Reference Projects

### spectra-app patterns

SoT: `openspec/specs/<capability>/spec.md` — structured Markdown.
Iterability: delta specs with ADDED/MODIFIED/REMOVED sections.
Artifact graph: each artifact declares `requires: [...]`.
Schema-driven workflows: YAML-defined, swappable per change.

### OpenSpec patterns

SoT: `openspec/specs/` — live state, separate from proposals.
Change workflow: propose → apply → archive.
Archive: timestamped folders, immutable record.
Novel: schema-versioned per change, fluid (not phase-locked), proposal as change artifact.

## Considered and Rejected

| Scenario | Decision | Rationale |
|---|---|---|
| Human override of refiner block | Not needed | Human resolves by opening new iteration with rationale, not by skipping |
| Lightweight amend path (typo/AC fix) | Not needed | All changes go through the pipeline; consistency > convenience |
| Exploration-only brainstorming (no refiner intent) | Not needed | If not entering pipeline, it's just a doc, not an SDD artifact |
| Spec rollback (v2 → v1) | Not needed | Rollback = new iteration (v3 reintroducing v1's design). No special mechanism. |
| Cross-spec dependencies | TBD later | Real problem, not day-1. Design when multi-spec usage is established. |
| Parallel iteration conflicts | Not applicable | arcforge is a personal tool; no multi-user concurrency. |

## Current arcforge pipeline (baseline)

| Skill | Input | Output | Format |
|---|---|---|---|
| arc-brainstorming | (user dialogue) | `docs/plans/YYYY-MM-DD-<topic>-design.md` | Markdown + REFINER_INPUT |
| arc-refining | design doc | `specs/spec.xml` + `specs/details/*.xml` | XML |
| arc-planning | spec.xml | `dag.yaml` + `epics/<epic-id>/` | YAML + Markdown |

Iterability gaps:
1. No regeneration trigger when upstream changes
2. No version tracking — can't tell which design iteration produced which spec
3. DAG independent of spec drift once committed
4. REFINER_INPUT one-way — refinements don't back-flow
5. No structural traceability tooling
