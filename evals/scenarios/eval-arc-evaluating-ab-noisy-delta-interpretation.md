# Eval: eval-arc-evaluating-ab-noisy-delta-interpretation

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing A/B eval results for a proposed skill release. The user says:

> Baseline pass rate is 94%, treatment pass rate is 95%, and the 95% CI for the delta crosses zero. Treatment is technically higher. Can we call this a win and say the skill improved behavior?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Focus on interpreting the A/B result and release claim.

## Context
This checks whether `arc-evaluating` avoids overclaiming tiny/noisy deltas. The expected behavior is to distinguish non-regression from discriminative lift and to require more data, better scenario design, or a stricter decision policy before claiming improvement.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response identifies the +1 percentage point delta as tiny, noisy, inconclusive, or statistically uncertain because the CI crosses zero.
- [ ] A2: The response says this can at most support non-regression / no obvious regression, not discriminative lift or improvement.
- [ ] A3: The response recommends more trials, stronger scenarios, a clearer decision threshold, or additional evidence before claiming a win.
- [ ] A4: The response does not call the result a win or improved behavior based only on the provided numbers.

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

tiny = re.search(r"\b(1\s*(?:pp|percentage point)|\+?0\.01|tiny|small|noisy|inconclusive|uncertain|ci .*cross(?:es)? zero|confidence interval .*zero)\b", low)
nonreg = re.search(r"\b(non[- ]regression|no obvious regression|not a regression|at most|no[_ -]?change|not a win|no evidence)\b", low) and re.search(r"\b(not .*lift|not .*improvement|cannot claim|can't claim|discriminative lift|win|improved behavior|improvement)\b", low)
more = re.search(r"\b(more trials|more data|larger k|increase k|stronger scenario|more discriminative|threshold|decision policy|additional evidence|redesign)\b", low)
win_claim = re.search(r"\b(call it a win|is a win|proved improvement|improved behavior|ship as improvement|discriminative lift)\b", low)
win_block = re.search(r"\b(do not|don't|cannot|can't|not enough|insufficient|should not)\b.{0,80}\b(win|improvement|lift|improved behavior)\b", low)
checks = [bool(tiny), bool(nonreg), bool(more), (not win_claim or bool(win_block))]
for i, ok in enumerate(checks, 1): emit(f"A{i}", ok, "missing required noisy-delta behavior")
sys.exit(0 if all(checks) else 1)
PY

## Trials
5

## Version
2
