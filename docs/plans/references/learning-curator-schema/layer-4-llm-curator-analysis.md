# Layer 4 — LLM Curator Analysis

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 4 receives one bounded `CuratorBatch` from Layer 3 and uses an LLM to produce candidate proposal payloads.

It answers:

```text
Given this bounded evidence packet, what candidate proposals are worth deterministic validation?
```

Layer 4 is the first layer allowed to perform LLM-based semantic distillation. Its output is still untrusted proposal data, not queue state and not behavior change.

Primary architecture segment:

```text
Layer 3 CuratorBatch
→ Layer 4 LLM Curator Analysis
→ CandidateProposalPayload
→ Layer 5 Schema / Safety / Dedupe / Queue
```

Layer 4 is not a storage owner, queue owner, dashboard owner, materialization owner, activation owner, or final schema authority.

## Responsible actor

```text
LLM Curator
```

Conceptually, Layer 4 has two parts:

```text
Curator Prompt Builder  → deterministic request construction from CuratorBatch
LLM Curator Adapter    → model invocation and structured response parsing
```

The daemon may orchestrate Layer 4, but the daemon is not the schema owner. A Layer 4 run is one LLM curator execution over one `CuratorBatch`.

## Inputs

Layer 4's only default production evidence input is the `CuratorBatch` emitted by Layer 3.

```ts
type CuratorAnalysisInput = {
  schema_version: 1;

  run_id: string;
  created_at: string;

  batch: CuratorBatch;

  prompt_policy: CuratorPromptPolicy;
  output_contract: CuratorOutputContract;
};
```

Layer 4 must not directly read:

- `observations.jsonl`;
- diary / reflect / recall stores;
- raw transcripts;
- raw hook payloads;
- quarantine paths;
- candidate queues;
- dashboard state;
- draft artifacts;
- active behavior surfaces.

Any evidence Layer 4 sees must already be present in the bounded Layer 3 batch. This prevents the LLM curator from bypassing Layer 3's bounded evidence, safety, omission, and manifest contracts.

## Prompt policy

Layer 4 prompt behavior is part of the schema contract. The implementation must make the prompt policy explicit and versioned.

```ts
type CuratorPromptPolicy = {
  policy_version: string;

  allowed_artifact_types: Array<
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition"
  >;

  max_proposals: number;
  min_evidence_refs_per_proposal: number;
  max_evidence_refs_per_proposal: number;

  max_summary_chars: number;
  max_rationale_chars: number;
  max_body_chars: number;

  require_evidence_refs: true;
  require_uncertainty_notes: true;
  require_risk_notes: true;

  cite_evidence_ids_only: true;
  no_external_knowledge: true;
  no_raw_secret_reconstruction: true;
  no_file_writes: true;
  no_activation_claims: true;

  output_format: "json";
};
```

For the first 3.1 daemon-curator policy, `allowed_artifact_types` should be:

```json
["instinct"]
```

The broader artifact type union is retained so later explicit dashboard actions, such as `[Evolve]`, can produce skill / command / agent / `claude_md_addition` proposals under their own policy. The default production daemon-curator path should not skip the learning-atom stage by emitting skills or agents directly.

The prompt must instruct the LLM:

- use only evidence present in the `CuratorBatch`;
- cite only `evidence_id`s present in the batch;
- do not infer from hidden files, unstated stores, or model memory;
- do not reconstruct redacted values;
- do not claim file writes, activation, queue insertion, or materialization;
- do not assign candidate IDs, lifecycle status, final confidence, or final evidence quality;
- for the first 3.1 daemon-curator policy, output `instinct` proposals only;
- if evidence is weak, output `needs_more_evidence` or no proposal.

## Primary output — CandidateProposalPayload

Layer 4 emits a `CandidateProposalPayload`, not a final `CandidateQueueRecord`.

```ts
type CuratorOutputContract = {
  schema_version: 1;
  output_schema_version: number;
  payload_type: "CandidateProposalPayload";
  final_schema_authority: "layer5";
};
```

Layer 4 output is untrusted structured proposal data until Layer 5 validates, sanitizes, normalizes, deduplicates, assigns lifecycle identity, computes final evidence quality, and appends queue state.

```ts
type CandidateProposalPayload = {
  schema_version: 1;

  source: {
    layer: 4;
    curator: "llm";

    run_id: string;
    created_at: string;

    batch_id: string;
    batch_hash: string;

    prompt_policy_version: string;
    output_schema_version: number;

    model?: string;
  };

  proposals: CandidateProposalDraft[];
};
```

Each proposal is still a draft and may be rejected by Layer 5.

```ts
type CandidateProposalDraft = {
  proposal_index: number;

  artifact_type:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition";

  proposed_scope: {
    kind: "project";
    project_id: string;
  };

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

  body?: string;
  body_source?: "llm_draft";

  evidence_refs: CandidateProposalEvidenceRef[];

  llm_confidence: "low" | "medium" | "high";

  risk_notes: string[];
  uncertainty_notes: string[];

  recommended_review_action:
    | "review"
    | "dismiss"
    | "needs_more_evidence";
};
```

Use `name`, not `title`, to avoid avoidable drift between Layer 4 proposals and later canonical candidate records.

For the first 3.1 daemon-curator policy, `proposed_scope.kind` is `"project"`. Global candidate proposals should come from later explicit promotion/review flows, not from the default production Layer 4 daemon-curator path.

## Evidence citation contract

Every Layer 4 proposal must cite evidence from the source `CuratorBatch`.

```ts
type CandidateProposalEvidenceRef = {
  evidence_id: string;

  evidence_type:
    | "observation"
    | "session_summary"
    | "diary"
    | "reflect"
    | "recall";

  relevance: string;
};
```

`evidence_id` is required. Layer 4 should not copy `session`, `ts`, source paths, or other authoritative metadata into the proposal. Layer 5 can look those up from the cited batch item during validation and normalization.

Layer 4 must not invent evidence, cite nonexistent batch entries, cite evidence from unavailable stores, reconstruct redacted values, or rely on unstated model memory.

Layer 5 validates that:

```text
evidence_id exists in CuratorBatch
evidence_type matches the referenced batch item
proposal cites enough evidence for the active prompt policy
proposal does not cite nonexistent evidence
```

## Confidence and evidence quality boundary

Layer 4 may emit LLM-authored advisory fields:

```text
llm_confidence
uncertainty_notes
risk_notes
recommended_review_action
```

Layer 4 must not assign:

```text
candidate_id
status
confidence
evidence_quality
```

Final deterministic confidence fields, lifecycle status, and candidate evidence quality belong to Layer 5. Layer 5 should derive final `evidence_quality` from the evidence actually cited by each validated proposal plus the Layer 3 `quality_inputs`.

## Run identity

Layer 4 assigns a `run_id` for audit and traceability. `run_id` identifies one LLM curator execution over one source batch.

`run_id` is distinct from `batch_id`:

```text
batch_id = Layer 3 bounded evidence packet identity
run_id   = Layer 4 LLM curator execution identity
```

Recommended shape:

```text
curator_run_<compact UTC created_at>_<12-char batch/model/prompt hash>
```

Example:

```text
curator_run_20260509T052000Z_f9e8d7c6b5a4
```

The short id hash should be derived from canonical batch identity, model identity, and prompt policy identity.

## Persisted artifacts

Layer 4 has these artifact levels:

| Artifact | Default persistence | Purpose |
|---|---:|---|
| LLM prompt body | No | Avoid retaining full evidence prompt by default. |
| Raw LLM response | No | Avoid retaining malformed / verbose / unsafe raw output by default. |
| Parsed `CandidateProposalPayload` | Handoff only | Proposal payload passed to Layer 5; not durable product truth by itself. |
| `CuratorRunManifest` | Required | Audit metadata for the LLM execution. |

Layer 4 must persist a `CuratorRunManifest` for every attempted LLM curator execution.

Recommended path:

```text
~/.arcforge/learning/curator-runs/<run_id>.manifest.json
```

Manifest schema:

```ts
type CuratorRunManifest = {
  schema_version: 1;

  run_id: string;
  created_at: string;

  source_batch_id: string;
  source_batch_hash: string;

  prompt_policy_version: string;
  output_schema_version: number;

  model?: string;
  provider?: string;

  invocation: {
    tool_access: false;
    timeout_ms?: number;
    max_output_chars?: number;
    duration_ms?: number;
    transport_status:
      | "completed"
      | "timeout"
      | "transport_error"
      | "cancelled";
  };

  parse_status:
    | "parsed"
    | "empty"
    | "malformed_json"
    | "non_object"
    | "transport_error"
    | "timeout";

  proposal_count: number;

  handed_to_layer5: boolean;

  prompt_hash?: string;
  response_hash?: string;
  proposal_payload_hash?: string;

  raw_prompt_saved: boolean;
  raw_response_saved: boolean;
  retention_expires_at?: string;
};
```

`schema_rejected` is intentionally not a Layer 4 `parse_status`. Schema validation, safety rejection, dedupe, and lifecycle decisions belong to Layer 5. If Layer 5 later needs to cross-reference its validation result, that should be recorded in a Layer 5 validation/queue artifact rather than turning Layer 4 into schema authority.

Full prompt and raw response may be saved only under explicit audit/debug retention.

Example optional debug paths:

```text
~/.arcforge/learning/curator-runs/debug/<run_id>.prompt.json
~/.arcforge/learning/curator-runs/debug/<run_id>.response.json
```

Debug artifacts are local-only, retention-bound, excluded from default production readers, and never primary evidence for future learning runs.

## Failure behavior

Layer 4 failures must not produce queue state directly.

| Case | Required behavior |
|---|---|
| LLM transport timeout | Manifest `parse_status = "timeout"`; no Layer 5 handoff. |
| LLM transport error | Manifest `parse_status = "transport_error"`; no Layer 5 handoff. |
| Empty response / no useful proposal | Payload may contain `proposals: []`; manifest `parse_status = "empty"`; no candidate. |
| Malformed JSON | Manifest `parse_status = "malformed_json"`; no Layer 5 handoff. |
| Parsed JSON is not an object | Manifest `parse_status = "non_object"`; no Layer 5 handoff. |
| Parsed envelope with invalid candidate fields | Handoff to Layer 5 only if the envelope is parseable; Layer 5 rejects invalid proposals. |
| Disallowed artifact type | Layer 5 rejects. |
| Nonexistent evidence refs | Layer 5 rejects. |
| Reconstructs redacted value | Layer 5 rejects as safety violation. |
| Proposes activation / file writes | Reject or strip before queueing; Layer 4 cannot authorize side effects. |

Key principle:

```text
Layer 4 can fail to produce proposals.
Layer 4 cannot create queue state.
```

## Consumers

Layer 5 is the only default production direct consumer of `CandidateProposalPayload`.

Layer 4 manifests may later be used by CLI/debug/audit surfaces. Dashboard-visible summaries must be allowlisted and must not expose raw prompts, raw responses, or full batch bodies by default.

## Forbidden behavior

Layer 4 must not:

- read evidence stores directly;
- read quarantine paths;
- read candidate queues;
- read dashboard state;
- read draft or active behavior surfaces;
- write candidate queue records;
- assign `candidate_id`;
- assign lifecycle status;
- assign final deterministic `confidence`;
- assign final `evidence_quality`;
- perform final schema authority;
- perform final dedupe;
- notify dashboard as if a candidate was queued;
- materialize draft files;
- activate runtime behavior;
- write skills / commands / agents;
- modify `CLAUDE.md`;
- inject anything into Claude runtime context.

## Flow diagram mapping

Layer 4 maps to the LLM curator node between the bounded batch assembler and the Layer 5 schema/safety gate:

```text
CuratorBatch
→ LLM Curator Analysis
→ CandidateProposalPayload
→ Layer 5 Schema / Safety Gate
```

The flow diagram should label this node as:

```text
Layer 4: LLM proposal only
```

Do not add these edges in 3.1 schema v1:

```text
LLM Curator → Candidate Queue
LLM Curator → Dashboard
LLM Curator → Materialized Draft
LLM Curator → Active Surface
```

Layer 5 owns the schema/safety gate and queue append.

## Acceptance criteria for Layer 4 contract

1. Layer 4 receives only one bounded `CuratorBatch` from Layer 3.
2. Layer 4 does not directly read evidence stores, quarantine paths, queue state, dashboard state, draft artifacts, or active behavior surfaces.
3. Layer 4 creates one `run_id` per LLM curator execution.
4. Layer 4 prompt policy is explicit and versioned.
5. First 3.1 daemon-curator policy allows only `artifact_type = "instinct"`.
6. Layer 4 output is `CandidateProposalPayload`, not `CandidateQueueRecord`.
7. Layer 4 does not assign `candidate_id`, lifecycle status, final confidence, or final `evidence_quality`.
8. Every proposal cites existing batch `evidence_id`s.
9. Layer 4 may emit `llm_confidence`, `risk_notes`, `uncertainty_notes`, and `recommended_review_action`, but these are advisory only.
10. Layer 4 persists `CuratorRunManifest` for every attempted run.
11. Raw prompt and raw response are not persisted by default.
12. Optional debug artifacts are local-only, retention-bound, and excluded from default production learning readers.
13. Malformed, empty, timeout, or transport-failed LLM output does not create queue state.
14. Layer 5 owns final schema validation, safety rejection, dedupe, lifecycle identity, final evidence quality, and queue append.

## Open questions

1. What exact 3.1 schema v1 values should be used for `max_proposals`, evidence refs per proposal, and max field lengths?
2. Should Layer 4 retry once on malformed JSON, or should malformed output fail closed with no retry in 3.1 schema v1?
3. Should 3.1 schema v1 persist a parsed proposal payload handoff artifact for audit, or keep it purely in-memory between Layer 4 and Layer 5?
4. Should CLI/debug surfaces expose Layer 4 run manifests before Layer 6 dashboard diagnostics are designed?
