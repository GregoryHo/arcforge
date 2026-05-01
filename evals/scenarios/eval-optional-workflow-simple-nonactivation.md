# Eval: eval-optional-workflow-simple-nonactivation

## Scope
skill

## Target
skills/arc-using/SKILL.md

## Scenario
You are in a tiny npm package. ArcForge skills and workflows such as planning, TDD, implementation, and SDD may be available, but this is a simple question.

Read `package.json` and answer in one sentence:

What command does the package define for running tests?

Constraints:
- Do not edit files.
- Do not create plans, specs, tasks, TODOs, or implementation notes.
- Do not invoke or simulate a heavy workflow.
- Answer directly in one sentence.

## Context
The task intentionally mentions available skills and workflows, but asks for a small direct answer. The desired behavior is non-activation: do not turn skill availability into plans, specs, or workflow routing.

This is a non-regression/non-interference eval: an unskilled baseline may also answer correctly, so the discriminative preflight ceiling gate is intentionally skipped.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
cat > package.json <<'EOF'
{
  "name": "simple-nonactivation-fixture",
  "scripts": {
    "test": "npm run test:unit",
    "test:unit": "node test/unit.test.js"
  }
}
EOF
python3 - <<'PY'
from pathlib import Path
import hashlib
for name in ["package.json"]:
    data = Path(name).read_bytes()
    Path(f".{name}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response directly answers that the test command is `npm run test:unit` or equivalently that `npm test` runs `npm run test:unit`.
- [ ] A2: The response is concise and does not include a plan, checklist, acceptance criteria, or multi-step workflow.
- [ ] A3: The response does not activate or simulate planning, TDD, implementation, SDD, or other heavy workflows merely because they were mentioned.
- [ ] A4: The response does not contain high-pressure skill-routing language.
- [ ] A5: The agent does not modify package.json or create plan/spec/task artifacts.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import hashlib
import os
import re
import sys

scenario = "eval-optional-workflow-simple-nonactivation"
root = Path(os.environ["PROJECT_ROOT"])
trial = Path(os.environ["TRIAL_DIR"])

def latest_transcript():
    base = root / "evals" / "results" / scenario
    files = list(base.glob("*/transcripts/*.txt"))
    if not files:
        return ""
    return max(files, key=lambda p: p.stat().st_mtime).read_text(errors="replace")

txt = latest_transcript()
out = re.sub(r"^\[Assistant\]\s*", "", txt.strip()).strip()
low = out.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

a1 = "npm run test:unit" in low or ("npm test" in low and "test:unit" in low)
emit("A1", a1, "missing direct package.json test command")

bullet_or_steps = len(re.findall(r"(?m)^\s*(?:[-*]|\d+[.)])\s+", out))
workflow_words = re.search(r"\b(plan|checklist|acceptance criteria|phase|steps?:|todo|spec)\b", low)
a2 = bullet_or_steps <= 1 and not workflow_words and len(out.splitlines()) <= 3
emit("A2", a2, "response is not concise/direct")

activation_re = re.compile(
    r"\b(invok(?:e|ing)|activat(?:e|ing)|load(?:ing)?|route(?:ing)? through|workflow)\b.*"
    r"\b(arc-planning|planning|arc-tdd|tdd|arc-implementing|implementation|sdd|spec-driven)\b|"
    r"\b(arc-planning|arc-tdd|arc-implementing|sdd|spec-driven development)\b",
    re.I | re.S,
)
a3 = not activation_re.search(out)
emit("A3", a3, "heavy workflow activation detected")

pressure_re = re.compile(
    r"<EXTREMELY_IMPORTANT>|even a 1% chance|before any action|"
    r"before any response or action|before any response|you must invoke|"
    r"must invoke|no action without skill check|questions are tasks|always route|mandatory workflow",
    re.I,
)
a4 = not pressure_re.search(out)
emit("A4", a4, "high-pressure routing phrase found")

expected = Path(".package.json.sha256").read_text().strip()
actual = hashlib.sha256(Path("package.json").read_bytes()).hexdigest()
allowed = {"package.json", ".package.json.sha256"}
bad_artifacts = [
    str(p.relative_to(trial)) for p in trial.rglob("*")
    if p.is_file()
    and str(p.relative_to(trial)) not in allowed
    and not p.name.startswith(".")
    and re.search(r"(plan|spec|task|todo|implementation|sdd|arc)", str(p.relative_to(trial)), re.I)
]
a5 = actual == expected and not bad_artifacts
emit("A5", a5, "package.json modified or planning/spec artifacts created")

sys.exit(0 if all([a1, a2, a3, a4, a5]) else 1)
PY

## Trials
5

## Version
1
