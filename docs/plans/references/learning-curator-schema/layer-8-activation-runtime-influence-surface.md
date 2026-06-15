# Layer 8 — Activation / Runtime Influence Surface

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 8 is the only layer allowed to create, change, or remove runtime influence.

It answers:

```text
Given a materialized draft and an explicit activation request, what active behavior surface may be changed?
```

Layer 8 is deliberately narrow. It performs explicit activation/deactivation side effects after all earlier gates have completed. Nothing in Layer 0-7 may influence Claude runtime behavior by default.

Primary architecture segment:

```text
Layer 6 request_activate / request_deactivate
→ Layer 8 activation gate
→ active behavior surface write / disable
→ ActivationRecord
→ Layer 5 lifecycle transition to activated / deactivated
```

## Responsible actor

```text
Deterministic activation gate / runtime influence writer
```

Conceptual components:

```text
Activation Request Validator
Materialization Integrity Verifier
Target Path Policy Checker
Active Artifact Writer
Activation Registry Writer
Layer 5 Transition Reporter
```

Layer 8 is not an LLM, not a candidate generator, and not a materializer. It moves or applies already materialized review artifacts into allowed active surfaces only after explicit reviewer intent.

## Inputs

Layer 8 receives an explicit action request from Layer 6, reads the current canonical candidate state from Layer 5, and reads the relevant Layer 7 materialization record:

```ts
type ActivationInput = {
  schema_version: 1;

  activation_request: ActivationRequest;
  candidate: CandidateQueueRecord;
  materialization: MaterializationRecord;

  activation_policy: ActivationPolicy;
};
```

```ts
type ActivationRequest = {
  schema_version: 1;

  request_id: string;
  requested_at: string;
  source_action_id: string;

  action: "activate" | "deactivate";

  candidate_id: string;
  materialization_id?: string;

  expected_candidate_status:
    | "materialized"
    | "activated"
    | "deactivated";

  target: ActivationTargetRequest;

  reviewer_ack: ActivationReviewerAcknowledgement;
};
```

```ts
type ActivationTargetRequest = {
  target_kind:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "manual_claude_md_patch";

  target_path_hint?: string;
};
```

```ts
type ActivationReviewerAcknowledgement = {
  confirmed_behavior_change: true;
  saw_target_summary: true;
  confirmed_no_auto_apply_for_claude_md?: true;
};
```

Layer 8 must validate current state again. A stale dashboard request is not enough.

Activation requires:

- candidate exists in Layer 5 current view;
- candidate lifecycle is `materialized` for activation, or `activated` / `deactivated` for deactivation/reactivation paths;
- materialization record exists and matches the candidate;
- draft artifact hashes match the materialization record;
- target kind is compatible with candidate artifact type;
- target path is allowlisted for active runtime surface;
- reviewer acknowledgement is present;
- content passes final safety scan;
- active write is atomic and recoverable.

## Activation policy

```ts
type ActivationPolicy = {
  policy_version: string;

  allowed_target_kinds: Array<
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "manual_claude_md_patch"
  >;

  allowed_active_roots: ActivationActiveRoots;

  require_materialization: true;
  require_reviewer_ack: true;
  require_integrity_check: true;
  require_atomic_write: true;

  claude_md_auto_apply_allowed: false;

  // Per-target-kind overwrite policy. Each target kind that may be activated
  // must have an explicit policy. Missing keys are treated as "forbidden".
  overwrite_existing_active_artifact: {
    instinct?: "forbidden" | "supersede_with_backup";
    skill?: "forbidden" | "supersede_with_backup";
    command?: "forbidden" | "supersede_with_backup";
    agent?: "forbidden" | "supersede_with_backup";
    manual_claude_md_patch?: "forbidden" | "supersede_with_backup";
  };

  deactivation_mode:
    | "disable_manifest"
    | "move_to_disabled_archive"
    | "remove_with_backup";
};
```

```ts
type ActivationActiveRoots = {
  instincts_root: string; // ~/.arcforge/instincts/<project>/
  global_instincts_root?: string; // ~/.arcforge/instincts/global/
  skills_root?: string;   // repo or user-approved skills root
  commands_root?: string;
  agents_root?: string;
  claude_md_root?: string; // manual patch target summary only; no auto edit
};
```

The exact active root must be explicit and allowlisted. Layer 8 must not infer arbitrary write targets from candidate body text or browser-submitted paths.

## Target behavior by artifact type

| Candidate `artifact_type` | Activation target | Runtime influence contract |
|---|---|---|
| `instinct` | `~/.arcforge/instincts/<project>/<id>.md` or `~/.arcforge/instincts/global/<id>.md` according to candidate scope | Active instinct record. May be surfaced at SessionStart only through the **activation-gated** injection path (ICL-4): a reviewer must have explicitly activated it. Confidence-based auto-load remains forbidden. |
| `skill` | allowed `skills/<name>/SKILL.md` active root | May influence future Claude behavior through normal skill discovery only after activation. |
| `command` | allowed active command root | May influence command availability only after activation. |
| `agent` | allowed active agent root | May influence agent availability only after activation. |
| `claude_md_addition` | manual patch artifact / instructions | No automatic edit to `CLAUDE.md`; user applies manually if desired. |

Activated instincts are durable learning atoms. **Reviewed slice 2 (ICL-4) revision:** an instinct that a reviewer has explicitly activated on the dashboard MAY be surfaced into Claude context at SessionStart through the activation-gated injection path. The gate is the activation lifecycle, not confidence — the retired confidence-based auto-load (any high-confidence file surfacing automatically) remains forbidden. The injection is governed by the `inject_activated_instincts` kill-switch (default ON; explicit `false` silences it), is capped at the top five by confidence, and folds ActivationRecords by candidate_id (latest wins, so a deactivated instinct stops injecting). Influence still reaches Claude only after an explicit reviewer activation — never from pending/approved/materialized candidates, and never via an automatic CLAUDE.md patch.

## Primary output — ActivationRecord

Layer 8 emits and persists an `ActivationRecord`:

```ts
type ActivationRecord = {
  schema_version: 1;

  activation_id: string;
  action: "activate" | "deactivate";
  created_at: string;

  candidate_id: string;
  materialization_id?: string;
  source_action_id: string;

  artifact_type:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "claude_md_addition";

  active_artifacts: ActiveArtifactRecord[];

  policy_version: string;

  safety: ActivationSafetyMetadata;

  reported_to_layer5: boolean;
  layer5_event_id?: string;
};
```

```ts
type ActiveArtifactRecord = {
  active_artifact_id: string;

  target_kind:
    | "instinct"
    | "skill"
    | "command"
    | "agent"
    | "manual_claude_md_patch";

  active_path?: string;
  active_path_hash: string;
  active_path_summary: string;

  source_draft_artifact_id?: string;
  source_draft_content_hash?: string;
  active_content_hash?: string;

  previous_active_artifact_backup?: {
    backup_path: string;
    backup_path_hash: string;
    content_hash: string;
  };

  status: "active" | "deactivated" | "manual_patch_pending";
};
```

For `manual_claude_md_patch`, `active_path` may be absent and `status` should be `manual_patch_pending` unless the system later has an explicit, separately approved manual-apply recording workflow.

### `active_path_summary` redaction rule

`active_path_summary` is a human-readable diagnostic string included in activation records and surfaced through Layer 6 review and Layer 5 events. Because activation records persist beyond a single session and may be exported, the summary MUST NOT carry the raw `project_id` segment.

Acceptable forms:

```text
"<artifact_type>/<artifact_id>.md"               ✓ no project_id
"<project_id_short_hash>/<artifact_id>.md"       ✓ hashed project id
"<active_path_hash[:12]>"                         ✓ truncated path hash
```

Forbidden form:

```text
"<raw_project_id>/<artifact_id>.md"               ✗ project_id leaked verbatim
```

Implementations that derive the summary from a relative path against the active root must strip or hash the project_id segment before persisting. The full path remains available indirectly via `active_path_hash` for integrity checks.

### Hash verification ordering note

The spec phrasing "verify before reading" the draft body refers to the integrity-vs-action ordering, not the order of byte reads in memory. Implementations that read the full draft body into a buffer, compute its hash, compare against `source_draft_content_hash`, and only then act on the buffer are equivalent to the spec — the action (writing to active path, transitioning Layer 5 state) does not occur unless the hash matches. Implementations that act on the buffer before completing the hash check are non-compliant.

## Activation registry

Layer 8 persists activation records:

```text
~/.arcforge/learning/activations/<activation_id>.json
~/.arcforge/learning/activations/index.json
```

`<activation_id>.json` is durable activation audit. `index.json` is optional and rebuildable.

Layer 5 remains lifecycle authority. After successful activation, Layer 8 reports:

```text
materialized → activated
```

After successful deactivation:

```text
activated → deactivated
```

Layer 8 must not claim activation success until both the active artifact write/disable and activation record are durable.

## Active write rules

Activation writes must be atomic and auditable:

- acquire target-specific activation lock;
- verify materialization hash before reading draft content;
- render/copy only from draft artifact content recorded by Layer 7;
- write to temporary active path;
- fsync/rename or equivalent atomic replacement;
- create backup before superseding any existing active artifact when policy allows overwrite;
- persist `ActivationRecord`;
- report lifecycle transition to Layer 5;
- never write active artifacts from raw candidate body if the draft artifact is missing or hash-mismatched.

Recommended locks:

```text
~/.arcforge/learning/activations/activation.lock
<active-root>/.arcforge-activation.lock  (where feasible)
```

## Safety metadata

```ts
type ActivationSafetyMetadata = {
  explicit_reviewer_activation: true;
  materialization_required: true;
  materialization_integrity_verified: boolean;

  pending_candidate_influence: false;
  approved_candidate_influence: false;
  materialized_candidate_influence_before_activation: false;

  target_path_policy: {
    status: "passed" | "rejected";
    allowed_root_hashes: string[];
  };

  content_safety_scan: {
    status: "passed" | "rejected";
    rule_version: string;
  };

  claude_md_auto_apply: false;

  runtime_boundary: {
    // Confidence-based auto-load (any high-confidence file surfacing without
    // review) stays disabled; the field name predates ICL-4. The ICL-4
    // activation-gated injection is a distinct, reviewer-gated path.
    session_start_instinct_autoload_disabled_required: true;
    global_auto_promote_disabled_required: true;
  };
};
```

Before enabling Layer 8 activation in production, implementation must verify the old behavior-changing shortcuts are disabled:

```text
SessionStart confidence auto-load  disabled   (ICL-4 gated injection is separate)
project → global auto-promote      disabled
statistical analyzer production candidate path disabled
```

Otherwise activation could be only one of multiple behavior-changing paths, violating the pivot.

## Deactivation contract

Deactivation is also explicit Layer 8 behavior:

```ts
type DeactivationInput = ActivationInput & {
  activation_request: ActivationRequest & {
    action: "deactivate";
    expected_candidate_status: "activated";
  };
};
```

Allowed deactivation effects depend on policy:

| `deactivation_mode` | Behavior |
|---|---|
| `disable_manifest` | Mark active artifact disabled in activation registry; active runtime must honor registry. |
| `move_to_disabled_archive` | Move active file to disabled/archive path with backup record. |
| `remove_with_backup` | Copy backup, then remove active file. |

For the first 3.1 implementation slice, prefer `move_to_disabled_archive` or `disable_manifest` over irreversible deletion.

Deactivation must report `activated → deactivated` to Layer 5 only after the disable action is durable.

## Failure behavior

```ts
type ActivationFailureRecord = {
  schema_version: 1;

  failure_id: string;
  failed_at: string;

  action: "activate" | "deactivate";
  candidate_id: string;
  materialization_id?: string;
  source_action_id: string;

  reason:
    | "candidate_not_found"
    | "invalid_lifecycle_status"
    | "materialization_missing"
    | "materialization_hash_mismatch"
    | "target_kind_mismatch"
    | "target_path_rejected"
    | "missing_reviewer_ack"
    | "unsafe_content"
    | "active_write_failed"
    | "backup_failed"
    | "lock_timeout"
    | "policy_violation";

  active_artifacts_written: false;
  reported_to_layer5: false;
};
```

Activation failures may be logged under:

```text
~/.arcforge/learning/activations/failures.jsonl
```

A failed activation must not create an `activated` lifecycle event. If a partial write is detected, recovery must either complete the write from verified materialization content or roll it back from backup before reporting success.

## Consumers

Runtime consumers may read active behavior surfaces only after Layer 8 has created them:

- Claude Code skill discovery may read activated skills in the allowed active skills root.
- Command/agent discovery may read activated command/agent roots if those artifact types are implemented.
- Instinct readers may read activated instinct files for dashboard/history/evolve input. SessionStart may additionally inject an activated instinct's trigger/body summary into Claude context through the activation-gated path (ICL-4); it must never confidence-auto-load a non-activated instinct.
- Manual `CLAUDE.md` patch remains outside automatic runtime write; user applies it manually if desired.

Layer 5 consumes Layer 8 success reports as lifecycle transition events.

Layer 6 may display activation records through dashboard-safe summaries.

## Forbidden behavior

Layer 8 must not:

- activate a candidate that is not materialized;
- activate without explicit reviewer acknowledgement;
- trust browser-submitted active paths without allowlist validation;
- read raw observations, raw transcripts, raw prompts, or raw responses by default;
- call an LLM;
- generate or modify candidate meaning;
- materialize drafts from candidate body if Layer 7 materialization is missing;
- auto-apply `claude_md_addition` to `CLAUDE.md`;
- re-enable confidence-based SessionStart instinct auto-load (the activation-gated injection of ICL-4 is the only permitted SessionStart instinct path);
- auto-promote project candidates to global;
- activate directly from pending or approved state;
- treat activation registry as a replacement for Layer 5 lifecycle source of truth;
- report success to Layer 5 before active writes/disable actions and activation records are durable.

## Flow diagram mapping

Layer 8 maps to the only edge crossing the Manual Activate boundary:

```text
Materialized Draft
→ explicit Dashboard Activate request
→ Activation Gate
→ Active Behavior Surface
→ Layer 5 status: activated
```

Label:

```text
Layer 8: explicit runtime influence boundary
```

Blocked shortcuts:

```text
Pending Candidate → Active Surface       BLOCKED
Approved Candidate → Active Surface      BLOCKED
Materialized Draft → Active Surface      BLOCKED without explicit Activate
Non-activated Instinct → SessionStart    BLOCKED (no confidence auto-load)
Activated Instinct → SessionStart inject ALLOWED (gated, kill-switch, top-5)
claude_md_addition → auto-edit CLAUDE.md  BLOCKED
```

## Acceptance criteria

1. Layer 8 is the only layer that writes active runtime artifacts.
2. Activation requires a materialized candidate and explicit Layer 6 activation request.
3. Activation validates current Layer 5 lifecycle status and Layer 7 materialization integrity.
4. Active target paths are allowlisted and never inferred from untrusted body text.
5. Active writes are atomic, lock-protected, and backed up when superseding existing artifacts.
6. Activation records are persisted before reporting lifecycle success.
7. Layer 5 receives `activated` / `deactivated` transitions only after side effects are durable.
8. `instinct` activation does not reintroduce confidence-based SessionStart auto-load. Activated instincts MAY surface at SessionStart only through the ICL-4 activation-gated injection (kill-switch default ON, top-5 by confidence, deactivation removes them).
9. `skill` activation writes only to an allowed active skills root.
10. `claude_md_addition` is never automatically applied to `CLAUDE.md`.
11. Failed activation creates no `activated` lifecycle event.
12. Deactivation is explicit, durable, and recoverable.
13. Pending, approved, and materialized candidates produce no runtime influence.
14. Old behavior-changing shortcuts are disabled before production Layer 8 activation is considered enabled.

## First-slice defaults

The first 3.1 implementation slice uses these defaults unless a later reviewed plan changes them:

1. Activation supports **`instinct` targets only**, written under `~/.arcforge/instincts/<project>/` for project-scoped candidates or `~/.arcforge/instincts/global/` for global-scoped candidates. Global instinct activation is first-slice behavior but still does not auto-load into Claude context. No active skills root is enabled by default. Future skill activation must require an explicit dashboard-selected, allowlisted skills root.
2. `command` and `agent` activation are **reserved** until skill activation is implemented, reviewed, and proven safe. `claude_md_addition` remains manual-only and is never auto-applied.
3. **Revised by ICL-4 (reviewed slice 2):** activated instincts are consumed by dashboard/history/evolve surfaces AND, when explicitly activated, by the SessionStart activation-gated injection path (kill-switch `inject_activated_instincts` default ON, top-5 by confidence, latest-wins fold over ActivationRecords). They are never confidence-auto-loaded and never become hard runtime instructions — they are surfaced as advisory context the model applies where relevant.
4. Deactivation uses `move_to_disabled_archive` with a backup record. The first dashboard UX exposes deactivate status and backup metadata; full rollback/supersede UX is deferred.
5. **Overwrite policy defaults**:
   - `instinct`: `"supersede_with_backup"` — re-activating an instinct after manual edit must preserve the prior body as a backup record, not hard-fail. The instinct path includes a candidate-derived `<id>`, so collisions are intended re-activations.
   - `skill`: `"forbidden"` — `skills/<name>/SKILL.md` may be user-edited; overwriting must hard-fail to protect manual changes. (Moot in the first slice, where skill activation is reserved; the policy is pinned for forward compatibility.)
   - `manual_claude_md_patch`: `"forbidden"` — `CLAUDE.md` is never auto-applied, so this is also moot but pinned explicitly to prevent future relaxation by default.
   - `command`, `agent`: `"forbidden"` (reserved for first slice).

## Deferred decisions

1. Active skills root selection and policy for future skill activation.
2. Command/agent activation after skill activation is proven safe.
3. ~~Any non-runtime reader for activated instincts beyond dashboard/history/evolve.~~ **RESOLVED (ICL-4):** the SessionStart activation-gated injection is the first such consumer — it reads only explicitly-activated instinct files, gated by the `inject_activated_instincts` kill-switch (default ON) and capped at the top five by confidence.
4. Rich rollback/supersede dashboard UX.
