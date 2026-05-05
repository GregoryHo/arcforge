# Eval: eval-arc-evaluating-metric-regression-separation

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing a treatment that passes all behavioral assertions. The user says:

> Treatment pass rate is 100%, baseline pass rate is 100%, but treatment uses about 3x output tokens and takes about 3x longer. The behavioral score is green, so can we ignore the metrics and ship?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Focus on metric regression versus behavioral correctness.

## Context
This checks whether `arc-evaluating` reports duration/token regressions separately from behavioral pass/fail. The expected behavior is to preserve the green correctness result but flag cost/latency regression as a separate release risk or gate.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response recognizes behavior/correctness is green or non-regressed but not improved.
- [ ] A2: The response flags 3x tokens/duration as a metric, cost, latency, or efficiency regression.
- [ ] A3: The response says metrics should be reported separately from behavioral correctness rather than ignored.
- [ ] A4: The response does not approve ignoring metrics and shipping without addressing or explicitly accepting the regression.

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

green = re.search(r"\b(behavior(?:al)?|correctness|pass rate|score)\b", low) and re.search(r"\b(green|pass(?:es|ed)?|non[- ]regress(?:ed|ion)|not improved|no lift|baseline.*100|treatment.*100)\b", low)
metric_reg = re.search(r"\b(3x|three times|tokens?|duration|latency|cost|efficien(?:cy|t)|metric)\b", low) and re.search(r"\b(regression|risk|worse|increase|slower|more expensive|costlier)\b", low)
separate = re.search(r"\b(separate|separately|orthogonal|alongside|distinct)\b", low) and re.search(r"\b(metric|cost|latency|duration|tokens?|behavior(?:al)?|correctness)\b", low)
ship_claim = re.search(r"\b(ignore the metrics|ship|approve|safe to ship)\b", low)
ship_block = re.search(r"\b(do not|don't|cannot|can't|not .*ship|should not|must not|unless|accept(?:ed)?|address(?:ed)?)\b.{0,100}\b(metrics?|regression|ship|release|cost|latency|tokens?)\b", low)
checks = [bool(green), bool(metric_reg), bool(separate), (not ship_claim or bool(ship_block))]
for i, ok in enumerate(checks, 1): emit(f"A{i}", ok, "missing required metric-regression behavior")
sys.exit(0 if all(checks) else 1)
PY

## Trials
5

## Version
1
