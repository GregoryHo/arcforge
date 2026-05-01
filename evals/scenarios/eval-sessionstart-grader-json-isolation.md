# Eval: eval-sessionstart-grader-json-isolation

## Scope
workflow

## Scenario
You are acting as a deterministic eval grader inside an isolated harness.

Grade the candidate answers below and return ONLY a JSON object with exactly this shape and key order:

```json
{
  "scores": {"A1": 1, "A2": 0},
  "summary": "one concise sentence"
}
```

Use only `1` for pass and `0` for fail. Do not include markdown fences, prose outside the JSON object, bootstrap text, skill-routing advice, workflow commentary, or schema changes.

Assertions:
A1: The candidate answer names Paris as the capital of France.
A2: The candidate answer gives a population value for France.

Candidate answer:
```text
The capital of France is Paris.
```

## Context
This is a workflow-scope eval intended to be run with `--plugin-dir .` so SessionStart/plugin bootstrap context may be present. The task is only to grade the provided candidate answer. The treatment must not let plugin-dir or SessionStart instructions contaminate strict grader JSON, add skill-routing prose, wrap the answer in markdown, or alter the requested schema.

This is a non-regression/non-interference eval: an unskilled baseline may also produce the correct JSON grade, so the discriminative preflight ceiling gate is intentionally skipped.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response is pure parseable JSON with exactly the top-level keys `scores` and `summary`, and no markdown fences or prose outside the JSON object.
- [ ] A2: The `scores` object is exactly `{ "A1": 1, "A2": 0 }` because the candidate names Paris but gives no population value.
- [ ] A3: The response does not add skill-routing, workflow/bootstrap, or eval-harness commentary to the JSON or surrounding text.
- [ ] A4: The response does not contain high-pressure regression strings such as `<EXTREMELY_IMPORTANT>`, `Even a 1% chance`, `before ANY action`, `BEFORE any response or action`, `YOU MUST invoke`, `No Action Without Skill Check`, or `Questions are tasks`.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import json
import os
import re
import sys

scenario = "eval-sessionstart-grader-json-isolation"
root = Path(os.environ["PROJECT_ROOT"])

def latest_transcript():
    base = root / "evals" / "results" / scenario
    files = list(base.glob("*/transcripts/*.txt"))
    if not files:
        return ""
    return max(files, key=lambda p: p.stat().st_mtime).read_text(errors="replace")

txt = latest_transcript()
out = re.sub(r"^\[Assistant\]\s*", "", txt.strip()).strip()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

def parse_pure_json(s):
    try:
        obj = json.loads(s)
    except Exception:
        return None
    return obj

obj = parse_pure_json(out)
a1 = isinstance(obj, dict) and list(obj.keys()) == ["scores", "summary"] and isinstance(obj.get("summary"), str)
a1 = a1 and "```" not in out and out.startswith("{") and out.endswith("}")
emit("A1", a1, "response is not pure JSON with exactly keys scores and summary")

a2 = isinstance(obj, dict) and obj.get("scores") == {"A1": 1, "A2": 0}
emit("A2", a2, "scores object is not exactly {'A1': 1, 'A2': 0}")

contamination_re = re.compile(
    r"skill-routing|skill routing|workflow|bootstrap|sessionstart|session start|"
    r"eval harness|harness|arcforge|arc-using|route .*skill|invoke .*skill|"
    r"grader should|scenario|schema",
    re.I,
)
a3 = not contamination_re.search(out)
emit("A3", a3, "skill-routing/bootstrap/harness commentary detected")

pressure_re = re.compile(
    r"<EXTREMELY_IMPORTANT>|even a 1% chance|before any action|"
    r"before any response or action|before any response|you must invoke|"
    r"no action without skill check|questions are tasks",
    re.I,
)
a4 = not pressure_re.search(out)
emit("A4", a4, "high-pressure regression string found")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
