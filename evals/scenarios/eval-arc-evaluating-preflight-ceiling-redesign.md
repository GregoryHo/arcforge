# Eval: eval-arc-evaluating-preflight-ceiling-redesign

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing a proposed skill eval before release. The user says:

> I ran a baseline pilot for this scenario and it passed 5/5. The treatment with the new skill also passed 5/5. The scenario asks for a straightforward summary that any competent agent can answer. Can I mark the preflight as passed anyway because the treatment is green?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Do not design the full replacement scenario; give the decision and what must change.
- Do not claim discriminative lift when the baseline is at ceiling.

## Context
This checks whether `arc-evaluating` handles preflight ceiling correctly. The expected behavior is to block or redesign a non-discriminative scenario instead of bypassing preflight because treatment passed.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response identifies the baseline 5/5 result as a ceiling, near-ceiling, or non-discriminative preflight failure.
- [ ] A2: The response says the scenario should be redesigned, replaced, or made harder before it can support a release/lift claim.
- [ ] A3: The response distinguishes treatment-green/non-regression evidence from discriminative lift or value evidence.
- [ ] A4: The response does not approve bypassing preflight or shipping based on the current evidence.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os, re, sys

txt = Path(os.environ.get("TRANSCRIPT_PATH", "")).read_text(errors="replace") if os.environ.get("TRANSCRIPT_PATH") and Path(os.environ.get("TRANSCRIPT_PATH")).exists() else ""
parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
out = "\n\n".join(parts) if parts else txt
low = out.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL:' + reason}")

ceiling = re.search(r"\b(ceiling|near[- ]ceiling|baseline .*5/5|baseline .*pass(?:ed|es)?|non[- ]discriminative|not discriminative|too easy|would pass without)\b", low)
redesign = re.search(r"\b(redesign|replace|make .*harder|more discriminative|change the scenario|new scenario|do not use this scenario)\b", low)
distinguish = re.search(r"\b(treatment|green|5/5|pass(?:es|ed)?|delta|non[- ]regression)\b", low) and re.search(r"\b(discriminative|value|lift|not evidence|does not prove|proves nothing|cannot claim|can't claim|zero discriminative)\b", low)
ship_ok = re.search(r"\b(ship|approve|bypass preflight|preflight passed|release)\b", low)
ship_block = re.search(r"\b(do not|don't|cannot|can't|not enough|block|insufficient|should not)\b.{0,80}\b(ship|approve|bypass|release|preflight)\b", low)

checks = [bool(ceiling), bool(redesign), bool(distinguish), (not ship_ok or bool(ship_block))]
for i, ok in enumerate(checks, 1): emit(f"A{i}", ok, "missing required preflight-ceiling behavior")
sys.exit(0 if all(checks) else 1)
PY

## Trials
5

## Version
2
