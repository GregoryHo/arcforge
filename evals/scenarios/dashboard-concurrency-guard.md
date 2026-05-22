# Eval: dashboard-concurrency-guard

**Status**: Active — PR-D implementation gate.

## Scope
skill

## Target
skills/arc-learning/SKILL.md

## Scenario
Two reviewers load the dashboard simultaneously. Both see candidate `cand_concurrency_001`
with `lifecycle.status === "pending_review"`. Reviewer A dismisses the candidate first,
which writes a `candidate.transitioned` event to `queue.jsonl` setting the status to
`dismissed`. Reviewer B then tries to approve with
`expected_current_status: "pending_review"` — but the candidate's actual status is now
`dismissed`.

Read the scenario queue and answer:
1. What is the actual current lifecycle status of `cand_concurrency_001` after
   Reviewer A's action?
2. Should Reviewer B's approve action with `expected_current_status: "pending_review"`
   be accepted or rejected? What rejection reason should be returned?
3. What HTTP status code should the dashboard server return for Reviewer B's stale request?
4. Does the stale-check allow Reviewer B to proceed when `expected_current_status`
   is absent (omitted from the request)?

Relevant files:
- `queue.jsonl` — candidate queue after Reviewer A's dismiss action.
- Source candidate_id: `cand_concurrency_001`

Constraints:
- Use Read only; do not run Bash, including file-inspection commands.
- Do not edit files.
- Keep the answer under 10 bullets.

## Context
This scenario validates the Layer 6 optimistic concurrency guard from the PR-D spec:
- `expected_current_status` in the action request is an optimistic concurrency token.
- If the client's expected status differs from the server's freshly-read status, the
  action must be rejected with `stale_status` and HTTP 409.
- If `expected_current_status` is absent or null, the guard degrades gracefully for
  backward compatibility — the action proceeds normally.
- This prevents the "double action" problem where two reviewers unknowingly act on the
  same candidate: the second reviewer gets a clear rejection signal so they can reload
  the dashboard and see the updated state.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p queue-dir
python3 - <<'PY'
import json, pathlib

queue_path = pathlib.Path("queue-dir/queue.jsonl")
t0 = "2026-05-22T10:00:00Z"
t1 = "2026-05-22T10:01:00Z"

# Source candidate: project-scoped, pending_review
source_record = {
    "schema_version": 1,
    "candidate_id": "cand_concurrency_001",
    "artifact_type": "instinct",
    "scope": {"kind": "project", "project": "test-project", "project_id": "proj_test_002"},
    "source": {"source_type": "layer4_llm_curator"},
    "name": "prefer-read-before-edit",
    "summary": "Always read a file before editing it.",
    "rationale": "Observed in 4 sessions.",
    "body": "When editing files, read first so you know the current state.",
    "body_source": "llm_curator",
    "domain": "workflow",
    "evidence": [{"evidence_id": "ev-001", "evidence_type": "observation", "relevance": "direct", "summary": "Read before Edit seen in session B"}],
    "evidence_quality": "low",
    "evidence_quality_metadata": {"rule_version": "v1", "basis": {"project_obs_count": 4}},
    "lifecycle": {"status": "pending_review", "status_changed_at": t0},
    "safety": {"raw_prompt_included": False, "raw_response_included": False, "raw_hook_payloads_included": False, "raw_transcripts_included": False, "edit_bodies_included": False, "skill_args_included": False},
    "dedupe": {"dedupe_key": "prefer-read-before-edit-v1", "dedupe_basis": {"name_hash": "def"}},
    "created_at": t0,
    "updated_at": t0,
}
create_event = {
    "schema_version": 1,
    "event_id": "evt_001",
    "ts": t0,
    "candidate_id": "cand_concurrency_001",
    "event_type": "candidate.created",
    "actor": {"layer": 5, "actor_type": "validator"},
    "record": source_record,
}

# Reviewer A dismisses the candidate (transition event)
dismiss_event = {
    "schema_version": 1,
    "event_id": "evt_002",
    "ts": t1,
    "candidate_id": "cand_concurrency_001",
    "event_type": "candidate.transitioned",
    "actor": {"layer": 6, "actor_type": "dashboard", "reviewer": "local_user"},
    "action": "dismiss",
    "from_status": "pending_review",
    "to_status": "dismissed",
}

lines = [create_event, dismiss_event]
queue_path.write_text("\n".join(json.dumps(l) for l in lines) + "\n")
print("Setup complete:", queue_path, f"({len(lines)} events)")
PY

## Assertions
- [ ] A1: The response identifies that `cand_concurrency_001` has actual status
  `dismissed` after Reviewer A's action (the transition event is present in
  `queue.jsonl`).
- [ ] A2: The response correctly states that Reviewer B's approve with
  `expected_current_status: "pending_review"` should be **rejected** with reason
  `stale_status` because the actual status is `dismissed`.
- [ ] A3: The response identifies HTTP 409 as the correct status code for a
  `stale_status` rejection.
- [ ] A4: The response correctly states that if `expected_current_status` is absent
  or null, the stale-check degrades gracefully and the action proceeds (backward
  compatibility).
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

# A1: actual status is dismissed
a1 = bool(re.search(r"(dismissed|status.*dismissed|actual.*dismissed|cand_concurrency_001.*dismissed)", al))
emit("A1", a1, "did not identify actual status as dismissed")

# A2: reviewer B's action should be rejected with stale_status
stale_rejected = bool(re.search(r"(stale_status|stale.*status|rejected.*stale|reject.*stale|should.*reject|must.*reject)", al))
a2 = bool(stale_rejected)
emit("A2", a2, "did not state reviewer B's action should be rejected with stale_status")

# A3: HTTP 409
a3 = bool(re.search(r"(409|http.*409|status.*409)", al))
emit("A3", a3, "did not identify HTTP 409 as the response status code")

# A4: absent expected_current_status degrades gracefully
a4 = bool(re.search(r"(absent.*proceed|omit.*proceed|backward.compat|degrades.*gracefully|no.*expected.*proceed|without.*expected.*proceed|null.*proceed|if.*absent|if.*omit)", al))
emit("A4", a4, "did not confirm absent expected_current_status degrades gracefully")

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
