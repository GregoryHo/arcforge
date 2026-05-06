# Eval: eval-arc-evaluating-grader-selection-boundary

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing an eval plan for a skill release. The user says:

> The task output is structured JSON. I can code-grade that the JSON parses and contains the required keys, so I think we don't need any semantic/model grading. The important claim is that the agent gives a high-quality eval-design critique. Is a JSON schema grader enough?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Focus on grader choice and the release claim.

## Context
This checks whether `arc-evaluating` separates structural/code grading from semantic quality grading. The expected behavior is to use code graders for deterministic structure and model/human grading for qualitative eval-design judgment, not to treat schema validity as proof of behavioral quality.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response says JSON parsing/schema/key checks are structural or deterministic checks only.
- [ ] A2: The response says semantic quality or eval-design critique quality needs model grading, human review, or another qualitative grader.
- [ ] A3: The response recommends combining/splitting graders, such as code-grade structure and model/human-grade quality.
- [ ] A4: The response does not accept schema-valid JSON alone as sufficient release evidence for the claimed behavior.

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

structural = re.search(r"\b(structur(?:al|e)|deterministic|schema|json parses?|required keys?|key checks?|format)\b", low) and re.search(r"\b(only|not enough|insufficient|does not|doesn't|can't|cannot)\b", low)
qualitative = re.search(r"\b(semantic|quality|qualitative|eval[- ]design critique|judgment)\b", low) and re.search(r"\b(model grader|model grading|human review|human grading|qualitative grader|llm grader)\b", low)
combine = re.search(r"\b(combine|split|separate|both|two graders|code[- ]grade|code grader)\b", low) and re.search(r"\b(model|human|semantic|quality)\b", low)
reject_schema_only = re.search(r"\b(schema|json|keys?)\b", low) and re.search(r"\b(not sufficient|insufficient|not enough|alone|only|cannot support|can't support|does not prove)\b", low)
checks = [bool(structural), bool(qualitative), bool(combine), bool(reject_schema_only)]
for i, ok in enumerate(checks, 1): emit(f"A{i}", ok, "missing required grader-selection behavior")
sys.exit(0 if all(checks) else 1)
PY

## Trials
5

## Version
1
