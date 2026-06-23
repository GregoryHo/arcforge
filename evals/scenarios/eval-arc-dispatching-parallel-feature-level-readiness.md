# Eval: eval-arc-dispatching-parallel-feature-level-readiness

<!-- status: draft-unvalidated — authored 2026-06-23 (AF-14). Structurally lint-clean; discrimination NOT yet proven by a live `arc eval ab` run. Do NOT count toward validated coverage until a recorded passing run removes this marker. Discriminative behavioral coverage for skills/arc-dispatching-parallel/SKILL.md. -->

## Scope
skill

## Target
skills/arc-dispatching-parallel/SKILL.md

## Scenario
You are inside a single epic worktree that has a committed `specs/demo/dag.yaml`. Some features depend on others; some are independent. The user says:

> I've got a bunch of features in this epic's dag.yaml. Just eyeball the dependencies and run them all one at a time in order — sequential is safer so nothing collides.

Respond concisely with how you will determine which features can run in parallel and how you will execute them, before doing the work.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- State explicitly how you will determine readiness and whether you will run features in parallel or sequentially.

## Context
This is a direct behavioral eval for `arc-dispatching-parallel`. The target behaviors are: (1) determine ready features with the engine — `node "${ARCFORGE_ROOT}/scripts/cli.js" parallel --features --json` — rather than hand-parsing the dag.yaml by eye, and (2) dispatch the independent ready features in parallel rather than defaulting to sequential "to be safe."

The trap is the user's explicit "just eyeball the dependencies and run them all one at a time, sequential is safer" framing — which tempts the agent to (a) hand-parse the dag dependencies manually and (b) collapse to sequential execution even though independent features can safely run concurrently. The skill's Common Rationalizations table names exactly these: "Sequential prevents conflicts" → "Parallel is safe when no deps", and "User knows the dependencies" → "Present structured analysis."

The skill should make the agent compute readiness via the `parallel --features` CLI (not by eyeballing the YAML) and parallelize the independent ready features. Hand-parsing the dag and running everything sequentially because the user said "safer" is the regression this scenario guards against. (This is feature-level parallelism inside one worktree, distinct from epic-level `arc-dispatching-teammates`.)

This is a non-regression eval: an unskilled baseline may already reason about dependencies, so the treatment is judged directly against the engine-readiness + parallelize contract rather than requiring a large baseline delta.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p specs/demo/epics/epic-001
cat > specs/demo/dag.yaml <<'EOF'
epics:
  - id: "epic-001"
    name: "Demo Epic"
    status: "in_progress"
    worktree: null
    depends_on: []
    features:
      - id: "feat-001"
        name: "Feature A"
        status: "pending"
        depends_on: []
      - id: "feat-002"
        name: "Feature B"
        status: "pending"
        depends_on: []
      - id: "feat-003"
        name: "Feature C"
        status: "pending"
        depends_on: ["feat-001"]
EOF

python3 - <<'PY'
from pathlib import Path
import hashlib
for name in ["specs/demo/dag.yaml"]:
    data = Path(name).read_bytes()
    Path(f".{name.replace('/', '__')}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response states it will determine ready/parallelizable features using the engine (`parallel --features` / `cli.js parallel`), not by eyeballing or hand-parsing the dag.yaml dependencies.
- [ ] A2: The response dispatches the independent ready features in parallel rather than defaulting to running everything sequentially "to be safe."
- [ ] A3: The response does not adopt the user's "just eyeball it and run them all one at a time" instruction as the mechanism — it pushes back on sequential-for-safety when features are independent.
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

engine_readiness = re.search(
    r"\bparallel\b\s*--features\b|"
    r"\b(cli\.js|arcforge|coordinator(?:\.js)?)\b.{0,40}\bparallel\b|"
    r"\bparallel\b.{0,40}\b(command|cli|engine|coordinator|--json)\b",
    low,
)
a1 = bool(engine_readiness)
emit("A1", a1, "did not use the engine (parallel --features) to compute readiness")

parallelizes = re.search(
    r"\b(dispatch|run|execute|implement)\b.{0,40}\bin parallel\b|"
    r"\bin parallel\b.{0,40}\b(dispatch|run|execute|implement|feature)\b|"
    r"\bparallel group\b|"
    r"\bconcurrent(ly)?\b|"
    r"\bsimultaneous(ly)?\b",
    low,
)
a2 = bool(parallelizes)
emit("A2", a2, "did not parallelize the independent ready features")

sequential_capitulation = re.search(
    r"\b(run|execute|implement|do)\b.{0,40}\b(all|them|features)\b.{0,40}\bone at a time\b|"
    r"\bsequential(ly)?\b.{0,40}\b(safer|safe|to be safe|prevents? (?:conflicts|collision)|avoid(?:s)? (?:conflicts|collision))\b|"
    r"\b(safer|safe|to be safe)\b.{0,40}\bsequential(ly)?\b|"
    r"\beyeball\b",
    low,
)
pushes_back = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|no need|isn'?t necessary|don'?t need)\b.{0,80}\b(sequential|one at a time|eyeball)\b|"
    r"\bparallel is safe\b|"
    r"\bsafe (?:to|when) (?:run )?(?:in )?parallel\b|"
    r"\bno (?:shared )?deps?\b.{0,40}\bparallel\b|"
    r"\bindependent\b.{0,40}\bparallel\b",
    low,
)
adopts_sequential = bool(sequential_capitulation) and not bool(pushes_back)
a3 = not adopts_sequential
emit("A3", a3, "adopted eyeball + sequential-for-safety as the mechanism")

files = ["specs/demo/dag.yaml"]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files} | {
    "specs", "specs/demo", "specs/demo/epics", "specs/demo/epics/epic-001",
    ".claude/settings.json",
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
