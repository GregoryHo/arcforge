# Layer 7 — Materialization

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 7 writes inactive review artifacts from approved canonical candidates.

It answers:

```text
Given an approved candidate and an explicit materialization request, what inactive draft files should be written for review?
```

Layer 7 is the artifact writer for drafts only. It must not activate runtime behavior, load skills, edit active `CLAUDE.md`, or cause Claude Code to consume the generated artifact.

Primary architecture segment:

```text
Layer 6 request_materialize
→ Layer 7 materializer
→ inactive draft artifact(s)
→ MaterializationRecord
→ Layer 5 lifecycle transition to materialized
```

Materialization is a review step, not a behavior-changing step.

## Responsible actor

```text
Deterministic materializer / inactive artifact writer
```

Conceptual components:

```text
Materialization Request Validator
Draft Renderer
Draft Path Allocator
Atomic Draft Writer
Materialization Registry Writer
Layer 5 Transition Reporter
```

Any LLM-written content must already be present in the Layer 5 candidate record or in an explicit Layer 5 accepted evolve candidate. Layer 7 renders; it does not semantically invent a new candidate.

## Inputs

Layer 7 receives an explicit materialization request from Layer 6 and reads the current candidate record from Layer 5:

```ts
type MaterializationInput = {
  schema_version: 1;

  materialization_request: MaterializationRequest;
  candidate: CandidateQueueRecord;

  render_policy: MaterializationRenderPolicy;
};
```

```ts
type MaterializationRequest = {
  schema_version: 1;

  request_id: string;
  requested_at: string;

  source_action_id: string;
  candidate_id: string;

  expected_candidate_status: "approved";

  requested_artifact_type?:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition";

  reviewer_note?: string;
};
```

Layer 7 must validate that:

- `candidate.candidate_id` matches the request;
- candidate current lifecycle status is `approved`;
- requested artifact type, if present, matches candidate `artifact_type`;
- candidate body is present and passes safety checks;
- project-scoped and global-scoped candidates are both accepted when their Layer 5 scope records are valid;
- global-scoped candidates preserve `promoted_from_candidate_id` / `promoted_from_project_id` metadata in draft metadata;
- destination paths are draft-only and inside allowed draft roots;
- no active path will be written.

Layer 7 must not read raw observations, raw transcripts, raw LLM prompts/responses, Layer 3 batch snapshots by default, or Layer 5 rejections as materialization inputs.

## Render policy

Materialization rendering is policy-versioned:

```ts
type MaterializationRenderPolicy = {
  policy_version: string;

  allowed_artifact_types: Array<
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition"
  >;

  draft_root: string;

  active_roots_forbidden: true;
  overwrite_existing_draft: false;
  atomic_write_required: true;

  include_evidence_summaries: boolean;
  include_raw_evidence: false;
  include_raw_prompts: false;
  include_raw_transcripts: false;
};
```

**First-slice default**: `include_evidence_summaries: false` until Layer 6 detail
view exposes `evidence_summaries` block in the dashboard review surface. Once
Layer 6 surfaces evidence summaries to the reviewer, Layer 7 may flip this
default to `true` so the activated artifact carries the same provenance the
reviewer saw. Pre-Layer-6-completion enabling this flag would write evidence
summaries into draft bodies that the reviewer cannot see during approval,
breaking the "review surface mirrors stored body" invariant. Flip in lockstep,
not before.

Recommended default draft root:

```text
~/.arcforge/learning/drafts/<candidate_id>/
```

The draft root must be outside active runtime discovery paths unless an active system has explicitly been designed to ignore inactive draft roots.

## Draft artifact targets

Layer 7 writes draft artifacts by artifact type:

| Candidate `artifact_type` | Draft output | Behavior-changing? |
|---|---|---:|
| `instinct` | inactive instinct markdown draft | No |
| `skill` | inactive `SKILL.md` draft under draft root | No |
| `command` | inactive command draft under draft root | No |
| `agent` | inactive agent draft under draft root | No |
| `claude_md_addition` | inactive patch/snippet for manual review | No |

Recommended paths:

```text
~/.arcforge/learning/drafts/<candidate_id>/<materialization_id>/instincts/<name>.md
~/.arcforge/learning/drafts/<candidate_id>/<materialization_id>/skills/<name>/SKILL.md
~/.arcforge/learning/drafts/<candidate_id>/<materialization_id>/commands/<name>.md
~/.arcforge/learning/drafts/<candidate_id>/<materialization_id>/agents/<name>.md
~/.arcforge/learning/drafts/<candidate_id>/<materialization_id>/claude-md/<name>.patch.md
```

These are intentionally not the active targets:

```text
~/.arcforge/instincts/<project>/<id>.md
skills/<name>/SKILL.md
commands/<name>.md
agents/<name>.md
CLAUDE.md
```

Layer 8 owns any later copy/move/apply into active locations.

## Primary output — MaterializationRecord

Layer 7 emits and persists a `MaterializationRecord`:

```ts
type MaterializationRecord = {
  schema_version: 1;

  materialization_id: string;
  created_at: string;

  candidate_id: string;
  source_action_id: string;

  source_candidate: {
    candidate_id: string;
    candidate_record_hash: string;
    lifecycle_status_at_materialization: "approved";
  };

  artifact_type:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition";

  draft_artifacts: DraftArtifactRecord[];

  render_policy_version: string;

  safety: MaterializationSafetyMetadata;

  reported_to_layer5: boolean;
  layer5_event_id?: string;
};
```

```ts
type DraftArtifactRecord = {
  draft_artifact_id: string;

  artifact_role:
    | "primary"
    | "supporting_metadata"
    | "manual_patch"
    | "readme";

  draft_path: string;
  draft_path_hash: string;

  active_target_hint?: ActiveTargetHint;

  content_hash: string;
  bytes: number;

  created_at: string;
};
```

```ts
type ActiveTargetHint = {
  target_kind:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "manual_claude_md_patch";

  target_path_summary: string;
  target_path_hash?: string;

  auto_apply_allowed: boolean;
};
```

For `claude_md_addition`, `auto_apply_allowed` must be `false`; activation can record a manual patch artifact but must not silently edit `CLAUDE.md`.

## Materialization manifest and registry

Layer 7 persists materialization records under the draft root and may maintain a derived registry:

```text
~/.arcforge/learning/drafts/<candidate_id>/<materialization_id>/materialization.json
~/.arcforge/learning/drafts/index.json
```

`materialization.json` is the per-materialization source of truth for draft artifacts. `index.json` is optional and rebuildable from materialization records.

Layer 5 still owns candidate lifecycle source of truth. After successful draft writes, Layer 7 reports a lifecycle transition to Layer 5:

```text
approved → materialized
```

with `materialization_id` and draft artifact IDs in the transition metadata.

## Draft content contract

Draft content should be rendered from the canonical candidate record, not from raw source evidence.

Common frontmatter / metadata fields:

```ts
type DraftArtifactMetadata = {
  schema_version: 1;

  candidate_id: string;
  materialization_id: string;
  artifact_type: string;

  name: string;
  summary: string;
  body_source: CandidateQueueRecord["body_source"];

  scope: CandidateScope;
  promoted_from_candidate_id?: string;
  promoted_from_project_id?: string;
  evidence_quality: "high" | "medium" | "low";

  generated_at: string;
  render_policy_version: string;

  inactive_draft: true;
};
```

Drafts may include:

- candidate body;
- candidate summary;
- rationale;
- trigger;
- bounded evidence summaries;
- evidence quality metadata;
- clear inactive-draft warning.

Drafts must not include:

- raw hook payloads;
- raw transcript bodies;
- raw LLM prompts/responses;
- source file contents;
- edit replacement bodies unless they are the candidate body itself and have passed Layer 5 safety checks;
- skill args payloads;
- local source paths by default;
- secret values or reconstructed redactions.

## Safety metadata

```ts
type MaterializationSafetyMetadata = {
  active_paths_written: false;
  draft_only: true;

  raw_evidence_included: false;
  raw_prompt_included: false;
  raw_response_included: false;
  raw_transcript_included: false;
  skill_args_included: false;

  secret_scan: {
    status: "passed" | "rejected";
    rule_version: string;
  };

  path_policy: {
    status: "passed" | "rejected";
    draft_root: string;
    active_roots_forbidden: true;
  };

  content_hash_algorithm: "sha256";
};
```

If safety validation fails, Layer 7 must write no draft artifact and must not transition Layer 5 to `materialized`.

## Failure behavior

```ts
type MaterializationFailureRecord = {
  schema_version: 1;

  failure_id: string;
  failed_at: string;

  candidate_id: string;
  source_action_id: string;

  reason:
    | "candidate_not_found"
    | "invalid_lifecycle_status"
    | "artifact_type_mismatch"
    | "unsafe_content"
    | "path_policy_rejected"
    | "draft_exists"
    | "write_failed"
    | "lock_timeout"
    | "policy_violation";

  detail?: string;

  draft_artifacts_written: false;
  reported_to_layer5: false;
};
```

Materialization failures may be logged under:

```text
~/.arcforge/learning/drafts/failures.jsonl
```

The failure log is audit/debug state, not candidate state and not future learning evidence.

## Locking and atomicity

Layer 7 writes use draft-scoped locking:

```text
~/.arcforge/learning/drafts/<candidate_id>/materialization.lock
```

Contract:

- create draft directories with restrictive permissions where feasible;
- write to temporary files first;
- fsync/rename or equivalent atomic replacement for each draft artifact;
- never partially expose an active path;
- write `materialization.json` only after all draft artifacts are complete;
- report to Layer 5 only after the manifest is durable;
- if reporting to Layer 5 fails after draft writes, retry/report as recovery work rather than rewriting artifacts.

## Consumers

Layer 8 consumes `MaterializationRecord` plus current Layer 5 lifecycle state when an explicit activation request arrives.

Layer 6 may display materialized draft summaries / previews through allowlisted Layer 7 read endpoints.

Layer 5 records successful materialization as lifecycle state but does not own draft artifact content.

## Forbidden behavior

Layer 7 must not:

- accept non-approved candidates;
- read raw observations, raw transcripts, raw prompts, or raw responses by default;
- call an LLM to rewrite candidate meaning;
- create new candidate IDs;
- update candidate schema around Layer 5;
- write active `skills/`, `commands/`, `agents/`, active instinct, or `CLAUDE.md` paths;
- load generated artifacts into Claude context;
- activate or deactivate runtime behavior;
- auto-materialize immediately after approval without an explicit request;
- treat draft artifacts as candidate source of truth;
- include raw evidence or secrets in drafts.

## Flow diagram mapping

Layer 7 maps to the inactive draft branch between dashboard approval and activation:

```text
Dashboard request_materialize
→ Materializer
→ Inactive Draft Artifacts
→ MaterializationRecord
→ Layer 5 status: materialized
```

Label:

```text
Layer 7: inactive draft writer only
```

Blocked shortcuts:

```text
Approved Candidate → Active Skill                BLOCKED
Materializer → Active Surface                    BLOCKED
Materializer → CLAUDE.md                         BLOCKED
Materialized Draft → Claude Runtime Context      BLOCKED until Layer 8 activation
```

## Acceptance criteria

1. Layer 7 accepts only `approved` candidates.
2. Materialization requires an explicit Layer 6 action request.
3. Draft output paths are under allowed draft roots only.
4. Active runtime paths are never written by Layer 7.
5. Draft artifacts are rendered from Layer 5 canonical candidate records, not raw evidence stores.
6. Drafts include inactive-draft metadata/warnings.
7. Drafts exclude raw hook payloads, raw transcripts, raw prompts/responses, skill args, local source paths by default, and secrets.
8. Materialization writes are atomic and protected by a draft-scoped lock.
9. `MaterializationRecord` is persisted after all draft artifacts are written.
10. Layer 7 reports successful materialization to Layer 5 only after the record is durable.
11. Failed materialization writes no draft artifacts and creates no `materialized` lifecycle event.
12. `claude_md_addition` remains a manual patch/snippet and is not automatically applied.
13. Materialized candidates do not influence Claude runtime behavior.
14. Global-scoped candidates can be materialized as inactive drafts without becoming active global behavior.

## First-slice defaults

The first 3.1 implementation slice uses these defaults unless a later reviewed plan changes them:

1. Materialization supports **`instinct` drafts** for both project-scoped and global-scoped candidates. Global drafts must carry promotion provenance and remain inactive until explicit Layer 8 activation.
2. Draft roots live only under `~/.arcforge/learning/drafts/<candidate_id>/<materialization_id>/`. Project-local `.arcforge/` draft roots are deferred to avoid accidental runtime discovery or repo pollution.
3. A duplicate materialization request returns the latest existing draft only when the candidate record hash and render policy version match. If either changed, Layer 7 creates a new `materialization_id` and draft record.
4. Draft previews are served through bounded Layer 7 read endpoints consumed by Layer 6. The dashboard must not read arbitrary local files and must not send raw draft paths to the browser by default.

## Deferred decisions

1. Materialization support for evolved `skill` drafts and later `command` / `agent` drafts.
2. Whether project-local review draft roots are useful after the inactive/active discovery boundary is proven.
3. Rich draft compare/rollback previews in the dashboard.
