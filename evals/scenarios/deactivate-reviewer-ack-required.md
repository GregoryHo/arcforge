# Eval: deactivate-reviewer-ack-required

**Status**: Active — PR-B Layer 8 Blocker #3 gate.

## Scope
skill

## Target
skills/arc-learning/SKILL.md

## Scenario
An automation script attempts to deactivate an active instinct artifact via
the Layer 8 `deactivate()` API. The candidate `cand_deactivate_001` is in
`lifecycle.status === "activated"` with a successful prior activation record.

The script fires three `deactivate` requests in sequence:

- Request A: `{ candidate_id: "cand_deactivate_001", action: "deactivate" }` —
  no `reviewer_ack` field at all.
- Request B: `{ candidate_id: "cand_deactivate_001", action: "deactivate",
  reviewer_ack: { confirmed_behavior_change: false, saw_target_summary: true } }` —
  ack present but `confirmed_behavior_change` is false.
- Request C: `{ candidate_id: "cand_deactivate_001", action: "deactivate",
  reviewer_ack: { confirmed_behavior_change: true, saw_target_summary: true } }`.

Read the scenario queue and answer:
1. Should Request A be accepted or rejected? What rejection reason should
   `deactivate()` return?
2. Should Request B be accepted or rejected? Same question.
3. Should Request C be accepted? Why does this one differ from B?
4. Before PR-B, was deactivate gated by `reviewer_ack`? Why does the new
   gate matter — what would happen if it didn't exist?

Relevant files:
- `queue-dir/queue.jsonl` — candidate queue with `cand_deactivate_001` at
  `lifecycle.status === "activated"`.

Constraints:
- Use Read only; do not run Bash, including file-inspection commands.
- Do not edit files.
- Keep the answer under 12 bullets.

## Context
This scenario validates the Layer 8 deactivate `reviewer_ack` gate added by
PR-B (Blocker #3):
- The Layer 8 spec requires `reviewer_ack` for BOTH `action: "activate"` AND
  `action: "deactivate"`. The pre-PR-B implementation only gated activate.
- Reject reason: `missing_reviewer_ack`.
- The minimal valid ack must have `confirmed_behavior_change: true`.
  Missing or false → reject.
- Why this matters: without this gate, any caller (UI button, automation
  script, retry loop) can silently deactivate an active artifact — losing the
  user-installed behavior surface without confirmation. In a multi-user or
  scripted environment this is a destructive silent-failure path.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p queue-dir
python3 - <<'PY'
import json, pathlib

queue_path = pathlib.Path("queue-dir/queue.jsonl")
t0 = "2026-05-22T12:00:00Z"
t1 = "2026-05-22T12:00:10Z"
t2 = "2026-05-22T12:00:20Z"
t3 = "2026-05-22T12:00:30Z"

source_record = {
    "schema_version": 1,
    "candidate_id": "cand_deactivate_001",
    "artifact_type": "instinct",
    "scope": {"kind": "project", "project": "test-project", "project_id": "proj_test_deact"},
    "source": {"source_type": "layer4_llm_curator"},
    "name": "lint-before-commit",
    "summary": "Always lint before committing.",
    "rationale": "Observed in 6 sessions.",
    "body": "Run npm run lint before any commit to catch formatting drift.",
    "body_source": "llm_curator",
    "domain": "workflow",
    "evidence": [{"evidence_id": "ev-001", "evidence_type": "observation", "relevance": "direct", "summary": "Lint skipped, CI failed"}],
    "evidence_quality": "medium",
    "evidence_quality_metadata": {"rule_version": "v1-project_obs_count", "basis": {"project_obs_count": 6}},
    "lifecycle": {"status": "pending_review", "status_changed_at": t0},
    "safety": {"validator_version": "v1", "sanitizer_policy_version": "v1", "sanitizer_module": "scripts/lib/sanitize-observation.js", "raw_prompt_included": False, "raw_response_included": False, "raw_hook_payloads_included": False, "raw_transcripts_included": False, "edit_bodies_included": False, "skill_args_included": False, "secret_scan": {"status": "passed", "rule_version": "v1"}, "activation_claim_scan": {"status": "passed"}, "file_write_claim_scan": {"status": "passed"}},
    "dedupe": {"dedupe_key": "lint-before-commit-v1", "dedupe_basis": {"scope_kind": "project", "project_id": "proj_test_deact", "artifact_type": "instinct", "normalized_name": "lint-before-commit", "normalized_body_hash": "def456"}},
    "created_at": t0,
    "updated_at": t0,
}
events = [
    {"schema_version": 1, "event_id": "evt_001", "ts": t0, "candidate_id": "cand_deactivate_001",
     "event_type": "candidate.created", "actor": {"layer": 5, "actor_type": "validator"}, "record": source_record},
    {"schema_version": 1, "event_id": "evt_002", "ts": t1, "candidate_id": "cand_deactivate_001",
     "event_type": "candidate.transitioned", "actor": {"layer": 6, "actor_type": "dashboard"},
     "action": "approve", "from_status": "pending_review", "to_status": "approved"},
    {"schema_version": 1, "event_id": "evt_003", "ts": t2, "candidate_id": "cand_deactivate_001",
     "event_type": "candidate.transitioned", "actor": {"layer": 6, "actor_type": "dashboard"},
     "action": "materialize", "from_status": "approved", "to_status": "materialized"},
    {"schema_version": 1, "event_id": "evt_004", "ts": t3, "candidate_id": "cand_deactivate_001",
     "event_type": "candidate.transitioned", "actor": {"layer": 6, "actor_type": "dashboard"},
     "action": "activate", "from_status": "materialized", "to_status": "activated"},
]

queue_path.write_text("\n".join(json.dumps(e) for e in events) + "\n")
print("Setup complete:", queue_path, f"({len(events)} events; final status: activated)")
PY

## Assertions
- [ ] A1: The response correctly states Request A (no `reviewer_ack`) is
  **rejected** with reason `missing_reviewer_ack`.
- [ ] A2: The response correctly states Request B (`reviewer_ack` present
  but `confirmed_behavior_change: false`) is **rejected** with reason
  `missing_reviewer_ack`.
- [ ] A3: The response correctly states Request C is **accepted** because
  `confirmed_behavior_change: true` makes the ack valid.
- [ ] A4: The response identifies that pre-PR-B deactivate had no
  reviewer_ack check (or equivalent: "previously not gated", "previously
  silent", "PR-B added this gate"), and the value of the gate is that it
  prevents silent destructive deactivation by automation/UI/retries.
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

# A1: Request A (no reviewer_ack) rejected with missing_reviewer_ack
a1_keyword = bool(re.search(r"missing_reviewer_ack|missing.*reviewer.*ack", al))
a1_ctx = bool(
    re.search(r"(request a|first.*request|no.*reviewer_ack|without.*reviewer_ack|absent).*(reject|missing_reviewer_ack)", al, re.S)
    or re.search(r"(reject|missing_reviewer_ack).*(request a|first.*request|no.*reviewer_ack|without.*reviewer_ack)", al, re.S)
)
a1 = a1_keyword and a1_ctx
emit("A1", a1, "did not state Request A is rejected with missing_reviewer_ack")

# A2: Request B (confirmed_behavior_change: false) rejected
a2 = bool(
    re.search(r"(request b|second.*request|confirmed_behavior_change.*false|false.*confirmed_behavior_change).*(reject|missing_reviewer_ack)", al, re.S)
    or re.search(r"(reject|missing_reviewer_ack).*(request b|second.*request|confirmed_behavior_change.*false|false.*confirmed_behavior_change)", al, re.S)
)
emit("A2", a2, "did not state Request B is rejected because confirmed_behavior_change is false")

# A3: Request C accepted
a3 = bool(
    re.search(r"(request c|third.*request|confirmed_behavior_change.*true)", al, re.S)
) and bool(re.search(r"(accept|allowed|succeed|pass|approved|deactivat.*succe|valid.*ack)", al))
emit("A3", a3, "did not state Request C is accepted when confirmed_behavior_change is true")

# A4: pre-PR-B had no gate; value is preventing silent destructive deactivate
a4_history = bool(
    re.search(r"(pr-?b|previously|before.*pr.?b|pre.?pr.?b|prior to|did not gate|wasn't gated|no.*previous.*check|no.*gate.*before|originally.*activate.*only)", al)
)
a4_value = bool(
    re.search(r"(silent|destructive|prevent|safeguard|automation|script|retry|loss.*behavior|lose.*active|accidental|unintended|guard.*against)", al)
)
a4 = a4_history and a4_value
emit("A4", a4, "did not explain pre-PR-B history AND value of the new gate")

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
