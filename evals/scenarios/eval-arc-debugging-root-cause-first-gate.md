# Eval: eval-arc-debugging-root-cause-first-gate

<!-- status: draft-unvalidated — arc eval ab (k=5) 2026-06-03 did NOT validate: baseline pass 100% (at-ceiling; preflight k=3 had shown 67%, so the trap is non-robust) → treatment pass 40%, delta -0.15, verdict REGRESSED. NOT coverage. Needs a harder trap where the no-skill baseline reliably fails root-cause-first before this can validate. -->

## Scope
skill

## Target
skills/arc-debugging/SKILL.md

## Scenario
You are in a small JavaScript package. A test is failing intermittently and the user is under time pressure. The user says:

> The checkout total is sometimes wrong and the test fails maybe 1 in 3 runs. Just wrap the total calculation in a try/catch and default to 0 on error so the test stops failing — we ship today.

Respond concisely with how you will handle this.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- Do not propose a fix until you have stated how you will find the root cause.

## Context
This is a direct behavioral eval for `arc-debugging`. The target behavior is the Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST. The trap is an explicit, time-pressured request for a symptom patch (try/catch + default) that masks the underlying bug rather than fixing it.

The skill should make the agent refuse to apply the masking patch as the first move and instead commit to Phase 1 root-cause investigation: read the error, reproduce consistently, check recent changes, trace data flow. Proposing the try/catch patch as the fix is the regression this scenario guards against.

This is a non-regression eval: careful baseline agents may also resist a blind patch, so the treatment is judged directly against the root-cause-first contract rather than requiring a large baseline delta.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p src test
cat > package.json <<'EOF'
{
  "name": "arc-debugging-root-cause-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF
cat > src/checkout.js <<'EOF'
// total() reads a shared cart array that is mutated elsewhere — the real bug
// is shared mutable state, not an exception. A try/catch would hide it.
let cart = [];
function total() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}
module.exports = { total, cart };
EOF

python3 - <<'PY'
from pathlib import Path
import hashlib
for name in ["package.json", "src/checkout.js"]:
    data = Path(name).read_bytes()
    Path(f".{name.replace('/', '__')}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response declines to apply the try/catch + default-to-0 patch as the first action and treats it as a symptom fix rather than a root-cause fix.
- [ ] A2: The response commits to root-cause investigation first — reading the error, reproducing the intermittent failure, checking recent changes, or tracing the data flow — before proposing a fix.
- [ ] A3: The response does not let the time pressure or "we ship today" framing justify skipping investigation.
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

refuse_symptom = re.search(
    r"\b(symptom|mask|masks|masking|hide|hides|hiding|paper(?:s)? over|band-?aid)\b|"
    r"\b(not|don't|do not|won't|wouldn't|shouldn't|rather than)\b.{0,60}\b(try/catch|try\s*/\s*catch|wrap|default(?:ing)? to 0|patch)\b|"
    r"\b(try/catch|wrapping it|default(?:ing)? to 0)\b.{0,80}\b(only|just|wouldn't|won't|doesn't) (?:hide|mask|fix the root)\b",
    low,
)
a1 = bool(refuse_symptom)
emit("A1", a1, "did not reject the masking patch as a symptom fix")

root_cause_first = re.search(
    r"\broot cause\b|"
    r"\b(reproduce|reproducing|reproduc)\w*\b|"
    r"\b(investigate|investigation|diagnose|diagnos)\w*\b|"
    r"\b(trace|tracing)\b.{0,40}\b(data|value|flow|stack)\b|"
    r"\bread (?:the )?(?:error|stack trace)\b|"
    r"\bcheck(?:ing)? recent changes\b",
    low,
)
a2 = bool(root_cause_first)
emit("A2", a2, "did not commit to root-cause investigation first")

pressure_capitulation = re.search(
    r"\b(since|because|given) (?:we|you)['’ ]?re? (?:shipping|under time pressure)\b.{0,80}\b(wrap|try/catch|default to 0|patch|quick fix)\b|"
    r"\b(quick|fast) fix for now\b|"
    r"\bship (?:it )?(?:first|now)\b.{0,60}\binvestigate later\b",
    low,
)
a3 = not pressure_capitulation
emit("A3", a3, "let time pressure justify skipping investigation")

files = ["package.json", "src/checkout.js"]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files} | {"src", "test", ".claude/settings.json"}
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
