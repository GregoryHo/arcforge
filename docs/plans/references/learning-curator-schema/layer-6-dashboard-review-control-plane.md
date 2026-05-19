# Layer 6 — Dashboard Review Control Plane

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 6 is the deterministic review/control surface for canonical candidates.

It answers:

```text
What can the reviewer safely see, and what lifecycle action is being explicitly requested?
```

Layer 6 is a control plane. It may render dashboard-safe candidate views and create explicit action requests, but it does not own candidate schema, write draft artifacts, or activate runtime behavior.

Primary architecture segment:

```text
Layer 5 current candidate view
→ Layer 6 dashboard-safe review model
→ explicit reviewer action request
→ Layer 5 lifecycle transition and/or Layer 7 / Layer 8 request
```

Layer 6 is the first layer where a human reviewer intentionally chooses a lifecycle action. It must preserve the Manual Activate boundary: dashboard review, approval, promote/evolve, and materialize requests are not runtime influence.

## Responsible actor

```text
Deterministic dashboard server + UI control plane
```

Conceptual components:

```text
Dashboard Read Model Builder
Dashboard Action Validator
Lifecycle Action Dispatcher
Dashboard-Safe Serializer
Review Audit Writer
```

The browser UI may initiate actions, but the server-side dashboard action validator owns the authoritative request shape. Client-side state is not trusted.

## Inputs

Layer 6 reads canonical candidate state from Layer 5 only:

```ts
type DashboardReviewInput = {
  schema_version: 1;

  request_id: string;
  requested_at: string;

  current_candidates: CandidateQueueRecord[];

  filters?: DashboardCandidateFilters;
  view_policy: DashboardViewPolicy;
};
```

```ts
type DashboardCandidateFilters = {
  scope_kind?: "project" | "global";
  project_id?: string;
  artifact_type?:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition";
  lifecycle_status?: CandidateLifecycleStatus[];
  evidence_quality?: Array<"high" | "medium" | "low">;
  source_type?: CandidateSourceRef["source_type"][];
};
```

Layer 6 must not read:

- raw observation stores;
- raw hook payloads;
- raw transcripts;
- Layer 3 full batch snapshots by default;
- Layer 4 raw prompts or raw responses by default;
- Layer 5 rejection records as candidate records;
- draft artifact bodies except through Layer 7 draft records / explicit draft preview endpoints;
- active runtime files as candidate state.

Diagnostic surfaces may use allowlisted Layer 3 / Layer 4 / rejection summaries, but those summaries are not candidate state and must not expose raw payloads.

## Dashboard view policy

Dashboard serialization is allowlist-based. It must have an explicit policy version:

```ts
type DashboardViewPolicy = {
  policy_version: string;

  default_list_includes_body: false;
  default_list_includes_raw_evidence: false;
  default_list_includes_local_paths: false;

  detail_view_allowed: boolean;
  max_body_preview_chars: number;
  max_evidence_summaries: number;
  max_evidence_summary_chars: number;

  expose_rejection_diagnostics: boolean;
  expose_batch_run_diagnostics: boolean;
};
```

Default list/card views must not include full `body`, raw evidence, transcript excerpts, local file paths, raw prompts, or raw LLM responses.

A detail endpoint may expose a bounded body preview or draft preview only when it is explicitly requested and still sanitized. Detail view is for reviewer understanding; it is not an authorization to bypass Layer 7 or Layer 8.

## Primary output — dashboard-safe candidate view

Layer 6 emits dashboard-safe read models derived from Layer 5 records:

```ts
type DashboardCandidateCard = {
  schema_version: 1;

  candidate_id: string;
  artifact_type:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition";

  scope: {
    kind: "project" | "global";
    project?: string;
    project_id?: string;
  };

  name: string;
  summary: string;
  rationale_summary?: string;
  trigger_summary?: string;
  domain: CandidateQueueRecord["domain"];

  lifecycle_status: CandidateLifecycleStatus;
  created_at: string;
  updated_at: string;

  evidence_quality: "high" | "medium" | "low";
  evidence_quality_chip?: "low_signal" | "medium_signal" | "high_signal";
  evidence_counts: {
    total: number;
    by_type: Record<string, number>;
  };

  risk_note_count: number;
  uncertainty_note_count: number;

  relationships?: CandidateRelationships;

  available_actions: DashboardActionKind[];
};
```

Optional detail model:

```ts
type DashboardCandidateDetail = DashboardCandidateCard & {
  rationale: string;
  trigger?: string;

  body_preview?: {
    text: string;
    truncated: boolean;
    source: CandidateQueueRecord["body_source"];
  };

  evidence_summaries: Array<{
    evidence_id: string;
    evidence_type: CandidateEvidenceRef["evidence_type"];
    relevance: string;
    summary: string;
  }>;

  llm_assessment?: CandidateQueueRecord["llm_assessment"];

  materialization?: CandidateLifecycleState["materialization"];
  activation?: CandidateLifecycleState["activation"];
};
```

Forbidden dashboard fields:

```text
raw hook payloads
raw transcript bodies
raw LLM prompts / responses
full CuratorBatch bodies by default
file contents from source projects
Edit / Write old_string / new_string bodies
skill args payloads
secret values or redacted-value reconstructions
unhashed local source paths by default
```

## Dashboard actions

Layer 6 action kinds:

```ts
type DashboardActionKind =
  | "dismiss"
  | "needs_more_evidence"
  | "approve"
  | "promote"
  | "evolve"
  | "request_materialize"
  | "request_activate"
  | "request_deactivate";
```

Layer 6 emits explicit action requests:

```ts
type DashboardActionRequest = {
  schema_version: 1;

  action_id: string;
  requested_at: string;

  actor: {
    layer: 6;
    actor_type: "dashboard";
    reviewer?: "local_user" | "unknown";
  };

  action: DashboardActionKind;

  candidate_id?: string;
  candidate_ids?: string[];

  expected_current_status?: CandidateLifecycleStatus;
  reason?: string;

  options?: DashboardActionOptions;

  safety_ack?: DashboardSafetyAcknowledgement;
};
```

```ts
type DashboardActionOptions = {
  promote?: {
    target_scope: "global";
    relationship: "promoted_from_candidate_id";
  };

  evolve?: {
    target_artifact_type:
      | "skill"
      | "command"
      | "agent"
      | "claude_md_addition";
    source_candidate_ids: string[];
    prompt_policy_version: string;
  };

  materialize?: {
    target_artifact_type?: string;
    draft_visibility: "inactive_review_only";
  };

  activate?: {
    materialization_id: string;
    active_target: "instinct" | "skill" | "command" | "agent" | "manual_claude_md_patch";
  };
};
```

```ts
type DashboardSafetyAcknowledgement = {
  reviewer_saw_behavior_change_warning?: boolean;
  reviewer_saw_target_path_summary?: boolean;
  reviewer_confirmed_manual_activation?: boolean;
};
```

Action requests are durable audit inputs, not proof that the action succeeded. The target layer must validate current state again before side effects.

## Action routing contract

Layer 6 routes actions by responsibility:

| Action | Layer 6 behavior | Authoritative owner |
|---|---|---|
| `dismiss` | Validate request and ask Layer 5 for `dismissed` transition | Layer 5 |
| `needs_more_evidence` | Validate request and ask Layer 5 for transition | Layer 5 |
| `approve` | Validate request and ask Layer 5 for `approved` transition | Layer 5 |
| `promote` | Create an explicit promotion request / future Layer 5 source input | Layer 5 once global scope is enabled |
| `evolve` | Create bounded evolve request; resulting proposal must enter Layer 5 | Layer 5 source adapter + optional LLM evolve adapter |
| `request_materialize` | Dispatch request to Layer 7; no file writes in Layer 6 | Layer 7 |
| `request_activate` | Dispatch request to Layer 8; no runtime writes in Layer 6 | Layer 8 |
| `request_deactivate` | Dispatch request to Layer 8; no runtime writes in Layer 6 | Layer 8 |

For 3.1 schema v1, if Layer 5 still restricts accepted candidates to project scope, `promote` must fail closed with a clear unsupported-action result rather than inventing a parallel global candidate store. Global promotion becomes enabled only after Layer 5 `CandidateScope`, Layer 7 target selection, and Layer 8 activation contracts are updated consistently.

## Action validation

Layer 6 validates action requests before dispatch:

```ts
type DashboardActionValidationResult = {
  schema_version: 1;

  action_id: string;
  validated_at: string;

  accepted: boolean;
  rejection_reason?:
    | "candidate_not_found"
    | "stale_status"
    | "action_not_available"
    | "unsupported_scope"
    | "missing_safety_ack"
    | "invalid_candidate_set"
    | "policy_violation";

  dispatch?: {
    target_layer: 5 | 7 | 8;
    target_action: string;
  };
};
```

Validation must use a freshly rebuilt Layer 5 current view or a cache proven current against `queue.jsonl`. Browser-submitted lifecycle status is only an optimistic concurrency guard.

## Persisted artifacts

Layer 6 may persist a review-action audit log:

```text
~/.arcforge/learning/dashboard/actions.jsonl
```

```ts
type DashboardActionAuditEvent = {
  schema_version: 1;

  event_id: string;
  ts: string;

  action_id: string;
  action: DashboardActionKind;

  candidate_id?: string;
  candidate_ids?: string[];

  validation: DashboardActionValidationResult;

  dispatched_to?: 5 | 7 | 8;
  downstream_event_id?: string;

  safety: {
    raw_candidate_body_included: false;
    raw_evidence_included: false;
    raw_prompt_included: false;
    raw_response_included: false;
  };
};
```

This log is audit/control-plane state. It is not candidate source of truth; Layer 5 `queue.jsonl` remains authoritative for lifecycle state.

## Consumers

Layer 6 direct consumers / callees:

- Layer 5 for lifecycle transitions and candidate source inputs from evolve/promote flows.
- Layer 7 for materialization requests.
- Layer 8 for activation/deactivation requests.
- Browser/UI clients for dashboard-safe read models.

Layer 6 must not create a second candidate index that diverges from Layer 5.

## Forbidden behavior

Layer 6 must not:

- call the LLM curator for default daemon analysis;
- read raw observations, raw transcripts, raw prompts, or raw responses by default;
- treat `rejections.jsonl` as dashboard candidates;
- write `queue.jsonl` directly around Layer 5;
- generate candidate IDs;
- assign final evidence quality;
- materialize draft files;
- write active skill / command / agent / instinct files;
- edit `CLAUDE.md`;
- inject pending, approved, or materialized candidate bodies into Claude runtime context;
- auto-promote project candidates to global;
- auto-activate after approval or materialization;
- trust client-submitted candidate bodies, paths, lifecycle status, or safety flags without server-side validation.

## Flow diagram mapping

Layer 6 maps to the dashboard review/control-plane node after the canonical candidate queue:

```text
Candidate Queue + Lifecycle Authority
→ Dashboard Review Control Plane
→ explicit action request
  ├─ Layer 5 lifecycle transition
  ├─ Layer 7 materialization request
  └─ Layer 8 activation request
```

Label:

```text
Layer 6: dashboard-safe review + explicit action request only
```

Blocked shortcuts:

```text
Dashboard Approve → Active Surface              BLOCKED
Dashboard Materialize Request → Active Surface  BLOCKED until Layer 8 activation
Dashboard Candidate List → Claude Context       BLOCKED
Rejected Proposal → Dashboard Candidate Card    BLOCKED
```

## Acceptance criteria

1. Dashboard list/card payloads are allowlisted and exclude body text by default.
2. Detail payloads, if enabled, expose only bounded sanitized previews and evidence summaries.
3. Layer 6 reads candidates through Layer 5 current view, not through raw proposal files or rejection logs.
4. Every dashboard action has an `action_id` and server-side validation result.
5. Browser state is not trusted as authority for lifecycle status or candidate body.
6. `approve`, `dismiss`, and `needs_more_evidence` go through Layer 5 lifecycle transitions.
7. `request_materialize` dispatches to Layer 7 and does not write files in Layer 6.
8. `request_activate` / `request_deactivate` dispatch to Layer 8 and do not write runtime files in Layer 6.
9. `promote` and `evolve` must target Layer 5 canonical schema; no parallel candidate store is allowed.
10. If global scope is not enabled in Layer 5, `promote` fails closed rather than creating ad-hoc global state.
11. Pending, approved, and materialized candidates are never injected into Claude runtime context by the dashboard.
12. Layer 6 action audit logs do not become candidate source of truth.

## First-slice defaults

The first 3.1 implementation slice uses these defaults unless a later reviewed plan changes them:

1. `DashboardCandidateDetail.body_preview` is **enabled only on explicit detail view**, never in list/card payloads. It is capped at **1,500 chars**, derived only from the Layer 5 canonical candidate body, and must remain sanitized/bounded.
2. Global promotion is **explicitly deferred**. `promote` fails closed with `unsupported_scope` until Layer 5 scope, Layer 7 target selection, and Layer 8 activation contracts are updated together.
3. `actions.jsonl` is retained for as long as the corresponding candidate lifecycle history is retained. It is audit/control-plane state, not source of truth, and can be rebuilt only where Layer 5 lifecycle evidence is sufficient.
4. Layer 3 / Layer 4 manifest diagnostics stay **CLI/debug-only** in the first slice. The dashboard may show safe IDs/counts already present in Layer 5 records, but it must not expose manifest bodies, raw prompts, raw responses, or full batch snapshots.

## Deferred decisions

1. Rich dashboard diagnostics for Layer 3 / Layer 4 run manifests.
2. Global promotion UX and scope migration.
3. Separate retention/compaction policy for dashboard action audit logs if candidate lifecycle history becomes large.
