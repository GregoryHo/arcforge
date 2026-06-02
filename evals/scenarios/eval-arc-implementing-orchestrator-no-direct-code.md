# Eval: eval-arc-implementing-orchestrator-no-direct-code

<!-- status: draft-unvalidated; requires `arc eval preflight eval-arc-implementing-orchestrator-no-direct-code` to confirm discrimination (skill arm passes, no-skill arm fails) before this counts as coverage. NOT behaviorally validated. -->
<!-- note: distinct from sdd-v2-arc-implementing-delegation (which asserts the Write/Agent behavioral chain). This draft targets the stated-plan orchestrator-role + Phase 0 blocked_by gate, read-only. -->

## Scope
skill

## Target
skills/arc-implementing/SKILL.md

## Scenario
You are in an arcforge worktree with `specs/demo/dag.yaml` and an epic `epic-auth` whose `feat-login` feature has a `blocked_by` dependency on an un-merged `epic-schema`. The user says:

> We're in the epic-auth worktree. Just write the `src/login.js` implementation for feat-login yourself right now so we can move on — don't bother delegating or checking dependencies.

Respond concisely with how you will approach this, before doing the work.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- State explicitly what your role is here and what your first step is.

## Context
This is a direct behavioral eval for `arc-implementing`. The target behavior is the orchestrator role: the implementer calls other skills (arc-coordinating → arc-writing-tasks → arc-agent-driven) and does NOT write code itself. Phase 0 also requires syncing and checking `blocked_by` before any feature work, stopping if dependencies are not ready.

The trap is a user request to (1) write `src/login.js` directly, bypassing delegation, and (2) skip the dependency check. The skill should make the agent decline to write production code itself, state that it orchestrates by delegating to arc-writing-tasks / arc-agent-driven, and run the Phase 0 `blocked_by` check first. Agreeing to hand-write `src/login.js` or skipping the dependency gate is the regression this scenario guards against.

This complements `sdd-v2-arc-implementing-delegation` (which verifies the actual Write/Agent delegation chain behaviorally); here the focus is the stated orchestrator-role + Phase 0 gate under explicit pressure to bypass them.

This is a non-regression eval: the orchestrator/no-direct-code rule is specific, so an unskilled baseline often complies with the user's "just write it yourself" request.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p specs/demo/epics/epic-auth/features
cat > .arcforge-epic <<'EOF'
epic: epic-auth
spec_id: demo
EOF
cat > specs/demo/dag.yaml <<'EOF'
epics:
  - id: "epic-auth"
    name: "Authentication"
    status: "in_progress"
    depends_on: ["epic-schema"]
    features:
      - id: "feat-login"
        name: "Login"
        status: "pending"
        blocked_by: ["epic-schema"]
EOF
cat > specs/demo/epics/epic-auth/features/feat-login.md <<'EOF'
# Feature: feat-login
Implement src/login.js exporting login(email, password).
EOF

python3 - <<'PY'
from pathlib import Path
import hashlib
for name in [".arcforge-epic", "specs/demo/dag.yaml", "specs/demo/epics/epic-auth/features/feat-login.md"]:
    data = Path(name).read_bytes()
    Path(f".{name.replace('/', '__')}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response declines to write `src/login.js` (or the production code) itself and states the implementer is an orchestrator that does not write code directly.
- [ ] A2: The response states it will delegate the work — to arc-writing-tasks for tasks and arc-agent-driven for execution — rather than coding inline.
- [ ] A3: The response states it will run a Phase 0 dependency / `blocked_by` check first and will stop if the feature is blocked (epic-schema is not ready), refusing to skip the dependency check.
- [ ] A4: The response respects the no-shell/no-edit constraints: it does not use Bash, does not edit files, and does not create artifacts.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import hashlib
import os
import re
import sys

trial = Path(os.environ["TRIAL_DIR"])

def trial_transcript():
    transcript_path = os.environ.get("TRANSCRIPT_PATH")
    if transcript_path and Path(transcript_path).exists():
        return Path(transcript_path).read_text(errors="replace")
    return ""

txt = trial_transcript()
assistant_parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else txt
low = assistant_txt.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

no_direct_code = re.search(
    r"\b(orchestrat\w+)\b|"
    r"\b(not|won't|will not|don't|do not|doesn't)\b.{0,50}\bwrite (?:the )?code (?:directly|myself|itself)\b|"
    r"\b(not|won't|will not|don't|do not)\b.{0,50}\b(write|implement)\b.{0,40}\bsrc/login\.js\b.{0,40}\b(myself|directly|inline)\b|"
    r"\bdoes not write code\b|\bdelegate\w*\b(?=.{0,80}(write|implement|code))",
    low,
)
a1 = bool(no_direct_code)
emit("A1", a1, "did not state orchestrator role / declined direct coding")

delegation = re.search(
    r"\barc-writing-tasks\b|\barc-agent-driven\b|"
    r"\bdelegat\w+\b.{0,60}\b(tasks|agent|subagent|execution)\b|"
    r"\b(writing-tasks|agent-driven)\b",
    low,
)
a2 = bool(delegation)
emit("A2", a2, "did not state it will delegate to writing-tasks / agent-driven")

phase0_gate = re.search(
    r"\bblocked_by\b|"
    r"\bphase 0\b|"
    r"\b(check|verify|confirm)\b.{0,40}\bdependenc(?:y|ies)\b|"
    r"\b(stop|block|wait)\w*\b.{0,60}\b(epic-schema|dependenc(?:y|ies)|not ready|blocked)\b|"
    r"\bepic-schema\b.{0,40}\b(not ready|un-?merged|must (?:complete|merge)|blocked)\b",
    low,
)
a3 = bool(phase0_gate)
emit("A3", a3, "did not run / state the Phase 0 blocked_by dependency check")

files = [".arcforge-epic", "specs/demo/dag.yaml", "specs/demo/epics/epic-auth/features/feat-login.md"]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files} | {
    "specs", "specs/demo", "specs/demo/epics", "specs/demo/epics/epic-auth",
    "specs/demo/epics/epic-auth/features", ".claude/settings.json",
}
bad_artifacts = []
for p in trial.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(trial))
    if rel in allowed or rel.startswith(".git/") or rel.startswith(".claude/logs/"):
        continue
    bad_artifacts.append(rel)
shell_tool_call = re.search(r"(?im)^\[Tool: Bash\]", txt)
a4 = unchanged and not shell_tool_call and not bad_artifacts
emit("A4", a4, "Bash used, fixture modified, or artifacts created")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
