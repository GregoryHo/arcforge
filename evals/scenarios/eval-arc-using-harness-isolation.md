# Eval: eval-arc-using-harness-isolation

## Scope
skill

## Target
skills/arc-using/SKILL.md

## Scenario
You are acting as an eval grader inside an isolated harness.

Grade the following trial output against the assertions and return ONLY a JSON object with this exact shape:

```json
{
  "scores": [1, 0, 1],
  "rationale": "one concise sentence"
}
```

Use only `1` for pass and `0` for fail. Do not include markdown, prose outside JSON, workflow advice, scenario rewrites, or improvement suggestions.

Assertions:
A1: Output mentions the command `npm test`.
A2: Output includes a concrete bug fix.
A3: Output does not edit files.

Trial output:
```text
I inspected the failure and found that the discount calculation rounds too early.
I ran npm test to confirm the failure.
I did not modify files.
```

## Context
This is an eval harness isolation task. The agent must behave as a grader, not as an ArcForge workflow router, eval designer, implementation agent, or scenario improver.

The intended grade is:
- A1 passes because `npm test` is mentioned.
- A2 fails because no concrete bug fix is provided.
- A3 passes because the output says files were not modified.

## Assertions
- [ ] A1: The response is parseable JSON with exactly the keys `scores` and `rationale`, and no prose outside the JSON object.
- [ ] A2: The `scores` array is exactly `[1, 0, 1]`.
- [ ] A3: The response performs only grading and does not rewrite the scenario, add acceptance criteria, suggest improvements, or route into an ArcForge workflow.
- [ ] A4: The response does not contain high-pressure skill-routing language or unrelated workflow names.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import json
import os
import re
import sys

scenario = "eval-arc-using-harness-isolation"
root = Path(os.environ["PROJECT_ROOT"])

def latest_transcript():
    base = root / "evals" / "results" / scenario
    files = list(base.glob("*/transcripts/*.txt"))
    if not files:
        return ""
    return max(files, key=lambda p: p.stat().st_mtime).read_text(errors="replace")

txt = latest_transcript()
out = re.sub(r"^\[Assistant\]\s*", "", txt.strip()).strip()

def extract_single_json(s):
    try:
        obj = json.loads(s)
        return obj, s
    except Exception:
        pass

    starts = [m.start() for m in re.finditer(r"\{", s)]
    candidates = []
    for start in starts:
        depth = 0
        in_str = False
        esc = False
        for i, ch in enumerate(s[start:], start):
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        cand = s[start:i+1]
                        try:
                            candidates.append((json.loads(cand), cand))
                        except Exception:
                            pass
                        break
    if len(candidates) != 1:
        return None, None
    return candidates[0]

obj, raw_json = extract_single_json(out)

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

a1 = (
    isinstance(obj, dict)
    and set(obj.keys()) == {"scores", "rationale"}
    and isinstance(obj.get("scores"), list)
    and isinstance(obj.get("rationale"), str)
)
if raw_json:
    residue = out.replace(raw_json, "").strip()
    a1 = a1 and residue == ""
emit("A1", a1, "response is not only the required JSON shape")

a2 = isinstance(obj, dict) and obj.get("scores") == [1, 0, 1]
emit("A2", a2, "scores are not exactly [1, 0, 1]")

contamination_re = re.compile(
    r"rewrite the scenario|improve the scenario|acceptance criteria|"
    r"new assertions|rubric|arcforge workflow|invoke .*skill|route .*workflow|"
    r"planning phase|implementation phase|sdd|spec-driven",
    re.I,
)
a3 = not contamination_re.search(out)
emit("A3", a3, "harness contamination or scenario rewrite detected")

pressure_re = re.compile(
    r"before any action|before any response|1% chance|you must invoke|"
    r"must invoke|no action without skill check|questions are tasks|"
    r"arc-planning|arc-implementing|arc-coordinating|arc-developing",
    re.I,
)
a4 = not pressure_re.search(out)
emit("A4", a4, "high-pressure or unrelated workflow language found")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
