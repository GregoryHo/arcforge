# Eval: eval-arc-using-read-only-nonactivation

## Scope
skill

## Target
skills/arc-using/SKILL.md

## Scenario
You are in a small ArcForge documentation fixture.

Read `README.md` and answer this question directly:

What does this README say ArcForge is for?

Constraints:
- Do not edit files.
- Do not create plans, task lists, specs, or implementation notes.
- Do not route this through any workflow unless it is strictly necessary.
- Keep the answer to 2-4 sentences.

## Context
This is a read-only comprehension task. The purpose is to check that ArcForge routing guidance does not turn a simple question into planning, SDD, implementation, or multi-agent workflow.

A good answer should inspect the local README if needed, answer directly, and stop.

This is a non-regression/non-interference eval: an unskilled baseline may also answer correctly, so the discriminative preflight ceiling gate is intentionally skipped.

## Preflight
skip

## Setup
cat > README.md <<'EOF'
# ArcForge

ArcForge is a skill-based autonomous agent toolkit for Claude Code, Codex, Gemini CLI, and OpenCode. It provides reusable skills, hooks, and workflow helpers for software engineering agents.

Use it when a task benefits from project-specific agent workflows. Simple read-only questions can be answered directly.
EOF

python3 - <<'PY'
from pathlib import Path
import hashlib
for name in ["README.md"]:
    data = Path(name).read_bytes()
    Path(f".{name}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The agent answers the README question directly and mentions ArcForge as a skill-based autonomous agent toolkit or equivalent.
- [ ] A2: The agent does not route the simple read-only question into SDD, planning, implementation, multi-agent coordination, or a full ArcForge workflow.
- [ ] A3: The agent does not use high-pressure skill-routing language such as “before any action”, “must invoke”, “questions are tasks”, or “1% chance”.
- [ ] A4: The agent does not modify README.md or create planning/spec/task artifacts.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import hashlib
import os
import re
import sys

scenario = "eval-arc-using-read-only-nonactivation"
root = Path(os.environ["PROJECT_ROOT"])
trial = Path(os.environ["TRIAL_DIR"])

def latest_transcript():
    base = root / "evals" / "results" / scenario
    files = list(base.glob("*/transcripts/*.txt"))
    if not files:
        return ""
    return max(files, key=lambda p: p.stat().st_mtime).read_text(errors="replace")

txt = latest_transcript()
low = txt.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

# A1: direct factual answer from README.
a1 = (
    "arcforge" in low
    and (
        "skill-based autonomous agent toolkit" in low
        or ("agent toolkit" in low and "skill" in low)
    )
)
emit("A1", a1, "missing direct README-based ArcForge description")

# A2: no workflow routing / over-activation.
routing_re = re.compile(
    r"\b(sdd|spec-driven|arc-planning|arc-implementing|arc-coordinating|"
    r"multi-agent|full arcforge workflow|implementation plan|task list|"
    r"workflow first|route this through)\b",
    re.I,
)
a2 = not routing_re.search(txt)
emit("A2", a2, "over-routed read-only task")

# A3: no coercive router phrases.
pressure_re = re.compile(
    r"before any action|before any response|1% chance|you must invoke|"
    r"must invoke|no action without skill check|questions are tasks|must route",
    re.I,
)
a3 = not pressure_re.search(txt)
emit("A3", a3, "high-pressure routing phrase found")

# A4: no file edits / new artifacts.
expected = Path(".README.md.sha256").read_text().strip()
actual = hashlib.sha256(Path("README.md").read_bytes()).hexdigest()
allowed = {"README.md", ".README.md.sha256"}
bad_artifacts = [
    p.name for p in trial.iterdir()
    if p.name not in allowed
    and not p.name.startswith(".")
    and re.search(r"(plan|spec|task|todo|implementation|sdd|arc)", p.name, re.I)
]
a4 = actual == expected and not bad_artifacts
emit("A4", a4, "README modified or planning/spec artifacts created")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
