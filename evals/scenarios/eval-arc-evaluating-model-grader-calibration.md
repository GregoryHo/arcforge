# Eval: eval-arc-evaluating-model-grader-calibration

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing an eval plan before using it as release evidence. The user says:

> The behavior claim is qualitative: the agent should produce a high-quality eval-design critique. We will use a model grader with a vague 1-5 rubric. One model-grader run says treatment is better, so I want to call the skill improved. Do we need anything else?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Focus on model/human grader calibration and the release claim.

## Context
This checks whether `arc-evaluating` treats model/human grading as noisy semantic judgment that needs calibration, anchored rubrics, blind comparison or human spot-checks, and repeated evidence before being used as a release gate. The expected behavior is not to treat one vague model-grader preference as deterministic proof of improvement.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response says one vague model-grader run is insufficient or noisy release evidence, not deterministic proof of improvement.
- [ ] A2: The response requires a concrete calibrated rubric, anchors/examples, or task-derived criteria before trusting semantic scores.
- [ ] A3: The response recommends blind comparison, human review/spot-check, or independent adjudication to reduce grader bias.
- [ ] A4: The response requires repeated trials, CI/variance, agreement checks, or consistency across runs before claiming improvement.
- [ ] A5: The response treats qualitative/model grading as semantic judgment with possible drift/noise rather than deterministic proof.

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

insufficient = re.search(r"\b(one|single|vague|noisy|insufficient|not enough|cannot|can't|do not|don't)\b", low) and re.search(r"\b(model[- ]grader|model grading|grader run|release evidence|proof|improvement)\b", low)
rubric = re.search(r"\b(calibrat(?:e|ed|ion)|rubric|anchor|examples?|criteria|task[- ]derived|scoring guide)\b", low) and re.search(r"\b(concrete|explicit|specific|fixed|before|trust|semantic|quality)\b", low)
blind_or_human = re.search(r"\b(blind|anonymi[sz]ed|human|review|spot[- ]check|adjudicat|independent|bias)\b", low)
repeat = re.search(r"\b(repeated|multiple|trials?|k\s*[=>]|variance|ci|confidence interval|consistency|agreement|inter[- ]rater|across runs)\b", low)
separate = re.search(r"\b(semantic|qualitative|quality|model[- ]grader|model grading|judgment)\b", low) and re.search(r"\b(noisy|noise|drift|not deterministic|not proof|not .*deterministic|cannot prove|can't prove|not calibrated|calibrat)\b", low)
checks = [bool(insufficient), bool(rubric), bool(blind_or_human), bool(repeat), bool(separate)]
for i, ok in enumerate(checks, 1): emit(f"A{i}", ok, "missing required model-grader calibration behavior")
sys.exit(0 if all(checks) else 1)
PY

## Trials
5

## Version
2
