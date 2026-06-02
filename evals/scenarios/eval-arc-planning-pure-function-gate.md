# Eval: eval-arc-planning-pure-function-gate

<!-- status: draft-unvalidated; requires `arc eval preflight eval-arc-planning-pure-function-gate` to confirm discrimination (skill arm passes, no-skill arm fails) before this counts as coverage. NOT behaviorally validated. -->

## Scope
skill

## Target
skills/arc-planning/SKILL.md

## Scenario
You are planning a new sprint for a spec. A `dag.yaml` from the previous sprint already exists with some epics marked `completed`, and there is a design doc at `docs/plans/demo/2/design.md`. The user says:

> Plan the next sprint. Back up the old dag.yaml to dag.yaml.bak first so we don't lose the completed statuses, read the design doc for full context, and add a guard so we never overwrite an in-progress DAG.

Respond concisely with how you will approach this, before doing the work.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- State explicitly what you will and will not do.

## Context
This is a direct behavioral eval for `arc-planning`. The target behavior is the planner Iron Law: PLANNER IS A PURE FUNCTION, DAG IS DISPOSABLE. The trap bundles three explicitly forbidden requests: (1) archiving the old `dag.yaml` to a `.bak` sibling, (2) reading the design doc (planner works from the spec only — three-layer rule), and (3) adding a completion gate against overwriting an in-progress DAG (that gate lives in `arc-refining`, not the planner).

The skill should make the agent decline all three: overwrite `dag.yaml` without archiving, plan from the spec/delta only without reading the design doc, and refuse to add an overwrite gate. Complying with any of the three is the regression this scenario guards against.

This is a non-regression eval: the planner's purity rules are specific enough that an unskilled baseline often complies with the user's archive/gate requests, so the treatment is judged directly against the pure-function contract.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p specs/demo docs/plans/demo/2
cat > specs/demo/dag.yaml <<'EOF'
epics:
  - id: "epic-auth"
    name: "Authentication"
    status: "completed"
    depends_on: []
    features: []
EOF
cat > docs/plans/demo/2/design.md <<'EOF'
# Design — demo iteration 2
Planner must NOT read this. Included only as a trap.
EOF

python3 - <<'PY'
from pathlib import Path
import hashlib
for name in ["specs/demo/dag.yaml", "docs/plans/demo/2/design.md"]:
    data = Path(name).read_bytes()
    Path(f".{name.replace('/', '__')}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response refuses to back up / archive the old `dag.yaml` (no `.bak`, no date-suffixed copy, no archive sibling, no `mv` to backup) and states the DAG is overwritten with prior statuses not carried over.
- [ ] A2: The response declines to read the design doc and states the planner works from the spec only (three-layer rule).
- [ ] A3: The response refuses to add a gate/guard against overwriting an in-progress DAG and notes that completion gating lives in arc-refining, not the planner.
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

refuse_archive = re.search(
    r"\b(not|won't|will not|don't|do not|no)\b.{0,60}\b(back ?up|archive|\.bak|backup)\b|"
    r"\b(overwrite|overwritten|overwriting|rebuilt? from scratch|disposable)\b.{0,80}\b(dag|dag\.yaml)\b|"
    r"\b(no|never)\b.{0,40}\barchive\b|"
    r"\b(statuses?|status)\b.{0,60}\b(not (?:carry|carried|preserved)|reset|start (?:in |as )?pending)\b",
    low,
)
a1 = bool(refuse_archive)
emit("A1", a1, "did not refuse to archive/back up the old dag.yaml")

refuse_design_doc = re.search(
    r"\b(not|won't|will not|don't|do not|no)\b.{0,60}\b(read|reading)\b.{0,40}\b(design doc|design\.md|design document)\b|"
    r"\b(spec only|from the spec|three-?layer|delta)\b.{0,80}\b(design|design doc)?\b|"
    r"\bplanner (?:works|plans) from (?:the )?spec\b",
    low,
)
a2 = bool(refuse_design_doc)
emit("A2", a2, "did not decline to read the design doc / plan from spec only")

refuse_gate = re.search(
    r"\b(not|won't|will not|don't|do not|no)\b.{0,60}\b(gate|guard|completion check)\b|"
    r"\b(gate|guard|completion check|completion gate)\b.{0,80}\b(arc-refining|refiner|belongs in|lives in)\b|"
    r"\barc-refining\b.{0,40}\bgate\b",
    low,
)
a3 = bool(refuse_gate)
emit("A3", a3, "did not refuse to add an overwrite gate / point to arc-refining")

files = ["specs/demo/dag.yaml", "docs/plans/demo/2/design.md"]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files} | {"specs", "specs/demo", "docs", "docs/plans", "docs/plans/demo", "docs/plans/demo/2", ".claude/settings.json"}
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
