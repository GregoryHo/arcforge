# Learning Curator — Schema Contracts

**Date**: 2026-05-09
**Status**: Working schema companion
**Parent design**: [`2026-05-08-learning-curator-pivot-design.md`](./2026-05-08-learning-curator-pivot-design.md)
**Audience**: arcforge contributors implementing or reviewing the learning subsystem

## Purpose

This document records concrete layer-by-layer schemas, producer/consumer responsibilities, and transform boundaries for the learning curator pivot.

The parent design document owns architecture intent, product boundaries, and locked decisions. This companion owns the operational contract details:

- what each layer receives;
- what it writes;
- which actor owns the transform;
- which fields are persisted, derived, dashboard-safe, or LLM-visible;
- which behavior changes are explicitly forbidden at that layer.

Do not turn this file into the implementation plan. After these contracts are reviewed, the TDD implementation plan should be written as a separate document.

## Terminology

Use these terms consistently in this document:

- **Primary architecture path**: the intended end-to-end product flow from evidence collection through explicit activation.
- **Default production path**: behavior enabled without debug, audit/replay, migration/import, emergency repair, or experimental flags.
- **3.1 schema v1**: the first production contract for this layered learning architecture. It is not the historical arcforge v1/v2/v3 learning system. It prioritizes a project-scoped, dashboard-gated lifecycle and excludes future feedback lanes unless explicitly designed.
- **First 3.1 implementation slice**: the initial implementation subset used to ship the primary architecture path safely. A source adapter or action can be deferred from the first slice while still being required to target the same canonical Layer 5 schema when implemented.

## Layer numbering convention

This architecture has **nine numbered layers**:

```text
0. Enablement / Scope Gate
1. Observation Collection
2. Sanitization + Derived Semantic View
3. Curator Batch Assembly
4. LLM Curator Analysis
5. Candidate Queue + Lifecycle
6. Dashboard Review Control Plane
7. Materialization
8. Activation / Runtime Influence Surface
```

Use this exact numbering throughout design discussion, schema review, implementation plans, tests, and flow-diagram annotations. Do not describe the system as an "eight-layer" architecture.

Layer 0 is a real layer in the architecture. Its output is a deterministic gate decision rather than learning evidence, but it is still part of the numbered layer model because it controls whether later observation collection may happen at all.

## Layer Map

| Layer | Name | Responsible actor | Primary output | Detailed contract |
|---|---|---|---|---|
| 0 | Enablement / Scope Gate | Deterministic scope gate | allow/skip decision | [Drafted](./references/learning-curator-schema/layer-0-enablement-scope-gate.md) |
| 1 | Observation Collection | Claude Code hook + observation collector | observation event skeleton | [Drafted](./references/learning-curator-schema/layer-1-observation-collection.md) |
| 2 | Sanitization + Derived Semantic View | Deterministic privacy transform | safe evidence patch + consumer-specific derived views | [Drafted](./references/learning-curator-schema/layer-2-sanitization-derived-semantic-view.md) |
| 3 | Curator Batch Assembly | Deterministic batch assembler | bounded curator batch + required manifest | [Drafted](./references/learning-curator-schema/layer-3-curator-batch-assembly.md) |
| 4 | LLM Curator Analysis | LLM curator adapter | candidate proposal payload + required run manifest | [Drafted](./references/learning-curator-schema/layer-4-llm-curator-analysis.md) |
| 5 | Candidate Queue + Lifecycle | Deterministic candidate authority | canonical candidate queue + lifecycle events | [Drafted](./references/learning-curator-schema/layer-5-candidate-queue-lifecycle.md) |
| 6 | Dashboard Review Control Plane | Deterministic server/UI | dashboard-safe model + lifecycle action requests | [Drafted](./references/learning-curator-schema/layer-6-dashboard-review-control-plane.md) |
| 7 | Materialization | Deterministic artifact writer | inactive draft artifacts + materialization record | [Drafted](./references/learning-curator-schema/layer-7-materialization.md) |
| 8 | Activation / Runtime Influence Surface | Deterministic activation gate | explicit activation record + runtime influence surface | [Drafted](./references/learning-curator-schema/layer-8-activation-runtime-influence-surface.md) |

## Detailed contract ownership

This file is the schema contract index and governance document. It is not the source of truth for full per-layer TypeScript-style schemas.

- The parent design document owns product intent, architectural decisions, and high-level flow boundaries.
- This index owns terminology, layer numbering, cross-layer invariants, and navigation to the detailed contracts.
- Each per-layer reference owns the concrete schema, input/output contract, persisted artifacts, forbidden behavior, consumers, and acceptance criteria for that layer.
- Do not duplicate full schemas in this index. Link to the relevant per-layer contract instead.
- Do not turn either this index or the references into the implementation plan. After contracts are reviewed, write the TDD implementation plan as a separate document.

## Cross-layer invariants

1. Layer 0-8 numbering is canonical. Do not describe the system as an eight-layer architecture.
2. The primary architecture path remains evidence collection → bounded curation → proposal → canonical candidate queue → dashboard review → inactive materialization → explicit activation.
3. The default production path excludes debug/audit/replay, migration/import, emergency repair, and experimental flows unless explicitly named.
4. Layer 3 and Layer 4 are one-way in 3.1 schema v1; they must not read Layer 5-8 lifecycle state unless a future feedback lane is explicitly designed.
5. Layer 4 output is untrusted proposal data until Layer 5 validates, sanitizes, normalizes, deduplicates, assigns lifecycle identity, computes final evidence quality, and appends queue state.
6. Layer 5 is the canonical candidate authority for all candidate-producing entrypoints. Deferred source adapters must still target the same canonical Layer 5 schema when implemented.
7. Runtime influence is forbidden before explicit Layer 8 activation. Pending, approved, and materialized artifacts must not alter Claude runtime behavior.
8. Debug artifacts are local-only, retention-bound, excluded from default production readers, and never primary evidence for future learning runs.

## Reference file layout

```text
docs/plans/references/learning-curator-schema/
  layer-0-enablement-scope-gate.md
  layer-1-observation-collection.md
  layer-2-sanitization-derived-semantic-view.md
  layer-3-curator-batch-assembly.md
  layer-4-llm-curator-analysis.md
  layer-5-candidate-queue-lifecycle.md
  layer-6-dashboard-review-control-plane.md
  layer-7-materialization.md
  layer-8-activation-runtime-influence-surface.md
```
