# Eval: dashboard-safety-ack-required

**Status**: Active — PR-D Layer 6 safety_ack gate.

## Scope
skill

## Target
skills/arc-learning/SKILL.md

## Scenario
A reviewer loads the dashboard and sees candidate `cand_safety_ack_001`
with `lifecycle.status === "materialized"`. The reviewer fires three
`activate` POST requests in sequence:

- Request A: no `safety_ack` field at all.
- Request B: `safety_ack: { reviewer_saw_behavior_change_warning: true }` (target_path_summary acknowledgement missing).
- Request C: `safety_ack: { reviewer_saw_behavior_change_warning: true, reviewer_saw_target_path_summary: true }`.

The candidate's `expected_current_status` is correctly set to `"materialized"`
in all three requests, so the optimistic concurrency check passes. The Action
× Status matrix permits `activate` from `materialized`, so policy passes too.

Read the scenario queue and answer:
1. Should Request A be accepted or rejected? What rejection reason should the
   server return?
2. Should Request B be accepted or rejected? Same question — what reason?
3. Should Request C be accepted? Why does this one differ from B?
4. For a `deactivate` action instead, which `safety_ack` fields are required
   at minimum?

Relevant files:
- `queue-dir/queue.jsonl` — candidate queue with `cand_safety_ack_001` at
  `lifecycle.status === "materialized"`.

Constraints:
- Use Read only; do not run Bash, including file-inspection commands.
- Do not edit files.
- Keep the answer under 10 bullets.

## Context
This scenario validates the Layer 6 `safety_ack` gate from the PR-D spec:
- `activate` requires BOTH `reviewer_saw_behavior_change_warning: true` AND
  `reviewer_saw_target_path_summary: true` in the request envelope.
- `deactivate` requires ONLY `reviewer_saw_behavior_change_warning: true`.
- Missing or false either flag → reject with `missing_safety_ack`.
- This gate fires AFTER the optimistic concurrency check and AFTER the
  Action × Status matrix check, so a malformed activate against an illegal
  source status still surfaces `policy_violation`, not `missing_safety_ack`.
- Purpose: force the dashboard UI to surface the behavior-change + target-path
  warnings to the reviewer before they commit a behavior-changing action.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p queue-dir
python3 - <<'PY'
import json, pathlib

queue_path = pathlib.Path("queue-dir/queue.jsonl")
t0 = "2026-05-22T11:00:00Z"
t1 = "2026-05-22T11:00:30Z"
t2 = "2026-05-22T11:01:00Z"

source_record = {
    "schema_version": 1,
    "candidate_id": "cand_safety_ack_001",
    "artifact_type": "instinct",
    "scope": {"kind": "project", "project": "test-project", "project_id": "proj_test_safety"},
    "source": {"source_type": "layer4_llm_curator"},
    "name": "verify-before-claiming",
    "summary": "Run the verifier before claiming a fix is complete.",
    "rationale": "Observed in 5 sessions where claims were premature.",
    "body": "Before saying a fix is done, run the verifier on the changed scope.",
    "body_source": "llm_curator",
    "domain": "verification",
    "evidence": [{"evidence_id": "ev-001", "evidence_type": "observation", "relevance": "direct", "summary": "Premature claim, then verifier failed"}],
    "evidence_quality": "medium",
    "evidence_quality_metadata": {"rule_version": "v1-project_obs_count", "basis": {"project_obs_count": 5}},
    "lifecycle": {"status": "pending_review", "status_changed_at": t0},
    "safety": {"validator_version": "v1", "sanitizer_policy_version": "v1", "sanitizer_module": "scripts/lib/sanitize-observation.js", "raw_prompt_included": False, "raw_response_included": False, "raw_hook_payloads_included": False, "raw_transcripts_included": False, "edit_bodies_included": False, "skill_args_included": False, "secret_scan": {"status": "passed", "rule_version": "v1"}, "activation_claim_scan": {"status": "passed"}, "file_write_claim_scan": {"status": "passed"}},
    "dedupe": {"dedupe_key": "verify-before-claiming-v1", "dedupe_basis": {"scope_kind": "project", "project_id": "proj_test_safety", "artifact_type": "instinct", "normalized_name": "verify-before-claiming", "normalized_body_hash": "abc123"}},
    "created_at": t0,
    "updated_at": t0,
}
create_event = {
    "schema_version": 1, "event_id": "evt_001", "ts": t0,
    "candidate_id": "cand_safety_ack_001",
    "event_type": "candidate.created",
    "actor": {"layer": 5, "actor_type": "validator"},
    "record": source_record,
}

# Status walk: pending_review → approved → materialized
approve_event = {
    "schema_version": 1, "event_id": "evt_002", "ts": t1,
    "candidate_id": "cand_safety_ack_001",
    "event_type": "candidate.transitioned",
    "actor": {"layer": 6, "actor_type": "dashboard", "reviewer": "local_user"},
    "action": "approve", "from_status": "pending_review", "to_status": "approved",
}
materialize_event = {
    "schema_version": 1, "event_id": "evt_003", "ts": t2,
    "candidate_id": "cand_safety_ack_001",
    "event_type": "candidate.transitioned",
    "actor": {"layer": 6, "actor_type": "dashboard", "reviewer": "local_user"},
    "action": "materialize", "from_status": "approved", "to_status": "materialized",
}

lines = [create_event, approve_event, materialize_event]
queue_path.write_text("\n".join(json.dumps(l) for l in lines) + "\n")
print("Setup complete:", queue_path, f"({len(lines)} events; final status: materialized)")
PY

## Assertions
- [ ] A1: The response correctly states Request A (no `safety_ack` at all)
  is **rejected** with reason `missing_safety_ack`.
- [ ] A2: The response correctly states Request B (only
  `reviewer_saw_behavior_change_warning`, missing
  `reviewer_saw_target_path_summary`) is **rejected** with reason
  `missing_safety_ack`.
- [ ] A3: The response correctly states Request C is **accepted** because
  BOTH `reviewer_saw_behavior_change_warning` AND
  `reviewer_saw_target_path_summary` are true.
- [ ] A4: The response correctly states that `deactivate` requires only
  `reviewer_saw_behavior_change_warning` (NOT target_path_summary).
- [ ] A5: The agent does not create, edit, or delete any files.

## Grader
code

## Grader Config
python3 - <<'PY'
import json, os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
transcript_path = os.environ.get("TRANSCRIPT_PATH")

def trial_transcript():
    if transcript_path and Path(transcript_path).exists():
        return Path(transcript_path).read_text(errors="replace")
    return ""

txt = trial_transcript()
assistant_parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else ""
al = assistant_txt.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

# A1: Request A (no safety_ack) → rejected with missing_safety_ack
# Look for the rejection reason near a mention of "A" / "first" / "no safety_ack"
a1 = bool(re.search(r"(missing_safety_ack|missing.*safety.*ack)", al)) and bool(
    re.search(r"(request a|first.*request|no.*safety_ack|without.*safety_ack|absent.*safety_ack).*(reject|missing_safety_ack)", al, re.S)
    or re.search(r"(reject|missing_safety_ack).*(request a|first.*request|no.*safety_ack|without.*safety_ack)", al, re.S)
)
emit("A1", a1, "did not state Request A is rejected with missing_safety_ack")

# A2: Request B (missing target_path_summary) → rejected with missing_safety_ack
a2 = bool(
    re.search(r"(request b|second.*request|missing.*target_path_summary|without.*target_path_summary).*(reject|missing_safety_ack)", al, re.S)
    or re.search(r"(reject|missing_safety_ack).*(request b|second.*request|missing.*target_path_summary|without.*target_path_summary)", al, re.S)
)
emit("A2", a2, "did not state Request B is rejected because target_path_summary ack is missing")

# A3: Request C accepted because both flags true
a3 = bool(
    re.search(r"(request c|third.*request|both.*(true|provided|set))", al, re.S)
) and bool(re.search(r"(accept|allowed|succeed|pass)", al))
emit("A3", a3, "did not state Request C is accepted with both ack flags true")

# A4: deactivate requires only reviewer_saw_behavior_change_warning (no target_path_summary)
a4 = bool(
    re.search(r"deactivate.*(only|just).*reviewer_saw_behavior_change_warning", al, re.S)
    or re.search(r"deactivate.*reviewer_saw_behavior_change_warning.*(no|without|not).*(target_path_summary)", al, re.S)
    or re.search(r"deactivate.*(reviewer_saw_behavior_change_warning).*(suffic|enough|alone)", al, re.S)
)
emit("A4", a4, "did not correctly identify deactivate's minimum safety_ack requirements")

# A5: no file writes
write_tool_call = re.search(r"(?im)^\[Tool: (?:Write|Edit|MultiEdit|Bash)\]", txt)
a5 = not bool(write_tool_call)
emit("A5", a5, "agent used write/edit/bash tool — should only read")

sys.exit(0 if all([a1, a2, a3, a4, a5]) else 1)
PY

## Trials
5

## Version
1
