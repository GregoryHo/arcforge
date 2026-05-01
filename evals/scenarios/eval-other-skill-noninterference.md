# Eval: eval-other-skill-noninterference

## Scope
skill

## Target
skills/arc-writing-skills/SKILL.md

## Scenario
Use the skill-writing guidance to draft a tiny activation section for a hypothetical skill named `tea-brewing`.

Return only this markdown section, with 2-3 bullets:

```markdown
## When to Use
- ...
```

Constraints:
- Focus on when a tea-brewing skill is useful.
- Do not discuss ArcForge global routing, session bootstrap, eval harness behavior, or unrelated skills.
- Do not edit files.
- Keep the answer domain-specific and concise.

## Context
This task targets a specific unrelated skill-writing domain. The desired behavior is non-interference: arc-using/session-start/bootstrap guidance must not override the requested domain-specific output with global routing, harness behavior, or all-skills activation advice.

This is a non-regression/non-interference eval: an unskilled baseline may also produce the requested markdown section, so the discriminative preflight ceiling gate is intentionally skipped.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response returns a markdown `## When to Use` section with 2-3 bullets about tea brewing.
- [ ] A2: The response stays focused on writing a tea-brewing skill activation section and does not discuss ArcForge global routing, session bootstrap, or eval harness behavior.
- [ ] A3: The response does not mention or route through arc-using, planning, implementation, SDD, multi-agent coordination, or all-skills checks.
- [ ] A4: The response does not contain high-pressure skill-routing language.
- [ ] A5: The agent does not create or edit files.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys

scenario = "eval-other-skill-noninterference"
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

heading = re.search(r"(?m)^##\s+When to Use\s*$", out)
bullets = re.findall(r"(?m)^\s*-\s+.+", out)
tea_terms = re.search(r"\b(tea|brew|brewing|steep|leaves|kettle|infusion)\b", low)
a1 = bool(heading and 2 <= len(bullets) <= 3 and tea_terms)
emit("A1", a1, "missing requested tea-brewing When to Use section")

interference_re = re.compile(
    r"arcforge global|global routing|session bootstrap|sessionstart|session start|"
    r"eval harness|harness behavior|all-skills|all skills|skill check",
    re.I,
)
a2 = not interference_re.search(out)
emit("A2", a2, "global routing/bootstrap/harness interference detected")

unrelated_re = re.compile(
    r"arc-using|arc-planning|arc-implementing|arc-coordinating|arc-dispatching|"
    r"multi-agent|sdd|spec-driven|implementation workflow|planning workflow|"
    r"route through|invoke .*workflow|activate .*workflow",
    re.I,
)
a3 = not unrelated_re.search(out)
emit("A3", a3, "unrelated workflow or skill routing detected")

pressure_re = re.compile(
    r"<EXTREMELY_IMPORTANT>|even a 1% chance|before any action|"
    r"before any response or action|before any response|you must invoke|"
    r"must invoke|no action without skill check|questions are tasks|mandatory workflow",
    re.I,
)
a4 = not pressure_re.search(out)
emit("A4", a4, "high-pressure routing phrase found")

created_or_modified = []
for p in trial.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(trial))
    if rel == ".git" or rel.startswith(".git/") or p.name.startswith("."):
        continue
    if re.search(r"(skill|tea|brewing|when-to-use|plan|spec|task|todo|arc)", rel, re.I):
        created_or_modified.append(rel)
a5 = not created_or_modified
emit("A5", a5, "files were created or edited")

sys.exit(0 if all([a1, a2, a3, a4, a5]) else 1)
PY

## Trials
5

## Version
1
