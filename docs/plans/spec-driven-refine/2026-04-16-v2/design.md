# spec-driven-refine — Iteration 2026-04-16-v2

## Context (from spec v1)

Spec v1 formalized the SDD pipeline: three stages (brainstorming → refiner → planner),
three rules (R1 Human Consent, R2 Unidirectional Flow, R3 Block on Contradictions),
artifact layout, and spec identity header. It was refined from the initial design doc
but diverged during the refine session — removing REFINER_INPUT, simplifying the planner
to a sprint model, and adding interface contracts not present in the original design.

Reference: specs/spec-driven-refine/spec.xml v1

## Change Intent

This iteration aligns the spec with decisions made during the v1 refine session and
a subsequent design review. The changes fall into three categories: confirming refine
session decisions that the design doc didn't capture, adding new mechanisms discovered
during review, and removing over-engineered concepts.

### 1. Remove REFINER_INPUT — Refiner Consumes Complete Design Doc

**What changes:** Brainstorming no longer produces a structured REFINER_INPUT section.
The refiner reads the complete design doc (Path A) or gamma mode design doc (Path B)
and extracts requirements itself — like wiki ingest reading a raw source.

**Why:** REFINER_INPUT was a redundant summary of the design doc's content. The design
doc itself IS the structured output (Vision, Architecture, Components, etc.). Removing
the summary eliminates duplication and lets the refiner use the full context.

**Path B (gamma mode):** User describes changes in natural language via Context + Change
Intent sections. The refiner compares the design doc against the existing spec.xml to
determine ADDED/MODIFIED/REMOVED — the LLM does the diff, not the user.

### 2. Consolidate Initial/Iteration Modes

**What changes:** Remove the explicit mode distinction (initial vs iteration). The
refiner checks whether `specs/<spec-id>/spec.xml` exists:
- Exists → read existing spec alongside design doc, produce updated spec
- Doesn't exist → read design doc only, produce new spec

**Why:** As a project matures, every run is iteration. The "initial" case is just
iteration with no prior spec. Filesystem detection is deterministic and eliminates
the possibility of mode mismatch between design doc declaration and actual state.

**Replace mode eliminated:** A complete rewrite is just an aggressive iteration where
the Change Intent replaces everything. The refiner determines this from the design
doc's intent, not from a declared mode.

### 3. Planner: Sprint Model (Always Build From Scratch)

**What changes:** Planner always builds dag.yaml + epics/ from scratch. No delta
processing, no rework epics, no source_spec_version tracking, no state preservation
from previous DAGs.

**Why:** DAG is a derived view (like Karpathy's index.md), not a living contract.
"Rebuild = RAG" applies to the Spec layer (which is delta-integrated), not to the
DAG layer. Delta processing for the DAG (the delta × epic state matrix from v1 design)
was over-engineered — the scenarios it handled (MODIFIED + in_progress epic) rarely
occur because the pipeline is sequential.

### 4. Spec Carries Delta Metadata

**What changes:** When the refiner updates a spec (iteration), it writes a `<delta>`
element in the spec's `<overview>` recording what changed in this version:

```xml
<delta version="2" iteration="2026-05-01">
  <added ref="fr-login-003" />
  <added ref="fr-login-004" />
  <modified ref="fr-login-001" />
  <removed ref="fr-login-005" />
</delta>
```

**Why:** The planner must not read the design doc (R2 — derived layer should not
access raw source layer). But the planner needs to know what's new to avoid
re-planning completed work. The delta metadata stays within the spec (wiki layer),
keeping the three-layer architecture clean.

The planner reads the latest `<delta>` and plans only those requirements. For v1
(no delta), it plans all requirements.

### 5. DAG Completion Gates New Iterations

**What changes:** Before planning a new iteration, the planner checks the existing
dag.yaml:
- No dag.yaml → proceed (first time)
- All epics completed → archive old DAG, plan new delta
- Incomplete epics → block ("complete current sprint before iterating")

**Why:** Prevents overlapping sprints. The pipeline is sequential — complete v(N)
before iterating to v(N+1). The dag.yaml's completion status is the natural gate,
requiring no additional tracking.

### 6. sdd-utils.js = Validation Tools, Not Merge Engine

**What changes:** Clarify sdd-utils.js as a validation and information toolkit. The
LLM (refiner skill) directly manages spec content. sdd-utils.js provides deterministic
checks before and after LLM writes.

**Why:** OpenSpec uses a programmatic merge engine (LLM writes delta → code merges
into full spec). arcforge's spec is nested XML across multiple files — programmatic
merge would require an XML parser (violating zero-dependency) and complex multi-file
logic. Instead, the LLM manages the spec directly (like maintaining a wiki page),
and sdd-utils.js acts as audit LINT — validating structure, not authoring content.

Validation API:
- `validateSpecHeader(xml)` — identity header completeness
- `validateDesignDoc(path)` — design doc structure
- `validateRequirements(xml)` — AC and trace completeness
- `validateDagIntegrity(yaml)` — no cycles, valid references

Information API:
- `parseSpecHeader(xml)` — extract version, scope, delta
- `listSpecIds()` — scan specs/ directory
- `checkDagStatus(yaml)` — completion counts for gate check

### 7. Remove Stale Lint Skill

**What changes:** Remove standalone stale-lint skill (was stale-lint.xml in v1 spec).
Per-stage input/output validation replaces it.

**Why:** Each stage validates its own inputs and outputs. A separate lint skill that
scans for drift is redundant when the pipeline stages themselves enforce correctness
at execution time. Stale lint was an external audit; per-stage validation is inline
enforcement.

### 8. Interface Contracts Are Implementation Detail

**What changes:** The following v1 spec features are confirmed as implementation-level
detail that the refiner was authorized to add during formalization:
- Design Doc Contract (fr-cc-if-001)
- Spec Identity Header Contract (fr-cc-if-002)
- SDD Schemas guidance layer (fr-cc-if-003)
- SDD Utils enforcement layer (fr-cc-if-004)
- Skill Access Pattern (fr-cc-if-005)
- Two-Pass Write Pattern (fr-cc-val-001)
- Validation Report with Remediation (fr-cc-val-002)
- Per-stage validation with three-tier severity (cc-003)

**Why:** These don't change the pipeline's design intent (three-layer model, R1/R2/R3).
They specify how quality is ensured — analogous to OpenSpec's Zod schemas, which exist
in code but not in the proposal document.

## Architecture Impact

### Three-Layer Model Preserved

```
Raw Source (design doc) → Wiki (spec) → Derived (DAG)
         R1: human consent   R2: unidirectional   planner only reads spec
```

Changes #4 (delta metadata) and #5 (DAG gate) strengthen the model by ensuring the
planner never needs to cross into the raw source layer.

### Pipeline Flow Simplified

Before (v1 design):
```
Brainstorm → design doc (with REFINER_INPUT)
  → Refiner (initial/iteration/replace modes, reads REFINER_INPUT)
  → Planner (delta processing matrix, rework epics)
```

After (v2):
```
Brainstorm → design doc (complete doc or gamma mode)
  → Refiner (reads full doc + existing spec if any, writes delta metadata)
  → Planner (reads spec + delta, checks DAG gate, builds from scratch)
```

### Spec as Sprint Backlog

Each spec version produces one DAG (sprint). When the sprint is complete, the spec
can iterate. The delta metadata in the spec tells the next planner what to plan.

```
spec v1 → dag v1 → execute → complete → archive dag
spec v2 (delta: +email) → dag v2 (email only) → execute → complete
spec v3 (delta: ~phone→SSO) → dag v3 (SSO migration) → execute → complete
```

## Considered and Rejected

| Scenario | Decision | Rationale |
|---|---|---|
| Planner reads design doc for scope | Rejected | Violates three-layer model (derived reading raw source) |
| Programmatic spec merge (OpenSpec style) | Rejected | XML multi-file merge requires parser, violates zero-dependency |
| Separate mode for "replace" | Rejected | Replace is just aggressive iteration; refiner determines from intent |
| Completion tracking in spec per-requirement | Rejected | Delta metadata + DAG gate are sufficient; per-requirement status adds complexity |
| Same-day iteration collision | Noted | v1 design uses date as folder name; same-day iterations need disambiguator (e.g., -v2 suffix) — minor gap to address |
