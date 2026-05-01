# Eval: eval-sessionstart-minimal-bootstrap

## Scope
workflow

## Scenario
Answer this in 3-5 bullet points:

Based on your current session context, are any ArcForge/project skills available, and how should you decide whether to use them for a simple read-only question?

Constraints:
- Do not inspect the repository.
- Do not edit files.
- Do not invoke or simulate a workflow.
- Keep the answer descriptive, not procedural.

## Context
This is a workflow eval intended to be run with the full plugin environment, for example:

```bash
node scripts/cli.js eval ab eval-sessionstart-minimal-bootstrap --plugin-dir . --k 5
```

The treatment should receive SessionStart bootstrap context from the ArcForge hook. The desired behavior is a middle path: the agent can discover that ArcForge skills are available, but describes them as minimal, optional, composable tools rather than mandatory routing laws.

A bare baseline may not know about ArcForge skills. That is acceptable; the discriminative goal is that plugin treatment improves discoverability without coercive workflow pressure.

This is a non-regression/non-interference eval for minimal bootstrap behavior. Baseline behavior can be acceptable on some assertions, so the discriminative preflight ceiling gate is intentionally skipped.

## Preflight
skip

## Assertions
- [ ] A1: The response indicates that ArcForge or project skills are available in the current session context.
- [ ] A2: The response frames skills as optional/composable tools and says simple read-only questions can be answered directly when no workflow is needed.
- [ ] A3: The response says to prefer the smallest relevant skill or workflow, rather than a full ArcForge workflow by default.
- [ ] A4: The response does not include high-pressure routing language such as “before any action”, “must invoke”, “questions are tasks”, “1% chance”, or “No Action Without Skill Check”.
- [ ] A5: The response does not claim to have loaded or dump detailed contents of full ArcForge skill files.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys

scenario = "eval-sessionstart-minimal-bootstrap"
root = Path(os.environ["PROJECT_ROOT"])

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

a1 = (
    "arcforge skills are available" in low
    or ("arcforge" in low and "skills" in low and ("available" in low or "session" in low))
    or ("project skills" in low and "available" in low)
)
emit("A1", a1, "does not indicate ArcForge/project skills are available")

a2 = (
    re.search(r"\b(optional|tool|tools|not laws|not mandatory|when needed|if needed)\b", low)
    and re.search(r"\b(simple|read-only|directly|answer directly|no workflow needed)\b", low)
)
emit("A2", bool(a2), "does not frame skills as optional tools for direct/simple answers")

a3 = (
    "smallest relevant" in low
    or "smallest useful" in low
    or ("prefer" in low and "smallest" in low)
    or ("minimal" in low and ("workflow" in low or "skill" in low))
)
emit("A3", a3, "does not prefer smallest relevant/minimal skill")

pressure_re = re.compile(
    r"before any action|before any response|1% chance|you must invoke|"
    r"must invoke|no action without skill check|questions are tasks|"
    r"always invoke|always route|mandatory workflow",
    re.I,
)
a4 = not pressure_re.search(txt)
emit("A4", a4, "high-pressure routing phrase found")

full_skill_re = re.compile(
    r"#\s*arc-using|##\s*when to use|##\s*activation|"
    r"arc-brainstorming.*arc-debugging.*arc-tdd|"
    r"loaded the full .*skill|full skill file",
    re.I | re.S,
)
a5 = not full_skill_re.search(txt)
emit("A5", a5, "appears to dump or claim full skill-file contents")

sys.exit(0 if all([a1, a2, a3, a4, a5]) else 1)
PY

## Trials
5

## Version
1
