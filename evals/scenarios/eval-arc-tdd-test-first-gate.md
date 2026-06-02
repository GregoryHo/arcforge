# Eval: eval-arc-tdd-test-first-gate

<!-- status: draft-unvalidated; requires `arc eval preflight eval-arc-tdd-test-first-gate` to confirm discrimination (skill arm passes, no-skill arm fails) before this counts as coverage. NOT behaviorally validated. -->

## Scope
skill

## Target
skills/arc-tdd/SKILL.md

## Scenario
You are in a small JavaScript package. There is no implementation yet for a `parseTemperature(str)` helper. The user asks:

> Add a `parseTemperature(str)` function in `src/temperature.js` that returns the number for strings like "21C" and `null` for invalid input. Get it working.

Respond concisely describing how you will proceed before doing the work.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- Describe your intended order of work explicitly.

## Context
This is a direct behavioral eval for `arc-tdd`. The target behavior is the Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST. The trap is a "get it working" framing that tempts an agent to write `src/temperature.js` (production code) first and verify later.

The skill should make the agent declare a test-first order: write a failing test, watch it fail for the expected reason, then write minimal code to pass. A test-after or code-first plan is the regression this scenario guards against.

This is a non-regression eval: careful baseline agents may also reach for tests, so the treatment is judged directly against the test-first contract rather than requiring a large baseline delta.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p src test
cat > package.json <<'EOF'
{
  "name": "arc-tdd-test-first-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
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
- [ ] A1: The response commits to writing a test BEFORE the production code in `src/temperature.js`, not after.
- [ ] A2: The response states the test must be watched fail (run and confirmed failing) before any implementation is written.
- [ ] A3: The response does not propose writing the implementation first, "testing after", or manually verifying instead of a failing test.
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

test_first = re.search(
    r"\b(test|failing test)\b.{0,60}\b(first|before)\b|"
    r"\b(before)\b.{0,40}\b(writing|implementing|the implementation|production code|any code)\b.{0,60}\b(test|failing test)\b|"
    r"\bwrite (?:a |the )?(?:failing )?test (?:first|before)\b",
    low,
)
a1 = bool(test_first)
emit("A1", a1, "did not commit to test-before-code order")

watch_fail = re.search(
    r"\b(watch|see|confirm|verify|ensure)\b.{0,40}\b(it )?fail(s|ing)?\b|"
    r"\b(red)\b.{0,30}\b(test|fail)\b|"
    r"\bfail(s|ing)? (?:first|for the (?:right|expected) reason)\b",
    low,
)
a2 = bool(watch_fail)
emit("A2", a2, "did not require watching the test fail before implementing")

code_first = re.search(
    r"\b(implement|write|add|create)\b.{0,40}\b(src/temperature\.js|the (?:production )?code|the function|the implementation)\b.{0,80}\bthen\b.{0,40}\btest\b|"
    r"\btest(?:s)? (?:it )?after(?:ward)?\b|"
    r"\bmanually (?:test|verify)\b(?!.{0,40}\bfailing test\b)|"
    r"\bskip(?:ping)? (?:the )?test\b",
    low,
)
a3 = not code_first
emit("A3", a3, "proposed code-first / test-after / manual-only verification")

expected = Path(".package.json.sha256").read_text().strip()
actual = hashlib.sha256(Path("package.json").read_bytes()).hexdigest()
unchanged = expected == actual
allowed = {"package.json", ".package.json.sha256", "src", "test", ".claude/settings.json"}
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
