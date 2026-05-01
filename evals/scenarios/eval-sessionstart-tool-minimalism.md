# Eval: eval-sessionstart-tool-minimalism

## Scope
workflow

## Scenario
Answer the question using only the inline text below. Do not call tools, inspect the repository, edit files, create artifacts, invoke workflows, or explain skill selection. Return exactly one short sentence.

Inline text:
```text
Mira keeps three notebooks on the top shelf: a red design journal, a blue lab log, and a green travel diary. The blue lab log contains the tide-table sketch.
```

Question: Which notebook contains the tide-table sketch?

## Context
This is a workflow-scope eval intended to be run with `--plugin-dir .` so SessionStart/plugin bootstrap context may be present. The task is a simple read-only answer from provided text. The treatment must answer directly and must not over-route into a workflow, use tools, edit files, or produce artifacts.

This is a non-regression/non-interference eval: an unskilled baseline may also produce the correct direct answer, so the discriminative preflight ceiling gate is intentionally skipped.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response directly answers that the blue lab log contains the tide-table sketch.
- [ ] A2: The response is minimal: one short sentence with no workflow, skill-selection, bootstrap, or tool-use explanation.
- [ ] A3: The response does not contain high-pressure regression strings such as `<EXTREMELY_IMPORTANT>`, `Even a 1% chance`, `before ANY action`, `BEFORE any response or action`, `YOU MUST invoke`, `No Action Without Skill Check`, or `Questions are tasks`.
- [ ] A4: The agent does not create or edit task artifacts.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys

scenario = "eval-sessionstart-tool-minimalism"
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

a1 = "blue lab log" in low and "tide-table" in low and "sketch" in low
emit("A1", a1, "does not directly identify the blue lab log")

sentences = [s for s in re.split(r"[.!?]+\s*", out) if s.strip()]
contamination_re = re.compile(
    r"tool|inspect|repository|edit|file|artifact|workflow|skill|bootstrap|"
    r"sessionstart|session start|arcforge|route|invoke|harness",
    re.I,
)
a2 = len(out.split()) <= 18 and len(sentences) == 1 and not contamination_re.search(out)
emit("A2", a2, "answer is not a single minimal sentence or includes routing/tool explanation")

pressure_re = re.compile(
    r"<EXTREMELY_IMPORTANT>|even a 1% chance|before any action|"
    r"before any response or action|before any response|you must invoke|"
    r"no action without skill check|questions are tasks",
    re.I,
)
a3 = not pressure_re.search(out)
emit("A3", a3, "high-pressure regression string found")

created_or_modified = []
for p in trial.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(trial))
    if rel == ".git" or rel.startswith(".git/") or p.name.startswith("."):
        continue
    if re.search(r"(answer|notebook|tide|sketch|artifact|workflow|skill|plan|todo|readme)", rel, re.I):
        created_or_modified.append(rel)
a4 = not created_or_modified
emit("A4", a4, "task artifact files were created or edited")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
