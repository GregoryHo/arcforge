# Eval: eval-plugin-dir-other-skill-isolation

## Scope
workflow

## Scenario
Create a tiny checklist for preparing a backyard bird-watching notebook.

Return only this markdown section with exactly three checklist items:

```markdown
## Bird-Watching Notebook Checklist
- [ ] ...
- [ ] ...
- [ ] ...
```

Constraints:
- Focus only on the bird-watching notebook domain.
- Do not discuss ArcForge, global routing, SessionStart, plugin-dir behavior, eval harnesses, or unrelated skills.
- Do not create or edit files.

## Context
This workflow-scope eval is intended to be run with `--plugin-dir .` so SessionStart/plugin bootstrap context may be present. The task targets a specific domain/skill-like output. The treatment must produce the requested small markdown checklist without contamination from arc-using/global routing/session bootstrap/harness terms.

This is a non-regression/non-interference eval: an unskilled baseline may also produce the requested checklist, so the discriminative preflight ceiling gate is intentionally skipped.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response is a markdown `## Bird-Watching Notebook Checklist` section with exactly three unchecked checklist items.
- [ ] A2: The checklist items are focused on preparing a backyard bird-watching notebook.
- [ ] A3: The response does not mention ArcForge, arc-using, global routing, SessionStart, plugin-dir, eval harnesses, bootstrap, SDD, planning/implementation workflows, or unrelated skills.
- [ ] A4: The response does not contain high-pressure regression strings such as `<EXTREMELY_IMPORTANT>`, `Even a 1% chance`, `before ANY action`, `BEFORE any response or action`, `YOU MUST invoke`, `No Action Without Skill Check`, or `Questions are tasks`.
- [ ] A5: The agent does not create or edit task artifacts.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys

scenario = "eval-plugin-dir-other-skill-isolation"
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

heading = re.search(r"(?m)^##\s+Bird-Watching Notebook Checklist\s*$", out)
items = re.findall(r"(?m)^- \[ \] .+", out)
extra_bullets = re.findall(r"(?m)^\s*[-*+]\s+", out)
a1 = bool(heading and len(items) == 3 and len(extra_bullets) == 3 and not out.startswith("```") and "```" not in out)
emit("A1", a1, "missing requested heading or exactly three unchecked checklist items")

domain_terms = ["bird", "watch", "notebook", "species", "date", "time", "location", "weather", "behavior", "sighting", "backyard", "binocular"]
domain_hits = sum(1 for term in domain_terms if term in low)
a2 = domain_hits >= 4 and all(re.search(r"\b(bird|watch|notebook|species|sighting|backyard|weather|behavior|location|date|time|binocular)\b", item, re.I) for item in items)
emit("A2", a2, "checklist is not focused on backyard bird-watching notebook preparation")

interference_re = re.compile(
    r"arcforge|arc-using|global routing|sessionstart|session start|plugin-dir|"
    r"plugin directory|eval harness|harness|bootstrap|sdd|spec-driven|"
    r"planning workflow|implementation workflow|workflow routing|skill selection|"
    r"unrelated skill|invoke .*skill|route .*workflow",
    re.I,
)
a3 = not interference_re.search(out)
emit("A3", a3, "ArcForge/session/harness/workflow contamination detected")

pressure_re = re.compile(
    r"<EXTREMELY_IMPORTANT>|even a 1% chance|before any action|"
    r"before any response or action|before any response|you must invoke|"
    r"no action without skill check|questions are tasks",
    re.I,
)
a4 = not pressure_re.search(out)
emit("A4", a4, "high-pressure regression string found")

created_or_modified = []
for p in trial.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(trial))
    if rel == ".git" or rel.startswith(".git/") or p.name.startswith("."):
        continue
    if re.search(r"(bird|watch|notebook|checklist|skill|workflow|plan|todo|artifact)", rel, re.I):
        created_or_modified.append(rel)
a5 = not created_or_modified
emit("A5", a5, "task artifact files were created or edited")

sys.exit(0 if all([a1, a2, a3, a4, a5]) else 1)
PY

## Trials
5

## Version
1
