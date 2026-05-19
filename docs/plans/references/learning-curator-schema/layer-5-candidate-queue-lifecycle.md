# Layer 5 — Candidate Queue + Lifecycle

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 5 is the deterministic candidate authority for the learning system.

It answers:

```text
Can this proposal become a canonical candidate?
If yes, what are its identity, evidence, quality, relationships, and lifecycle state?
```

Layer 5 is the integration point for all candidate-producing entrypoints:

```text
Layer 4 LLM curator proposal
manual recall
reflect result
dashboard [Evolve]
future import / repair paths
→ Layer 5 validation + normalization + dedupe + lifecycle
```

Layer 5 is not merely a receiver for Layer 4. It owns the single canonical candidate schema and lifecycle state machine. Deferred source adapters may be implemented later, but they must target this same Layer 5 contract.

Primary architecture segment:

```text
Candidate-producing entrypoints
→ Layer 5 Schema / Safety / Evidence / Dedupe Gate
→ append-only candidate event log
→ Layer 6 Dashboard Review Control Plane
→ Layer 7 Materialization
→ Layer 8 Activation / Runtime Influence Surface
```

Layer 5 can record lifecycle state, but it must not perform materialization or activation side effects.

## Responsible actor

```text
Deterministic candidate authority
```

Conceptually, Layer 5 has these deterministic components:

```text
Candidate Source Adapter
Candidate Validator
Candidate Normalizer
Evidence Ref Verifier
Evidence Quality Calculator
Candidate Deduper
Lifecycle State Machine
Candidate Store Writer
Current View Rebuilder
```

The daemon, dashboard, materializer, and activation code may call into Layer 5, but they are not the schema authority. Layer 5 owns accepted candidate identity and lifecycle rules.

## Inputs

Layer 5 accepts candidate-producing inputs through explicit source adapters.

```ts
type CandidateQueueInput =
  | Layer4CandidateProposalInput
  | ManualRecallCandidateInput
  | ReflectCandidateInput
  | DashboardPromoteCandidateInput
  | DashboardEvolveCandidateInput
  | FutureImportOrRepairCandidateInput;
```

The first 3.1 implementation slice requires both the Layer 4 source adapter and the dashboard promotion source adapter:

```ts
type Layer4CandidateProposalInput = {
  source_type: "layer4_llm_curator";

  run_manifest: CuratorRunManifest;
  batch_manifest: CuratorBatchManifest;
  proposal_payload: CandidateProposalPayload;
};

type DashboardPromoteCandidateInput = {
  source_type: "dashboard_promote";
  action_id: string;
  source_candidate_id: string;
  expected_source_scope: { kind: "project"; project_id: string };
  target_scope: { kind: "global" };
  reason?: string;
};
```

Additional adapters must still target the same canonical candidate schema. Manual recall, reflect, dashboard evolve, and import/repair adapters may be implemented in later slices without changing the Layer 5 record shape:

```ts
type ManualRecallCandidateInput = {
  source_type: "manual_recall";
  recall_id: string;
  scope: CandidateScope;
  proposal: CandidateProposalLike;
};

type ReflectCandidateInput = {
  source_type: "reflect";
  reflect_id: string;
  scope: CandidateScope;
  proposal: CandidateProposalLike;
};

type DashboardEvolveCandidateInput = {
  source_type: "dashboard_evolve";
  action_id: string;
  source_candidate_ids: string[];
  proposal: CandidateProposalLike;
};

type FutureImportOrRepairCandidateInput = {
  source_type: "future_import_or_repair";
  import_id: string;
  scope: CandidateScope;
  proposal: CandidateProposalLike;
};
```

`CandidateProposalLike` is an adapter-local shape. It is not a persisted product schema. The adapter must normalize it into `CandidateQueueRecord` before queue insertion.

Layer 5 must not accept direct writes to `queue.jsonl` from candidate-producing entrypoints. All accepted records must pass through Layer 5 validation, normalization, evidence verification, dedupe, identity assignment, and lifecycle initialization.

## Validation gate

Layer 5 is the first final schema authority. It validates before queue insertion.

For Layer 4 proposals, Layer 5 validates:

- source manifest exists;
- source type is allowed;
- proposal payload is parseable;
- proposal source matches the run manifest;
- `batch_id` and `batch_hash` match the batch manifest;
- `proposal_index` is unique within the payload;
- `artifact_type` is allowed by the source policy;
- scope is allowed by the source policy;
- required fields are present;
- string lengths are within source policy limits;
- body passes safety checks;
- every `evidence_id` exists in the source `CuratorBatch`;
- every cited `evidence_type` matches the source batch item;
- evidence ref count satisfies min/max policy;
- no raw secret reconstruction is present;
- no activation claim is present;
- no file-write claim is present;
- dedupe key is not already occupied by a non-terminal candidate.

For dashboard promotion inputs, Layer 5 validates:

- source candidate exists in the current Layer 5 view;
- source candidate scope is `project` and matches `expected_source_scope.project_id`;
- target scope is exactly `global`;
- source candidate is non-terminal unless the dashboard explicitly allows promoting from terminal states in a later policy;
- source candidate body and safety metadata are still valid for copying into a global candidate;
- no existing non-terminal global candidate has the same dedupe key;
- promotion relationship is not already recorded for the same source candidate;
- promotion creates a new candidate ID and does not overwrite the source candidate.

Layer 4 advisory fields never auto-transition lifecycle state:

```text
llm_confidence             → advisory only
recommended_review_action  → advisory only
risk_notes                 → advisory only
uncertainty_notes          → advisory only
```

Accepted candidates always start at `pending_review`.

## Rejected proposal handling

Rejected proposals are not candidates.

Invalid proposal records must not enter `queue.jsonl`. They are written to the rejection audit log:

```text
~/.arcforge/learning/candidates/rejections.jsonl
```

`rejections.jsonl` is:

- append-only Layer 5 validation audit;
- not product candidate state;
- not a dashboard candidate list;
- not future learning evidence;
- excluded from default production Layer 3 / Layer 4 / Layer 7 / Layer 8 readers.

```ts
type CandidateRejectionRecord = {
  schema_version: 1;

  rejection_id: string;
  rejected_at: string;

  source: CandidateSourceRef;

  proposal_index?: number;
  proposal_hash?: string;

  reasons: CandidateRejectionReason[];

  scope?: CandidateScope;
  artifact_type?: string;
  normalized_name?: string;

  duplicate_of_candidate_id?: string;

  safety: RejectionSafetyMetadata;

  raw_proposal_saved: false;
};
```

```ts
type CandidateRejectionReason = {
  code:
    | "schema_invalid"
    | "artifact_type_not_allowed"
    | "scope_not_allowed"
    | "missing_required_field"
    | "field_too_long"
    | "evidence_ref_missing"
    | "evidence_type_mismatch"
    | "too_few_evidence_refs"
    | "too_many_evidence_refs"
    | "unsafe_content"
    | "secret_reconstruction"
    | "activation_claim"
    | "file_write_claim"
    | "duplicate_candidate"
    | "source_manifest_missing"
    | "source_hash_mismatch"
    | "policy_violation";

  field_path?: string;
  detail?: string;
};
```

`detail` must be sanitized and bounded. It must not contain raw prompt text, raw response text, raw evidence bodies, transcript bodies, hook payloads, file contents, or secrets.

```ts
type RejectionSafetyMetadata = {
  raw_prompt_included: false;
  raw_response_included: false;
  raw_hook_payloads_included: false;
  raw_transcripts_included: false;
  edit_bodies_included: false;
  skill_args_included: false;

  secret_scan?: {
    status: "passed" | "rejected" | "not_run";
    rule_version: string;
  };
};
```

Raw proposal persistence is disabled by default. If explicit debug capture is added, it belongs only under:

```text
~/.arcforge/learning/candidates/debug/rejections/<rejection_id>.proposal.json
```

Debug rejection artifacts are default-off, local-only, retention-bound, excluded from default production readers, and never future learning evidence.

## Primary output — canonical candidate record

Layer 5's primary accepted-output record is the canonical `CandidateQueueRecord`. Accepted candidates are represented by one canonical read model:

```ts
type CandidateQueueRecord = {
  schema_version: 1;

  candidate_id: string;
  created_at: string;
  updated_at: string;

  artifact_type:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition";

  scope: CandidateScope;

  source: CandidateSourceRef;

  name: string;
  summary: string;
  rationale: string;

  domain:
    | "workflow"
    | "tool-preference"
    | "error-handling"
    | "code-style"
    | "verification"
    | "privacy-safety"
    | "other";

  trigger?: string;

  body: string;

  body_source:
    | "llm_curator"
    | "manual_recall"
    | "reflect"
    | "dashboard_evolve";

  evidence: CandidateEvidenceRef[];

  llm_assessment?: {
    llm_confidence?: "low" | "medium" | "high";
    risk_notes?: string[];
    uncertainty_notes?: string[];
    recommended_review_action?:
      | "review"
      | "dismiss"
      | "needs_more_evidence";
  };

  evidence_quality: "high" | "medium" | "low";
  evidence_quality_metadata: EvidenceQualityMetadata;

  lifecycle: CandidateLifecycleState;

  relationships?: CandidateRelationships;

  safety: CandidateSafetyMetadata;

  dedupe: CandidateDedupeMetadata;
};
```

This record is the canonical read model for Layer 6, Layer 7, and Layer 8. It is created by replaying candidate events from `queue.jsonl` or by reading a derived cache that was rebuilt from the same event log.

## Candidate source ref

Layer 5 preserves provenance without treating the source as authoritative candidate state.

```ts
type CandidateSourceRef = {
  source_type:
    | "layer4_llm_curator"
    | "manual_recall"
    | "reflect"
    | "dashboard_promote"
    | "dashboard_evolve"
    | "future_import_or_repair";

  layer4?: {
    run_id: string;
    batch_id: string;
    batch_hash: string;
    proposal_index: number;
    proposal_payload_hash: string;
    prompt_policy_version: string;
    model?: string;
    provider?: string;
  };

  recall?: {
    recall_id: string;
  };

  reflect?: {
    reflect_id: string;
  };

  evolve?: {
    action_id: string;
    source_candidate_ids: string[];
  };

  promote?: {
    action_id: string;
    source_candidate_id: string;
    source_candidate_hash: string;
    source_project_id: string;
  };

  import_or_repair?: {
    import_id: string;
  };
};
```

## Scope

For 3.1 schema v1, accepted candidates may be project-scoped or global-scoped:

```ts
type CandidateScope =
  | {
      kind: "project";
      project: string;
      project_id: string;
    }
  | {
      kind: "global";
      promoted_from_candidate_id: string;
      promoted_from_project_id: string;
    };
```

Daemon / Layer 4 proposals must create project-scoped candidates only. Global candidates are first-slice product behavior, but they are created only by an explicit Layer 6 dashboard `[Promote]` action through the `dashboard_promote` source adapter.

Promotion creates a new canonical candidate record with:

- `scope.kind: "global"`;
- `source.source_type: "dashboard_promote"`;
- `source.promote.source_candidate_id` and `source.promote.source_project_id`;
- `relationships.promoted_from_candidate_id` on the global candidate;
- `relationships.promoted_to_candidate_id` recorded on the source project candidate through a `candidate.related` event.

Promotion does not activate behavior, does not materialize files, and does not mutate the original candidate body except for deterministic scope/relationship metadata required by the global candidate record.

## Evidence normalization

Layer 4 proposals cite only:

```text
evidence_id
evidence_type
relevance
```

Layer 5 looks up the cited evidence in the source batch and normalizes it into safe candidate evidence refs:

```ts
type CandidateEvidenceRef = {
  evidence_id: string;

  evidence_type:
    | "observation"
    | "session_summary"
    | "diary"
    | "reflect"
    | "recall";

  source_batch_id?: string;
  source_batch_hash?: string;

  relevance: string;
  summary: string;

  source_ref?: {
    store:
      | "observations.jsonl"
      | "diary"
      | "reflect"
      | "recall"
      | "transcript_summary";
    source_hash?: string;
    line_ref?: string;
  };

  project_obs_count?: number;
};
```

Layer 5 must not persist raw evidence bodies:

- raw hook payloads;
- raw transcripts;
- raw LLM prompts;
- raw LLM responses;
- full file contents;
- Edit / Write bodies;
- skill args.

## Evidence quality

Layer 5 owns final deterministic `evidence_quality`.

Layer 4 `llm_confidence` is advisory and cannot set final quality.

Initial 3.1 schema v1 rule:

```text
project_obs_count >= 1000  → high
100 <= project_obs_count < 1000  → medium
project_obs_count < 100  → low
```

Layer 5 also stores the rule basis:

```ts
type EvidenceQualityMetadata = {
  rule_version: string;

  basis: {
    project_obs_count: number;
    cited_evidence_count: number;

    cited_evidence_by_type: {
      observation: number;
      diary: number;
      reflect: number;
      recall: number;
      session_summary: number;
    };

    has_user_correction: boolean;
    has_manual_recall: boolean;
    has_reflect_pattern: boolean;
    has_error_repair_sequence: boolean;
  };
};
```

The metadata allows later weighting changes without changing the candidate record shape.

## Candidate identity

Layer 5 assigns `candidate_id`.

```text
candidate_id = cand_<artifact_type>_<UTC compact timestamp>_<12-char canonical hash>
```

Example:

```text
cand_instinct_20260510T013000Z_a1b2c3d4e5f6
```

The canonical hash should be derived from the normalized source proposal fields that define candidate identity, not from transient event log metadata.

## Dedupe metadata

Candidate identity and semantic dedupe are separate.

```ts
type CandidateDedupeMetadata = {
  dedupe_key: string;

  dedupe_basis: {
    scope_kind: "project" | "global";
    project_id?: string;
    artifact_type: string;
    normalized_name: string;
    normalized_trigger?: string;
    normalized_body_hash: string;
  };

  duplicate_of?: string;
};
```

`candidate_id` is record identity. `dedupe_key` prevents duplicate non-terminal candidates.

A proposal rejected as duplicate may reference `duplicate_of_candidate_id` in `CandidateRejectionRecord`, but that does not create candidate relationship state.

## Lifecycle state

Layer 5 owns the lifecycle state machine.

```ts
type CandidateLifecycleStatus =
  | "pending_review"
  | "needs_more_evidence"
  | "dismissed"
  | "approved"
  | "materialized"
  | "activated"
  | "deactivated"
  | "superseded";
```

Accepted candidates start at:

```text
pending_review
```

```ts
type CandidateLifecycleState = {
  status: CandidateLifecycleStatus;
  status_changed_at: string;

  review?: {
    reviewer?: "dashboard" | "cli";
    approved_at?: string;
    dismissed_at?: string;
    needs_more_evidence_at?: string;
    reason?: string;
  };

  materialization?: {
    materialized_at?: string;
    materialization_id?: string;
    draft_artifact_ids?: string[];
  };

  activation?: {
    activated_at?: string;
    activation_id?: string;
    active_artifact_ids?: string[];
    deactivated_at?: string;
  };

  superseded_by?: string;
};
```

State meanings:

```text
pending_review      = accepted candidate awaiting user review
needs_more_evidence = user or deterministic rule requires more evidence before review
approved            = user accepts candidate for drafting; no behavior change
materialized        = inactive draft exists; no behavior change
activated           = runtime influence changed through explicit Layer 8 action
deactivated         = previously active behavior was deactivated
superseded          = replaced by another candidate / artifact
dismissed           = rejected by reviewer; terminal by default
```

## State transitions

Allowed transitions:

```text
pending_review
  → approved
  → dismissed
  → needs_more_evidence

needs_more_evidence
  → pending_review
  → dismissed

approved
  → materialized
  → dismissed

materialized
  → activated
  → dismissed
  → superseded

activated
  → deactivated
  → superseded

deactivated
  → activated
  → superseded

dismissed
  terminal by default

superseded
  terminal by default
```

Invalid transitions fail closed:

```text
write no lifecycle event
return validation error
```

Layer 5 may record successful `materialized`, `activated`, `deactivated`, and `superseded` transitions reported by later layers, but it must not perform those side effects itself.

## Relationships

Promote, evolve, and supersede are represented primarily as relationships, not primary lifecycle statuses.

```ts
type CandidateRelationships = {
  promoted_from_candidate_id?: string;
  promoted_to_candidate_id?: string;

  evolved_from_candidate_ids?: string[];
  evolved_to_candidate_id?: string;

  supersedes_candidate_id?: string;
  superseded_by_candidate_id?: string;
};
```

Do not add primary lifecycle statuses named `promoted` or `evolved`. If a candidate is replaced, use relationship metadata and, when appropriate, the `superseded` lifecycle status.

## Candidate store file model

Layer 5 source of truth is append-only JSONL event logs, not one file per candidate.

Default production files:

```text
~/.arcforge/learning/candidates/queue.jsonl
~/.arcforge/learning/candidates/rejections.jsonl
~/.arcforge/learning/candidates/store.lock
```

Optional derived cache:

```text
~/.arcforge/learning/candidates/index.json
```

Ownership:

```text
queue.jsonl       = accepted candidate lifecycle source of truth
rejections.jsonl  = rejected proposal audit log
index.json        = derived / rebuildable cache
store.lock        = shared exclusive write lock
```

Per-candidate JSON files are not source of truth in 3.1 schema v1. They may exist only as derived debug/export artifacts.

If `queue.jsonl` and `index.json` disagree, `queue.jsonl` wins.

## Queue event log

Each `queue.jsonl` line is one event:

```ts
type CandidateQueueEvent = {
  schema_version: 1;

  event_id: string;
  ts: string;

  candidate_id: string;

  event_type:
    | "candidate.created"
    | "candidate.transitioned"
    | "candidate.updated"
    | "candidate.related";

  actor: {
    layer: 5 | 6 | 7 | 8;
    actor_type:
      | "validator"
      | "dashboard"
      | "materializer"
      | "activation";
  };

  previous_status?: CandidateLifecycleStatus;
  next_status?: CandidateLifecycleStatus;

  record?: CandidateQueueRecord;
  transition?: CandidateTransitionMetadata;
  patch?: Partial<CandidateQueueRecord>;
};
```

```ts
type CandidateTransitionMetadata = {
  reason?: string;
  action_id?: string;
  materialization_id?: string;
  activation_id?: string;
};
```

Creation event:

```ts
{
  event_type: "candidate.created",
  record: CandidateQueueRecord
}
```

Status transition event:

```ts
{
  event_type: "candidate.transitioned",
  previous_status: "pending_review",
  next_status: "approved",
  transition: {
    action_id: "dash_action_..."
  }
}
```

Current candidate state is derived by replaying `queue.jsonl` in event order.

## Derived index

Layer 5 may maintain a derived cache:

```ts
type CandidateIndex = {
  schema_version: 1;
  rebuilt_at: string;

  source_log_offsets: {
    queue_jsonl_bytes: number;
  };

  candidates: Record<string, CandidateQueueRecord>;
};
```

Rules:

- `index.json` is optional.
- `index.json` is rebuildable from `queue.jsonl`.
- Dashboard may use `index.json` for speed.
- If `index.json` is missing, stale, corrupt, or inconsistent with `queue.jsonl`, rebuild it from `queue.jsonl`.
- `index.json` must not become a second source of truth.

## Locking and atomicity

Layer 5 candidate-store writes use one shared exclusive lock:

```text
~/.arcforge/learning/candidates/store.lock
```

`queue.jsonl` and `rejections.jsonl` share this lock because a proposal validation result must be classified exactly once:

```text
accepted → append queue.jsonl
rejected → append rejections.jsonl
```

Contract:

- all Layer 5 candidate-store writes use exclusive `store.lock`;
- writes are append-only;
- each JSONL line is written atomically;
- partial trailing JSONL lines are invalid and ignored or repaired by deterministic recovery;
- malformed rejection log lines must not block queue operation;
- direct writes around Layer 5 are forbidden.

## Retention, rotation, and recovery

`queue.jsonl` is product state source of truth and should not be short-term pruned.

`rejections.jsonl` is retention-bound audit/debug state. A default implementation may choose a time or record-count limit, but the contract is:

```text
rejections.jsonl is not permanent product state.
```

Rotation/archive is allowed if replay semantics remain identical:

```text
queue.jsonl
queue.2026-05.jsonl.gz

rejections.jsonl
rejections.2026-05.jsonl.gz
```

Archived queue logs remain part of replayable source-of-truth history.

Recovery rules:

- malformed `queue.jsonl` lines must be surfaced as product-state corruption;
- malformed `rejections.jsonl` lines may be copied to a recovery file and skipped;
- partial trailing lines are ignored until repaired;
- rejection log corruption must not block queue reads.

Example recovery artifact:

```text
~/.arcforge/learning/candidates/rejections.corrupt.<timestamp>.jsonl
```

## Safety metadata

Layer 5 records what safety checks were applied to accepted candidates.

```ts
type CandidateSafetyMetadata = {
  validator_version: string;
  sanitizer_policy_version: string;

  raw_prompt_included: false;
  raw_response_included: false;
  raw_hook_payloads_included: false;
  raw_transcripts_included: false;
  edit_bodies_included: false;
  skill_args_included: false;

  secret_scan: {
    status: "passed" | "rejected";
    rule_version: string;
  };

  activation_claim_scan: {
    status: "passed" | "rejected";
  };

  file_write_claim_scan: {
    status: "passed" | "rejected";
  };
};
```

Layer 5 accepted records must not include raw unsafe material. Tests and evals should assert these flags and inspect persisted candidate records.

## Dashboard exposure of rejections

Layer 6 dashboard candidate lists must not read `rejections.jsonl` as candidates.

Layer 6 may expose a diagnostic-only rejection summary:

```ts
type RejectionDiagnosticsSummary = {
  total_recent_rejections: number;
  by_reason_code: Record<string, number>;
  by_source_type: Record<string, number>;
  last_rejected_at?: string;
};
```

Dashboard rejection drilldown, if added, must be allowlisted. Allowed fields:

- `rejection_id`;
- `rejected_at`;
- `source.source_type`;
- `proposal_index`;
- `reasons.code`;
- bounded `reasons.detail`;
- `artifact_type`;
- `normalized_name`;
- `scope.kind`;
- `scope.project_id`.

Forbidden fields:

- raw proposal body;
- raw prompt;
- raw response;
- raw evidence body;
- transcript body;
- hook payload;
- file contents;
- secrets.

## Consumers

Layer 6 Dashboard Review Control Plane:

- reads the current candidate view;
- presents pending/reviewable candidates;
- requests lifecycle transitions through Layer 5;
- may present diagnostic rejection summaries with allowlisted fields.

Layer 7 Materialization:

- reads approved candidates;
- writes inactive draft artifacts;
- reports successful materialization back through Layer 5 as a lifecycle event.

Layer 8 Activation / Runtime Influence Surface:

- reads materialized candidates and draft records;
- performs explicit activation / deactivation side effects;
- reports successful activation / deactivation back through Layer 5 as lifecycle events.

Layer 5 is state authority. Layer 6, Layer 7, and Layer 8 own their domain actions.

## Runtime influence boundary

The following states must not influence Claude runtime behavior:

```text
pending_review
needs_more_evidence
approved
materialized
dismissed
superseded
```

Runtime influence is allowed only after explicit Layer 8 activation produces an `activated` lifecycle event.

Layer 5 may record `activated`, but it must not inject candidate bodies, write runtime files, load skills, load commands, or alter `CLAUDE.md`.

## Forbidden behavior

Layer 5 must not:

- call an LLM;
- read raw transcripts;
- read raw hook payloads;
- read raw LLM prompt / response by default;
- persist raw evidence bodies;
- materialize files;
- activate runtime behavior;
- write skills / commands / agents;
- edit `CLAUDE.md`;
- inject candidate body into runtime context;
- auto-promote project candidates to global;
- treat LLM recommendations as automatic lifecycle transitions;
- expose rejected proposals as dashboard candidates;
- use per-candidate JSON files as source of truth.

## Flow diagram mapping

Layer 5 should be drawn as:

```text
Candidate-producing entrypoints
→ Candidate Queue + Lifecycle Authority
→ queue.jsonl / rejections.jsonl
→ Dashboard Review Control Plane
```

Label:

```text
Layer 5: canonical candidate authority + append-only lifecycle log
```

Do not draw these edges:

```text
LLM Curator → Dashboard Candidate List
LLM Curator → Materializer
Rejected Proposal → Candidate Queue
Candidate Queue → Runtime Context
Candidate Queue → Skill Files
Candidate Queue → CLAUDE.md
```

## Acceptance criteria

1. Every candidate-producing entrypoint targets Layer 5 canonical schema.
2. Layer 5 validates before queue insertion.
3. Invalid proposals go to `rejections.jsonl`, not `queue.jsonl`.
4. Accepted candidates receive Layer 5-assigned `candidate_id`.
5. Accepted candidates start at `pending_review`.
6. Layer 5 verifies all cited `evidence_id`s against source evidence.
7. Layer 5 computes final `evidence_quality`.
8. Layer 4 `llm_confidence` and `recommended_review_action` remain advisory.
9. Queue source of truth is append-only `queue.jsonl`.
10. Rejection audit source is append-only `rejections.jsonl`.
11. `queue.jsonl` and `rejections.jsonl` writes share `store.lock`.
12. Optional `index.json` is derived and rebuildable.
13. Per-candidate JSON files are not source of truth.
14. Layer 5 owns lifecycle state machine.
15. Layer 5 performs no materialization or activation side effects.
16. Pending, approved, and materialized candidates do not influence runtime.
17. Only explicit Layer 8 activation can create runtime influence.
18. Rejection records are retention-bound and never future learning evidence.
19. Dashboard candidate lists do not read `rejections.jsonl` as candidates.
20. Malformed rejection log lines cannot block candidate queue operation.
21. Explicit dashboard promotion creates a canonical global candidate through Layer 5, not a parallel store.
22. Daemon / Layer 4 proposals cannot directly create global candidates.

## First-slice defaults

The first 3.1 implementation slice uses these defaults unless a later reviewed plan changes them:

1. `rejections.jsonl` retention is bounded by **30 days**, **5,000 records**, or **10 MB**, whichever limit is reached first. Rotation/deletion must preserve local-only behavior and must not promote rejected proposal data into future learning evidence.
2. `queue.jsonl` rotation is **deferred** for the first slice. The append-only event log remains the source of truth; `index.json` is rebuildable and may be recreated whenever stale or corrupt.
3. `needs_more_evidence` is a **review/lifecycle action after candidate creation**, not a Layer 5 validation fallback. Proposals with too few valid evidence refs are rejected before queue insertion; accepted candidates start at `pending_review`.
4. First-slice field limits are:
   - `name`: 120 chars
   - `summary`: 600 chars
   - `rationale`: 2,000 chars
   - `trigger`: 600 chars
   - `body`: 6,000 chars
   - rejection `detail`: 500 chars
5. Dashboard `[Promote]` is enabled in the first slice. A valid project-scoped source candidate may create a new global-scoped candidate with `relationships.promoted_from_candidate_id`; the source project candidate receives `relationships.promoted_to_candidate_id` via a `candidate.related` event. Promotion remains non-runtime and does not imply approval, materialization, or activation.
6. Duplicate detection compares all non-terminal candidates plus dismissed candidates from the last **30 days**. Older dismissed candidates do not block insertion, but may be surfaced as weak relationship/audit hints only after an explicit design.

## Deferred decisions

1. Long-term queue rotation/compaction policy for larger installations.
2. Whether `needs_more_evidence` may be assigned by future deterministic evidence-aging rules after a candidate has already entered the queue.
3. Whether dedupe should consider superseded/deactivated historical candidates beyond the first-slice dismissed-window rule.
4. Cross-machine global candidate portability beyond the local queue and explicit dashboard promotion model.
