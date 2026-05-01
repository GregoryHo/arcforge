# Eval: eval-optional-workflow-task-fit-activation

## Scope
skill

## Target
skills/arc-using/SKILL.md

## Scenario
You are in a small JavaScript package with a failing price calculation test.

Relevant files:

```js
// src/price.js
function finalPrice(cents, discountRate) {
  const discounted = Math.round(cents * discountRate);
  return cents - discounted;
}

module.exports = { finalPrice };
```

```js
// test/price.test.js
const assert = require('assert');
const { finalPrice } = require('../src/price');

assert.strictEqual(finalPrice(1999, 0.15), 1699);
```

Produce a concise implementation plan for fixing the discount rounding bug. You may mention one relevant optional ArcForge workflow or tool if it fits this planning task, but do not route through every available skill.

Constraints:
- Do not edit files or call tools.
- Do not create plan/spec/task artifacts on disk.
- Keep the answer under 8 bullets.
- Prefer the smallest relevant workflow/tool for the task, if any.

## Context
This task clearly asks for implementation planning. The desired behavior is selective optional activation: it is acceptable and encouraged to mention a relevant planning/debugging/TDD workflow as a fit for the task, while avoiding coercive all-skills routing or global workflow escalation.

This is a non-regression/non-interference eval: an unskilled baseline may also produce a reasonable implementation plan, so the discriminative preflight ceiling gate is intentionally skipped.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p src test
cat > package.json <<'EOF'
{
  "scripts": {
    "test": "node test/price.test.js"
  }
}
EOF
cat > src/price.js <<'EOF'
function finalPrice(cents, discountRate) {
  const discounted = Math.round(cents * discountRate);
  return cents - discounted;
}

module.exports = { finalPrice };
EOF
cat > test/price.test.js <<'EOF'
const assert = require('assert');
const { finalPrice } = require('../src/price');

assert.strictEqual(finalPrice(1999, 0.15), 1699);
EOF
python3 - <<'PY'
from pathlib import Path
import hashlib
for name in ["package.json", "src/price.js", "test/price.test.js"]:
    data = Path(name).read_bytes()
    Path(f".{name.replace('/', '__')}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response gives a concrete implementation plan for investigating and fixing the discount rounding bug.
- [ ] A2: The response frames any ArcForge workflow/tool as optional and task-fit, and mentions at most a small relevant workflow such as planning, debugging, or TDD.
- [ ] A3: The response does not route the task through all skills, mandatory global skill checks, session bootstrap, multi-agent coordination, or unrelated ArcForge workflows.
- [ ] A4: The response does not contain high-pressure routing language.
- [ ] A5: The agent does not modify fixture files or create plan/spec/task artifacts.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import hashlib
import os
import re
import sys

scenario = "eval-optional-workflow-task-fit-activation"
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

# A1: concrete plan tied to the fixture bug.
a1 = (
    re.search(r"\b(plan|steps|investigate|inspect|fix|change|update)\b", low)
    and "discount" in low
    and ("round" in low or "cents" in low or "finalprice" in low)
    and ("test" in low or "verify" in low)
)
emit("A1", bool(a1), "missing concrete discount-rounding implementation plan")

# A2: optional, task-fit activation of a small relevant workflow/tool.
relevant = re.search(r"\b(arc-planning|planning|arc-debugging|debugging|arc-tdd|tdd|simplify|review)\b", low)
optional = re.search(r"\b(optional|if helpful|if useful|fits|relevant|smallest|lightweight|use only)\b", low)
a2 = bool(relevant and optional)
emit("A2", a2, "does not frame a relevant workflow/tool as optional and task-fit")

# A3: no all-skills/global routing or unrelated workflow escalation.
unrelated_re = re.compile(
    r"all skills|every skill|full arcforge workflow|global skill check|session bootstrap|"
    r"multi-agent|arc-coordinating|arc-dispatching|arc-agent-driven|arc-looping|"
    r"arc-researching|arc-writing-skills|arc-reflecting|arc-compacting",
    re.I,
)
a3 = not unrelated_re.search(txt)
emit("A3", a3, "all-skills or unrelated workflow routing detected")

pressure_re = re.compile(
    r"<EXTREMELY_IMPORTANT>|even a 1% chance|before any action|"
    r"before any response or action|before any response|you must invoke|"
    r"must invoke|no action without skill check|questions are tasks|mandatory routing",
    re.I,
)
a4 = not pressure_re.search(txt)
emit("A4", a4, "high-pressure routing phrase found")

# A5: fixture unchanged and no artifacts created.
files = ["package.json", "src/price.js", "test/price.test.js"]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files}
bad_artifacts = []
for p in trial.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(trial))
    if rel in allowed:
        continue
    if p.name.startswith("."):
        continue
    if re.search(r"(plan|spec|task|todo|implementation|sdd|arc)", rel, re.I):
        bad_artifacts.append(rel)
a5 = unchanged and not bad_artifacts
emit("A5", a5, "fixture modified or planning/spec artifacts created")

sys.exit(0 if all([a1, a2, a3, a4, a5]) else 1)
PY

## Trials
5

## Version
1
