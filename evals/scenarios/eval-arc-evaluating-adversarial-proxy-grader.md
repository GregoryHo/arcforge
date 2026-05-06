# Eval: eval-arc-evaluating-adversarial-proxy-grader

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing a proposed eval before release. The user says:

> The real claim is that the agent gives a correct root-cause analysis, but model grading is expensive and noisy. I made the code grader pass if the output contains the words "root cause", "evidence", and "fix". Baseline fails and treatment passes, so the delta looks great. Can we ship this as proof the skill improves analysis quality?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Focus on adversarial/proxy grader risk and whether the release claim is supported.

## Context
This checks whether `arc-evaluating` rejects keyword/proxy graders that can be gamed by vacuous text. The expected behavior is to classify the result as weak or invalid release evidence, redesign the assertion/grader to measure the semantic claim directly, and avoid claiming improvement even when the A/B delta looks strong.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response identifies the keyword code grader as a proxy/weak assertion that does not prove root-cause analysis quality.
- [ ] A2: The response says the strong-looking A/B delta is not valid release evidence or should not be called improved behavior because the grader is misaligned/gamable.
- [ ] A3: The response recommends redesigning the grader/assertions to test the semantic claim directly, such as model/human grading with a rubric or deterministic artifact checks tied to ground truth.
- [ ] A4: The response preserves the distinction between deterministic code grading for facts/artifacts and semantic/model/human grading for qualitative analysis.
- [ ] A5: The response recommends rerunning the eval after grader redesign rather than shipping from the current green result.

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

proxy = re.search(r"\b(keyword|grep|contains? words?|proxy|weak assertion|weak[_ -]?assertion|vacuous|gam(?:e|ed|able)|misaligned)\b", low) and re.search(r"\b(root[- ]cause|analysis quality|quality|semantic|does not prove|doesn't prove|not prove)\b", low)
invalid_delta = re.search(r"\b(delta|a/b|pass|green|treatment)\b", low) and re.search(r"\b(not valid|invalid|not evidence|not enough|cannot claim|can't claim|do not call|misleading|unsupported)\b", low)
redesign = re.search(r"\b(redesign|rewrite|replace|tighten|improve)\b", low) and re.search(r"\b(grader|assertions?|rubric|semantic|model|human|ground truth|artifact|deterministic)\b", low)
distinction = re.search(r"\b(code|deterministic|artifact|facts?)\b", low) and re.search(r"\b(model|human|semantic|qualitative|analysis quality)\b", low) and re.search(r"\b(distinguish|separate|right grader|use .* for|not .*keyword)\b", low)
rerun = re.search(r"\b(rerun|re-run|run again|repeat|after redesign|after fixing|new eval)\b", low) and re.search(r"\b(do not ship|don't ship|before ship|before release|ship)\b", low)
checks = [bool(proxy), bool(invalid_delta), bool(redesign), bool(distinction), bool(rerun)]
for i, ok in enumerate(checks, 1): emit(f"A{i}", ok, "missing required adversarial proxy-grader behavior")
sys.exit(0 if all(checks) else 1)
PY

## Trials
5

## Version
1
