# Layer 3 — Curator Batch Assembly

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 3 turns approved evidence stores into one bounded input packet for Layer 4.

It answers:

```text
What safe, bounded evidence should the LLM curator see for this run?
```

Layer 3 is deterministic. It may select, group, summarize, count, and bound evidence, but it must not decide that a behavior should become a learning candidate. Frequency and pattern counts are context for Layer 4, not verdicts.

Primary architecture segment:

```text
Layer 1/2 composed observations
+ diary / reflect / recall / transcript-summary evidence
→ Curator Batch Assembler
→ CuratorBatch
→ Layer 4 LLM Curator Analysis
```

Layer 3 in 3.1 schema v1 is one-way. It does not receive lifecycle feedback from Layer 5, Layer 6, Layer 7, or Layer 8.

## Responsible actor

```text
Deterministic Curator Batch Assembler
```

The daemon may invoke this actor, but the daemon is not the schema owner. Layer 3's actor is the deterministic transform that reads approved sources and emits the bounded `CuratorBatch` plus required audit manifest.

Conceptual component names:

```text
Curator Batch Assembler
Evidence Selector
Batch Manifest Writer
```

Implementation file names are deliberately not fixed by this schema, but implementation should keep this actor separate from LLM prompting and candidate queue ownership.

## Inputs

Layer 3 in 3.1 schema v1 may read only approved evidence stores:

- composed observation records from `~/.arcforge/observations/<project>/observations.jsonl`;
- diary evidence;
- reflect evidence;
- recall evidence;
- bounded transcript-derived summaries, if such summaries exist.

Layer 3 in 3.1 schema v1 must not read:

- Layer 5 candidate queue;
- Layer 6 dashboard decisions;
- Layer 7 materialization registry;
- Layer 8 active surface;
- quarantine paths;
- raw hook payloads;
- raw full transcripts by default.

Conceptual source bundle:

```ts
type CuratorBatchInputSources = {
  observations?: ObservationEvidenceSource;
  diaries?: DiaryEvidenceSource;
  reflections?: ReflectEvidenceSource;
  recalls?: RecallEvidenceSource;
  transcript_summaries?: TranscriptSummarySource;
};
```

If an approved source type is not implemented or not available, Layer 3 records that fact in `source_windows` / `omissions`; it must not fabricate substitute evidence.

## Evidence item contract

Each item handed to Layer 4 must have an `evidence_id`, an `evidence_type`, and a `source_ref`. Layer 4 proposals may cite only `evidence_id`s present in the batch.

```ts
type CuratorEvidenceItem =
  | ObservationEvidenceItem
  | DiaryEvidenceItem
  | ReflectEvidenceItem
  | RecallEvidenceItem
  | TranscriptSummaryEvidenceItem;
```

### Observation evidence item

Observation items are derived from Layer 1 + Layer 2 composed records. Layer 3 must not pass whole observation records to the LLM curator.

```ts
type ObservationEvidenceItem = {
  evidence_id: string;
  evidence_type: "observation";

  ts: string;
  session: string;
  project: string;
  project_id: string;

  event: "tool_start" | "tool_end";
  tool: string;

  operation_kind?: string;
  derived?: {
    command_kind?: string;
    path_class?: string;
    file_kind?: string;
  };

  input_summary?: string;
  path_summary?: string;
  pattern_summary?: string;
  skill?: string;

  outcome?: "success" | "error" | "unknown";
  output_bytes?: number;

  evidence_status:
    | "present"
    | "omitted_no_input"
    | "omitted_unsupported_tool"
    | "omitted_safety";

  source_ref: {
    store: "observations.jsonl";
    line_ref?: string;
    source_hash?: string;
  };
};
```

`input_summary`, `path_summary`, and `pattern_summary` are bounded safe summaries. They are not authorization to include raw command payloads, file contents, edit bodies, response bodies, or skill args.

### Diary evidence item

Diary evidence is high-signal session memory, but the default production Layer 3 batch should include bounded summary fields rather than an unrestricted diary body.

```ts
type DiaryEvidenceItem = {
  evidence_id: string;
  evidence_type: "diary";

  diary_id: string;
  session?: string;
  project: string;
  project_id: string;
  created_at: string;

  title?: string;
  summary: string;
  key_points?: string[];
  user_corrections?: string[];
  verification_notes?: string[];

  source_ref: {
    store: "diary";
    path_hash?: string;
    content_hash?: string;
  };
};
```

Full diary bodies are not default production Layer 3 product state. If full bodies are retained for replay/debug, they belong only in an explicit debug/audit snapshot with retention.

### Reflect evidence item

Reflect evidence represents deterministic or LLM-authored cross-session pattern output from the existing reflection flow. Layer 3 may pass it as supporting evidence, but must not treat it as a final candidate.

```ts
type ReflectEvidenceItem = {
  evidence_id: string;
  evidence_type: "reflect";

  reflect_id: string;
  project: string;
  project_id: string;
  created_at: string;

  pattern_summary: string;
  supporting_sessions: string[];
  support_count: number;

  confidence_hint?: "low" | "medium" | "high";

  source_ref: {
    store: "reflect";
    path_hash?: string;
    content_hash?: string;
  };
};
```

`confidence_hint` is an input hint only. It is not the final candidate `evidence_quality`.

### Recall evidence item

Recall evidence is manually or explicitly captured learning material. It should be preserved as a high-signal input, but Layer 3 still only packages it for Layer 4.

```ts
type RecallEvidenceItem = {
  evidence_id: string;
  evidence_type: "recall";

  recall_id: string;
  project: string;
  project_id: string;
  created_at: string;

  user_authored: boolean;
  summary: string;
  body_summary?: string;
  intended_scope?: "project" | "global" | "unknown";

  source_ref: {
    store: "recall";
    path_hash?: string;
    content_hash?: string;
  };
};
```

### Transcript summary evidence item

Transcript evidence is summary-only by default. Raw full transcript capture is out of the default production Layer 3 path.

```ts
type TranscriptSummaryEvidenceItem = {
  evidence_id: string;
  evidence_type: "session_summary";

  session: string;
  project: string;
  project_id: string;
  created_at: string;

  user_intent_summary: string;
  assistant_behavior_summary?: string;
  outcome_summary?: string;
  correction_summary?: string;
  verification_summary?: string;

  source_ref: {
    store: "transcript_summary";
    summary_hash: string;
  };
};
```

If transcript summaries are not implemented in 3.1 schema v1, the batch manifest must say so explicitly, for example:

```json
{
  "transcript_summaries": {
    "available": false,
    "unavailable_reason": "source_not_implemented"
  }
}
```

## Primary output — CuratorBatch

Layer 3's primary output is a `CuratorBatch`.

A `CuratorBatch` is not a project, not a candidate, not queue state, and not an activation decision. It is one bounded input packet for one Layer 4 curator run.

```ts
type CuratorBatch = {
  schema_version: 1;

  batch_id: string;
  created_at: string;

  scope: CuratorBatchScope;
  selection_policy: CuratorBatchSelectionPolicy;
  source_windows: CuratorBatchSourceWindows;

  evidence_items: CuratorEvidenceItem[];

  aggregate_context: CuratorAggregateContext;
  quality_inputs: CuratorEvidenceQualityInputs;
  limits: CuratorBatchLimits;
  omissions: CuratorBatchOmission[];
  safety: CuratorBatchSafetyMetadata;
};
```

### Scope

For 3.1 schema v1, Layer 3 batches are project-scoped only.

```ts
type CuratorBatchScope = {
  kind: "project";
  project: string;
  project_id: string;
};
```

Global batches should not be introduced until global source, review, promotion, and activation contracts are designed. Manual project-to-global promotion belongs to later lifecycle layers, not to Layer 3 in 3.1 schema v1.

### Selection policy

Layer 3 must make its selection policy explicit so future implementations do not hide product behavior in unreviewed heuristics.

```ts
type CuratorBatchSelectionPolicy = {
  policy_version: string;

  max_observations: number;
  max_diaries: number;
  max_reflections: number;
  max_recalls: number;
  max_transcript_summaries: number;

  time_window?: {
    since?: string;
    until?: string;
  };

  session_window?: {
    max_sessions?: number;
    session_ids?: string[];
  };

  selection_rules: Array<
    | "recent"
    | "error_repair_sequences"
    | "repeated_tool_sequences"
    | "user_corrections"
    | "manual_recall_priority"
    | "reflect_patterns"
    | "diary_highlights"
  >;

  ordering:
    | "chronological"
    | "recency_then_signal"
    | "signal_then_recency";

  deterministic: true;
};
```

### Source windows

Source windows record what was scanned, selected, omitted, or unavailable.

```ts
type CuratorBatchSourceWindows = {
  observations?: {
    store: "observations.jsonl";
    from_ts?: string;
    to_ts?: string;
    records_scanned: number;
    records_selected: number;
    records_omitted: number;
  };

  diaries?: {
    records_scanned: number;
    records_selected: number;
  };

  reflections?: {
    records_scanned: number;
    records_selected: number;
  };

  recalls?: {
    records_scanned: number;
    records_selected: number;
  };

  transcript_summaries?: {
    available: boolean;
    records_scanned?: number;
    records_selected?: number;
    unavailable_reason?: string;
  };
};
```

### Aggregate context

Layer 3 may include deterministic aggregate context. This supports Layer 4 reasoning, but it must not contain candidate recommendations.

```ts
type CuratorAggregateContext = {
  session_count: number;
  observation_count: number;

  tool_counts?: Record<string, number>;
  command_kind_counts?: Record<string, number>;
  outcome_counts?: Record<"success" | "error" | "unknown", number>;

  repeated_sequences?: Array<{
    sequence: string[];
    count: number;
    example_evidence_ids: string[];
  }>;

  error_repair_patterns?: Array<{
    summary: string;
    count: number;
    example_evidence_ids: string[];
  }>;

  user_correction_markers?: Array<{
    summary: string;
    evidence_ids: string[];
  }>;
};
```

Forbidden aggregate fields include `recommended_candidate`, `candidate_summary`, `should_activate`, or any equivalent candidate verdict.

### Quality inputs

Layer 3 provides deterministic quality inputs. Layer 5 calculates final candidate `evidence_quality` from the evidence actually cited by each validated proposal.

```ts
type CuratorEvidenceQualityInputs = {
  project_observation_count: number;

  selected_evidence_count: number;

  selected_by_type: {
    observation: number;
    diary: number;
    reflect: number;
    recall: number;
    session_summary: number;
  };

  session_span: {
    session_count: number;
    first_ts?: string;
    last_ts?: string;
  };

  signal_mix: {
    has_user_correction: boolean;
    has_manual_recall: boolean;
    has_reflect_pattern: boolean;
    has_error_repair_sequence: boolean;
    has_repeated_observation_sequence: boolean;
  };
};
```

Layer 3 must not assign final `evidence_quality: "high" | "medium" | "low"`.

### Limits

Every batch must be bounded.

```ts
type CuratorBatchLimits = {
  max_items: number;
  max_chars_total: number;
  max_chars_per_item: number;
  truncation_applied: boolean;
};
```

### Omissions

Layer 3 records why approved source evidence was omitted from the batch.

```ts
type CuratorBatchOmission = {
  reason:
    | "over_item_limit"
    | "over_char_limit"
    | "unsafe_for_llm"
    | "unsupported_source"
    | "quarantine_excluded"
    | "missing_source"
    | "duplicate_low_value"
    | "outside_time_window";

  source_type:
    | "observation"
    | "diary"
    | "reflect"
    | "recall"
    | "session_summary";

  count: number;
  detail?: string;
};
```

### Safety metadata

Layer 3 marks what the Layer 4 LLM is allowed to see and records the sanitizer policy used to prepare the batch.

```ts
type CuratorBatchSafetyMetadata = {
  llm_visible: true;

  raw_hook_payloads_included: false;
  raw_transcripts_included: false;
  raw_response_bodies_included: false;
  edit_bodies_included: false;
  skill_args_included: false;
  quarantine_sources_included: false;

  sanitizer_policy_version: string;
};
```

This metadata supports evals that assert Layer 4 never receives raw hook payloads, raw transcripts, raw response bodies, edit bodies, skill args, or quarantined sources.

## Batch identity

`batch_id` identifies one Layer 3 → Layer 4 handoff. It exists for traceability, not because a batch necessarily combines a fixed number of evidence sources.

Recommended shape:

```text
batch_<compact UTC created_at>_<12-char source/policy hash>
```

Example:

```text
batch_20260509T041530Z_a1b2c3d4e5f6
```

The short id hash should be derived from canonical source identity and selection policy, not from random UUID alone and not from the full raw evidence store.

A separate `batch_hash` records the SHA-256 digest of the canonical full `CuratorBatch` body handed to Layer 4.

```text
batch_id   = human/file-friendly trace key
batch_hash = full handoff integrity digest
```

## Persisted artifacts

Layer 3 has three artifact levels:

| Artifact | Default persistence | Purpose |
|---|---:|---|
| `CuratorBatch` in memory | Ephemeral | Actual bounded input passed to Layer 4. |
| `CuratorBatchManifest` | Required | Audit metadata: source windows, selection policy, counts, quality inputs, `batch_id`, `batch_hash`. |
| `CuratorBatchSnapshot` | Optional debug/audit only | Full bounded batch body for replay/debug/eval. |

### Required manifest

Layer 3 must persist a `CuratorBatchManifest` for every Layer 3 → Layer 4 handoff.

Recommended path:

```text
~/.arcforge/learning/curator-batches/<batch_id>.manifest.json
```

Manifest schema:

```ts
type CuratorBatchManifest = {
  schema_version: 1;

  batch_id: string;
  created_at: string;

  scope: CuratorBatchScope;
  batch_hash: string;

  selection_policy: CuratorBatchSelectionPolicy;
  source_windows: CuratorBatchSourceWindows;
  quality_inputs: CuratorEvidenceQualityInputs;
  limits: CuratorBatchLimits;
  omissions: CuratorBatchOmission[];
  safety: CuratorBatchSafetyMetadata;

  handed_to_layer4: boolean;
  layer4_run_id?: string;

  snapshot_saved: boolean;
  snapshot_path?: string;
  retention_expires_at?: string;
};
```

### Optional snapshot

A full bounded `CuratorBatchSnapshot` may be persisted only when explicit audit/debug retention is enabled.

Recommended path:

```text
~/.arcforge/learning/curator-batches/debug/<batch_id>.batch.json
```

Snapshot rules:

- default off;
- local-only;
- retention-bound;
- excluded from default production Layer 3 source readers;
- never primary evidence for future learning runs;
- useful for eval, replay, and debugging Layer 4 behavior.

## Consumers

Layer 4 is the only default production direct consumer of the in-memory `CuratorBatch`.

Layer 5 may later read Layer 3 manifest metadata indirectly through Layer 4 proposal source references and validation paths, but Layer 5 must not treat the manifest as a candidate source. Candidate identity and lifecycle belong to Layer 5.

Dashboard diagnostics may display manifest summaries later, but browser payloads must use a dashboard-safe view and must not expose full batch bodies by default.

## Forbidden behavior

Layer 3 must not:

- read Layer 5 candidate queue;
- read Layer 6 dashboard decisions;
- read Layer 7 materialization registry;
- read Layer 8 active surface;
- read quarantine paths;
- read raw hook payloads;
- read raw full transcripts by default;
- call an LLM;
- generate candidates;
- assign candidate IDs;
- dedupe candidate records;
- assign final `evidence_quality`;
- materialize files;
- activate runtime behavior;
- inject anything into Claude runtime context.

Lifecycle suppression hints are out of scope for Layer 3 in 3.1 schema v1. Duplicate suppression belongs to Layer 5 validation/dedupe unless a future explicit lifecycle feedback lane is added to the architecture.

## Flow diagram mapping

Layer 3 maps to the bounded handoff between evidence stores and the LLM curator:

```text
Evidence Stores
→ Curator Batch Assembler
→ CuratorBatch
→ LLM Curator
```

The flow diagram should label this node as:

```text
Layer 3: bounded evidence packet only
```

Do not add these edges in 3.1 schema v1:

```text
Candidate Queue → Curator Batch Assembler
Dashboard Decisions → Curator Batch Assembler
Active Surface → Curator Batch Assembler
```

Those are possible future feedback lanes only after explicit schema and flow decisions.

## Acceptance criteria for Layer 3 contract

1. Layer 3 only reads approved evidence stores.
2. Layer 3 never reads quarantine paths.
3. Layer 3 never reads Layer 5 / Layer 6 / Layer 7 / Layer 8 lifecycle state in 3.1 schema v1.
4. Layer 3 emits exactly one bounded `CuratorBatch` per Layer 4 run.
5. Every evidence item has `evidence_id`, `evidence_type`, and `source_ref`.
6. Layer 4 proposals may cite only `evidence_id`s present in the batch.
7. Full `CuratorBatch` is ephemeral by default.
8. `CuratorBatchManifest` is persisted for every handoff.
9. Optional snapshot is debug/audit only, retention-bound, and excluded from default production learning readers.
10. Batch includes safety metadata proving raw hook payloads, raw transcripts, response bodies, edit bodies, skill args, and quarantine sources were not included.
11. Layer 3 provides quality inputs, but does not assign final candidate `evidence_quality`.
12. Layer 3 aggregate context is allowed, but must not contain candidate recommendations.

## Open questions

1. Should 3.1 schema v1 implement bounded transcript summaries before daemon candidate generation, or should transcript summaries remain an explicit unavailable source until a later slice?
2. What exact default limits should 3.1 schema v1 use for `max_observations`, `max_diaries`, `max_reflections`, `max_recalls`, `max_transcript_summaries`, `max_chars_total`, and `max_chars_per_item`?
3. Should `line_ref` be a physical line number, a stable per-record hash, or an opaque reader cursor for `observations.jsonl` evidence refs?
4. Should dashboard diagnostics expose manifest summaries in 3.1 schema v1, or keep Layer 3 manifests CLI/debug-only until Layer 6 schema is locked?

---
