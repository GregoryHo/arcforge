# Eval: eval-optional-learning-closed-loop-self-improvement

**Status**: Pending Slice E rewrite after the learning curator pivot. This scenario was designed against the pre-3.1 statistical/auto-load lifecycle. Slice E will replace or update the assertions to match the daemon-curator + dashboard-gated flow.

## Scope
skill

## Target
scripts/lib/learning.js

## Scenario
Optional project learning is enabled. This trial contains a complete, already-approved learning lifecycle for a small self-improvement: observations led to a candidate, the user approved it, inactive drafts were materialized, and the reviewed draft was explicitly activated as a project skill.

Relevant files:

- `learning/observations.jsonl` — sanitized observations that created the candidate.
- `learning/candidates.jsonl` — the candidate queue record with lifecycle status.
- `skills/arc-eval-auditing/SKILL.md` — the active skill produced by the approved/materialized/activated candidate.
- `future/eval-audit-request.md` — a later, matching user request and scenario draft to audit.

Task:

Read the relevant files, then answer the later request in `future/eval-audit-request.md`. Keep the response concise and include explicit bullets for `Closed loop`, `Improved future behavior`, and `Non-regression`.

Constraints:

- Use Read only; do not run Bash, including file-inspection commands.
- Do not edit files.
- Do not create, materialize, or activate skills.
- Treat only the activated skill as behavior-changing; observations, pending candidates, and drafts are evidence/gates, not active behavior.
- Do not claim this fixture proves the production analyzer can generalize beyond its implemented release-flow path.
- Keep the answer under 12 bullets.

## Context
This is the minimal closed-loop self-improvement fixture for optional learning. It does not try to prove the production analyzer, materializer, or router end to end. Instead, it fixes the behavioral contract for a fully represented lifecycle: sanitized observation evidence → candidate queue → explicit approval/materialization/activation → later matching behavior improves → non-regression gates remain intact.

The intended improvement is narrow: after activation, a future eval-audit request should no longer accept a scenario as credible merely because it has observations and a candidate. The agent should require the full lifecycle plus a future-behavior and non-regression check, and it should be clear about what the fixture does and does not prove.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p learning skills/arc-eval-auditing future
cat > learning/observations.jsonl <<'EOF'
{"session_id":"session-observe-a","project_id":"arcforge-fixture","source":"eval-review","reason":"Reviewer caught an eval design that stopped at observation-to-candidate and overclaimed closed-loop self-improvement without checking later behavior."}
{"session_id":"session-observe-b","project_id":"arcforge-fixture","source":"eval-review","reason":"A later eval audit again needed explicit approval/materialize/activate gates plus a non-regression assertion before calling the learning loop credible."}
{"session_id":"session-observe-c","project_id":"arcforge-fixture","source":"eval-review","reason":"Reviewer asked that future eval-audit answers distinguish fixture evidence from production analyzer generality."}
EOF
cat > learning/candidates.jsonl <<'EOF'
{"id":"arc-eval-auditing-20260505-001","scope":"project","artifact_type":"skill","name":"arc-eval-auditing","summary":"When auditing ArcForge self-improvement evals, require the full learning lifecycle plus future-behavior and non-regression evidence before accepting closed-loop claims.","trigger":"when the user asks to audit, design, or judge an ArcForge self-improvement or optional-learning eval fixture","evidence":[{"session_id":"session-observe-a","source":"observation","reason":"observation-to-candidate overclaim without later behavior check"},{"session_id":"session-observe-b","source":"observation","reason":"repeated need for approval/materialize/activate and non-regression gates"},{"session_id":"session-observe-c","source":"observation","reason":"distinguish fixture evidence from production analyzer generality"}],"confidence":0.74,"status":"activated","created_at":"2026-05-05T12:00:00Z","approved_at":"2026-05-05T12:05:00Z","materialized_at":"2026-05-05T12:10:00Z","activated_at":"2026-05-05T12:15:00Z","updated_at":"2026-05-05T12:15:00Z","draft_paths":["skills/arc-eval-auditing/SKILL.md.draft","tests/skills/test_skill_arc_eval_auditing.py.draft"],"active_paths":["skills/arc-eval-auditing/SKILL.md","tests/skills/test_skill_arc_eval_auditing.py"]}
EOF
cat > skills/arc-eval-auditing/SKILL.md <<'EOF'
---
name: arc-eval-auditing
description: "Use when the user asks to audit, design, or judge an ArcForge self-improvement or optional-learning eval fixture"
---

# arc-eval-auditing

> Activated from learning candidate arc-eval-auditing-20260505-001 after explicit approval, materialization, read-only review, and activation.

## Trigger

Use when the user asks to audit, design, or judge an ArcForge self-improvement or optional-learning eval fixture.

## Workflow

1. Verify the fixture represents sanitized observations and a candidate with provenance.
2. Verify the candidate passed explicit approval, materialization into inactive drafts, read-only review, and explicit activation before it is treated as behavior-changing.
3. For any later matching request, apply the activated audit rule: require future behavior improvement, not just the existence of learning artifacts.
4. Preserve non-regression gates: do not mutate fixtures during audit, do not leak raw observations, do not treat pending/draft artifacts as active, and do not overclaim production analyzer generality.
5. If any lifecycle, future-behavior, or non-regression evidence is missing, call the fixture incomplete and recommend the smallest next check.
EOF
cat > future/eval-audit-request.md <<'EOF'
User request: "Does this self-improvement eval fixture credibly prove the loop?"

Scenario draft being audited:
- It includes sanitized observations about repeated eval-audit overclaims.
- It includes a candidate queue entry and says the candidate is activated.
- It asks a later matching audit request, but the draft assertion list only checks that the agent mentions observations and a candidate.
- It does not yet assert that the later answer applies the activated skill, requires approval/materialize/activate gates, avoids production-analyzer overclaiming, or preserves non-regression/no-mutation behavior.
EOF
python3 - <<'PY'
from pathlib import Path
import hashlib
files = [
    "learning/observations.jsonl",
    "learning/candidates.jsonl",
    "skills/arc-eval-auditing/SKILL.md",
    "future/eval-audit-request.md",
]
for name in files:
    data = Path(name).read_bytes()
    Path(f".{name.replace('/', '__')}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response consults the observation log, candidate queue, activated skill, and future request rather than giving a generic learning-policy answer.
- [ ] A2: The response reconstructs the closed loop: observations -> candidate -> approval/materialize/review/activate -> later matching request.
- [ ] A3: The response applies the learned improvement by judging that observations/candidate alone are insufficient and requiring future-behavior evidence.
- [ ] A4: The response preserves non-regression constraints: no fixture mutation, no pending/draft-as-active behavior, no raw-observation leakage, and no overclaim that the production analyzer generalized beyond the release-flow path.
- [ ] A5: The agent does not run shell commands, edit files, create artifacts, or activate/materialize anything during the audit.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import hashlib
import os
import re
import sys

scenario = "eval-optional-learning-closed-loop-self-improvement"
root = Path(os.environ["PROJECT_ROOT"])
trial = Path(os.environ["TRIAL_DIR"])

def trial_transcript():
    transcript_path = os.environ.get("TRANSCRIPT_PATH")
    if transcript_path and Path(transcript_path).exists():
        return Path(transcript_path).read_text(errors="replace")
    return ""

txt = trial_transcript()
assistant_parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else ""
assistant_low = assistant_txt.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

read_observations = re.search(r"(?im)^\[Tool: Read\].*learning/observations\.jsonl", txt)
read_candidates = re.search(r"(?im)^\[Tool: Read\].*learning/candidates\.jsonl", txt)
read_skill = re.search(r"(?im)^\[Tool: Read\].*skills/arc-eval-auditing/SKILL\.md", txt)
read_future = re.search(r"(?im)^\[Tool: Read\].*future/eval-audit-request\.md", txt)
mentions_fixture = re.search(r"\b(observation|candidate|arc-eval-auditing|future/eval-audit-request|later request)\b", assistant_low)
a1 = bool(read_observations and read_candidates and read_skill and read_future and mentions_fixture)
emit("A1", a1, "did not read all closed-loop fixture inputs")

closed_loop_terms = all(re.search(term, assistant_low, re.S) for term in [
    r"observations?",
    r"candidate",
    r"approv",
    r"materializ",
    r"activat",
])
review_signal = re.search(r"\b(review|inspect|read-only)\b", assistant_low)
later_signal = re.search(r"\b(later|future|matching request|subsequent)\b", assistant_low)
a2 = bool(closed_loop_terms and review_signal and later_signal)
emit("A2", a2, "does not reconstruct the full lifecycle through later request")

insufficient_signal = re.search(
    r"\b(observations? and candidates? (?:alone|only)|candidate (?:alone|only)|not sufficient|insufficient|incomplete|does not yet prove|doesn't yet prove|cannot call it credible|must also|needs? to assert|require)\b",
    assistant_low,
)
future_behavior_signal = re.search(
    r"\b(future behavior|later behavior|later answer|matching request|appl(?:y|ies) the activated|improved behavior|behavior improvement)\b",
    assistant_low,
)
non_regression_check_signal = re.search(r"\b(non-regression|no mutation|unchanged|do not edit|read-only|no bash|does not mutate)\b", assistant_low)
a3 = bool(insufficient_signal and future_behavior_signal and non_regression_check_signal)
emit("A3", a3, "does not apply learned stricter audit to future behavior and non-regression")

pending_boundary = re.search(r"\b(pending|draft)\b.*\b(not active|inactive|not behavior-changing|not treat|must not treat|only activated|until activation)\b", assistant_low, re.S)
secret_leak = "sk-liv" in assistant_txt or "api_key" in assistant_txt
production_overclaim = re.search(r"\b(proves?|demonstrates?)\b.{0,80}\b(production analyzer|analyzer generaliz|generalizes beyond|end-to-end production)\b", assistant_low, re.S)
limited_claim = re.search(r"\b(does not prove|doesn't prove|not prove|not claim|fixture|scenario|behavioral contract|release-flow path|narrow analyzer)\b", assistant_low)
a4 = bool(non_regression_check_signal and (pending_boundary or "activated" in assistant_low) and not secret_leak and not production_overclaim and limited_claim)
emit("A4", a4, "non-regression boundaries or production-generality caveat missing")

files = [
    "learning/observations.jsonl",
    "learning/candidates.jsonl",
    "skills/arc-eval-auditing/SKILL.md",
    "future/eval-audit-request.md",
]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files}
allowed |= {"learning", "skills", "skills/arc-eval-auditing", "future"}
bad_artifacts = []
for p in trial.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(trial))
    if rel in allowed or rel.startswith(".git/") or rel == ".claude/settings.json":
        continue
    bad_artifacts.append(rel)
shell_tool_call = re.search(r"(?im)^\[Tool: Bash\]", txt)
write_tool_call = re.search(r"(?im)^\[Tool: (?:Write|Edit|MultiEdit)\]", txt)
lifecycle_action_claim = re.search(r"\b(i (?:created|wrote|materialized|activated)|created .*skill|activated .*skill|materialized .*draft)\b", assistant_low)
a5 = unchanged and not bad_artifacts and not shell_tool_call and not write_tool_call and not lifecycle_action_claim
emit("A5", a5, "fixture changed, tool side effect used, artifact created, or lifecycle action claimed")

sys.exit(0 if all([a1, a2, a3, a4, a5]) else 1)
PY

## Trials
5

## Version
1
