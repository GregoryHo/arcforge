# Eval: dashboard-promote-gate

**Status**: Active — Slice F implementation gate.

## Scope
skill

## Target
skills/arc-learning/SKILL.md

## Scenario
A project-scoped instinct candidate with status `pending_review` exists in
`~/.arcforge/learning/candidates/queue.jsonl`. The reviewer uses the
ArcForge learning dashboard to issue a `[Promote]` action on that candidate.

Review the candidate queue after the promote action and answer:
1. Does a new global-scoped candidate exist with
   `relationships.promoted_from_candidate_id` pointing at the source?
2. Has the source candidate's `lifecycle.status` changed?
3. Do both candidates appear in `readCurrentCandidates()`?

Relevant files:
- `queue.jsonl` — candidate queue after the promote action.
- Source candidate_id: `cand_project_source_001`
- Expected new global candidate has `scope.kind === "global"` and
  `relationships.promoted_from_candidate_id === "cand_project_source_001"`.

Constraints:
- Use Read only; do not run Bash, including file-inspection commands.
- Do not edit files.
- Keep the answer under 10 bullets.

## Context
This scenario validates the Layer 6 promote contract from the Slice F spec:
- `[Promote]` creates a new global-scope candidate from a project-scope source.
- The source candidate's status does NOT change (promote is a
  candidate-producing action, not a status-changing action).
- Both candidates appear in the current candidate view after the action.
- The new global candidate's `relationships.promoted_from_candidate_id`
  references the source candidate_id.

The promote gate is critical because it is the mechanism by which
project-learned instincts can be elevated to global scope for review.
Incorrect behavior (e.g. source status changing, or no relationship link)
would silently break the promotion audit trail.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p queue-dir
python3 - <<'PY'
import json, os, pathlib

queue_path = pathlib.Path("queue-dir/queue.jsonl")
now = "2026-05-21T00:00:00Z"

# Source candidate: project-scoped, pending_review
source_record = {
    "schema_version": 1,
    "candidate_id": "cand_project_source_001",
    "artifact_type": "instinct",
    "scope": {"kind": "project", "project": "test-project", "project_id": "proj_test_001"},
    "source": {"source_type": "layer4_llm_curator"},
    "name": "prefer-edit-before-bash",
    "summary": "Always use Edit before Bash in the same turn.",
    "rationale": "Observed across 5 sessions.",
    "body": "When making file changes, prefer Edit -> Bash over Bash alone.",
    "body_source": "llm_curator",
    "domain": "workflow",
    "evidence": [{"evidence_id": "ev-001", "evidence_type": "observation", "relevance": "direct", "summary": "Edit before Bash seen in session A"}],
    "evidence_quality": "low",
    "evidence_quality_metadata": {"rule_version": "v1", "basis": {"project_obs_count": 5}},
    "lifecycle": {"status": "pending_review", "status_changed_at": now},
    "safety": {"raw_prompt_included": False, "raw_response_included": False, "raw_hook_payloads_included": False, "raw_transcripts_included": False, "edit_bodies_included": False, "skill_args_included": False},
    "dedupe": {"dedupe_key": "prefer-edit-before-bash-v1", "dedupe_basis": {"name_hash": "abc"}},
    "created_at": now,
    "updated_at": now,
}
source_event = {
    "schema_version": 1,
    "event_id": "evt_001",
    "ts": now,
    "candidate_id": "cand_project_source_001",
    "event_type": "candidate.created",
    "actor": {"layer": 5, "actor_type": "validator"},
    "record": source_record,
}

# Global candidate: created by [Promote] from the source
global_record = {
    **source_record,
    "candidate_id": "cand_global_promoted_001",
    "scope": {"kind": "global"},
    "source": {"source_type": "dashboard_promote"},
    "relationships": {"promoted_from_candidate_id": "cand_project_source_001"},
    "lifecycle": {"status": "pending_review", "status_changed_at": now},
    "created_at": now,
    "updated_at": now,
}
global_event = {
    "schema_version": 1,
    "event_id": "evt_002",
    "ts": now,
    "candidate_id": "cand_global_promoted_001",
    "event_type": "candidate.created",
    "actor": {"layer": 6, "actor_type": "dashboard"},
    "record": global_record,
}

# candidate.related event on source (records the promotion link)
related_event = {
    "schema_version": 1,
    "event_id": "evt_003",
    "ts": now,
    "candidate_id": "cand_project_source_001",
    "event_type": "candidate.related",
    "actor": {"layer": 6, "actor_type": "dashboard"},
    "patch": {"promoted_to_candidate_id": "cand_global_promoted_001"},
}

lines = [source_event, global_event, related_event]
queue_path.write_text("\n".join(json.dumps(l) for l in lines) + "\n")
print("Setup complete:", queue_path, f"({len(lines)} events)")
PY

## Assertions
- [ ] A1: The response identifies a new global-scoped candidate
  (`scope.kind === "global"`) in the queue with
  `relationships.promoted_from_candidate_id === "cand_project_source_001"`.
- [ ] A2: The response confirms that the source candidate's lifecycle
  status remains `pending_review` — it did NOT change as a result of the
  promote action.
- [ ] A3: Both the source candidate and the global candidate appear in
  the current candidate view (i.e. both are present in `readCurrentCandidates()`
  output from the queue).
- [ ] A4: The response correctly distinguishes the promote action as
  candidate-producing (creates a new candidate) rather than
  status-changing (source status unchanged).
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

# A1: identifies global candidate with promoted_from link
global_candidate = re.search(r"(global.scoped|scope.*global|cand_global_promoted_001|promoted_from_candidate_id)", al)
promoted_from_link = re.search(r"(promoted_from_candidate_id|cand_project_source_001)", al)
a1 = bool(global_candidate and promoted_from_link)
emit("A1", a1, "did not identify global candidate with promoted_from_candidate_id link")

# A2: source status unchanged (pending_review)
source_unchanged = re.search(r"(source.*pending_review|status.*unchanged|status.*not.*change|pending_review.*source|source.*status.*pending|did not change|remains pending)", al)
a2 = bool(source_unchanged)
emit("A2", a2, "did not confirm source candidate status remains pending_review")

# A3: both candidates present
both_present = (
    re.search(r"(cand_project_source_001|source candidate)", al) and
    re.search(r"(cand_global_promoted_001|global candidate)", al)
)
a3 = bool(both_present)
emit("A3", a3, "did not confirm both candidates appear in the candidate view")

# A4: promote is candidate-producing, not status-changing
candidate_producing = re.search(
    r"(candidate.producing|creates a new|new candidate|not.*status.changing|status.*not.*change|source.*unchanged|promote.*creates|created.*global)",
    al
)
a4 = bool(candidate_producing)
emit("A4", a4, "did not distinguish promote as candidate-producing rather than status-changing")

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
