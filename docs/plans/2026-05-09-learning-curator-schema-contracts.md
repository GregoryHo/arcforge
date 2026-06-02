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
- **3.1 schema v1**: the first production contract for this layered learning architecture. It is not the historical arcforge v1/v2/v3 learning system. It prioritizes a dashboard-gated lifecycle with project-scoped curator proposals and explicit dashboard promotion to global candidates.
- **First 3.1 implementation slice**: the initial implementation subset used to ship the primary architecture path safely. It includes explicit dashboard `[Promote]` project → global candidate creation through Layer 5. Any source adapter or action left for later must still target the same canonical Layer 5 schema when implemented.

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
6. Layer 5 is the canonical candidate authority for all candidate-producing entrypoints. First-slice dashboard promotion must create global candidates through Layer 5, and later source adapters must still target the same canonical Layer 5 schema when implemented.
7. Runtime influence is forbidden before explicit Layer 8 activation. Pending, approved, and materialized artifacts must not alter Claude runtime behavior.
8. Debug artifacts are local-only, retention-bound, excluded from default production readers, and never primary evidence for future learning runs.

## Persistence root organization

The learning subsystem persists state under two roots with deliberately different retention contracts:

- `~/.arcforge/observations/` holds **raw evidence**. Files here (`<project>/observations.jsonl`) are subject to retention/purge/quarantine policies and may be deleted without violating any product invariant. Observation data is local-only and is not a candidate or product-truth artifact.
- `~/.arcforge/learning/` holds **curator artifacts** that constitute Layer 3-8 product truth — curator batch manifests, curator run manifests, the candidate queue, rejection audits, materialization records, activation records, dashboard audit logs, and optional debug artifacts. These follow append-only / event-log / atomic-overwrite semantics and have stricter retention than raw observations.

Implementers must respect this split: an observation in `~/.arcforge/observations/` may be retired aggressively; a candidate event in `~/.arcforge/learning/candidates/queue.jsonl` is product state and must not be silently dropped. The split is not an organizational accident — it expresses different retention contracts and different relationships to runtime influence.

## Artifact terminology (Manifest / Record / Event)

Three artifact patterns appear across layers and must be named consistently:

- **Manifest** — pre-handoff metadata describing the *input* a layer received. Examples: Layer 3 `CuratorBatchManifest` (what evidence went into the batch), Layer 4 `CuratorRunManifest` (what batch + policy went into the LLM run).
- **Record** — post-side-effect proof a layer wrote. Examples: Layer 7 `MaterializationRecord` (what draft files were written), Layer 8 `ActivationRecord` (what active surface was changed).
- **Event** — append-only lifecycle line in Layer 5's `queue.jsonl`. Captures `candidate.created`, `candidate.transitioned`, `candidate.updated`, `candidate.related`.

The three concepts are genuinely different (input metadata, output proof, lifecycle log line). Use the right noun for the right artifact. Do not call a Layer 7 materialization output a "manifest", and do not call a Layer 5 lifecycle event a "record".

## Daemon role

The bash daemon (`skills/arc-observing/scripts/observer-daemon.sh`) is a Layer 3+4 orchestrator and a Layer 5 consumer. It is not a schema authority at any layer.

Specifically, the daemon:

- triggers Layer 3 batch assembly (Node CLI call);
- triggers Layer 4 prompt assembly + LLM curator invocation (bash spawns `claude -p`, wrapped in a watchdog);
- hands the LLM proposal payload to Layer 5 (Node CLI call) for validation, sanitization, dedupe, and queue append.

The daemon does not own validation logic, schema definitions, sanitizer rules, or lifecycle state. Those live in shared Node modules (`scripts/lib/sanitize-observation.js`, `scripts/lib/learning-curator/*.js`) that other entrypoints — `/recall`, `/reflect`, dashboard `[Evolve]` — also call. See the implementation plan's "Daemon Redesign Depth" section for the full division of responsibility.

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
