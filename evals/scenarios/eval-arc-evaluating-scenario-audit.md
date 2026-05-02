# Eval: eval-arc-evaluating-scenario-audit

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing a proposed eval gate before a skill release. The user says:

> I made one scenario for the new skill. It asks the agent to answer a normal troubleshooting question that most agents already answer correctly. The assertions are: output file exists, no harness error, includes the word "done", and transcript is non-empty. I ran it once (`k=1`) and it passed. Is that enough to SHIP? If not, what should change?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Do not design a full replacement scenario; focus on audit findings and next steps.
- Do not claim SHIP unless the provided eval evidence is sufficient under the eval policy.

## Context
This is a direct behavioral eval for `arc-evaluating`. The target behavior is auditing eval design quality rather than rubber-stamping weak evidence.

The trap combines several known eval-design failures: baseline likely already passes, assertions measure infrastructure or generic output rather than skill-specific behavior, and `k=1` cannot support a release verdict. The expected response identifies the eval target/question/scope, flags weak or non-discriminative assertions, recommends unit/integration tests for infrastructure checks, requires behavioral assertions and enough trials (`k >= 5`), and treats the current result as `INSUFFICIENT_DATA`/not SHIP.

This is a non-regression eval: a careful baseline may also reject `k=1`, so the treatment is judged directly against the eval-design contract rather than requiring a large baseline delta.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response states the eval target/question/scope or asks/answers what behavior the skill eval is supposed to measure.
- [ ] A2: The response flags the proposed scenario as weak, non-discriminative, baseline-near-ceiling, or likely to pass without the skill.
- [ ] A3: The response identifies infrastructure/proxy assertions such as file existence, no harness error, non-empty transcript, or keyword-only checks as inappropriate behavioral eval evidence, and recommends unit/integration tests for infrastructure checks.
- [ ] A4: The response says `k=1` is insufficient, requires `k >= 5` or more trials, and uses or implies `INSUFFICIENT_DATA` rather than SHIP.
- [ ] A5: The response does not approve shipping and does not use Bash, edit files, or create artifacts.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
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

scope_signal = re.search(r"\b(eval target|target|question|scope|skill eval|behavior(?:al)?|what behavior|skill-specific behavior|agent behavior)\b", low)
measure_signal = re.search(r"\b(measure|measuring|tests?|answering|change|delta|skill present|without the skill|with the skill)\b", low)
a1 = bool(scope_signal and measure_signal)
emit("A1", a1, "missing eval target/question/scope framing")

weak_signal = re.search(r"\b(non[- ]discriminative|not discriminative|weak assertions?|weak eval|baseline (?:likely |already |near )?(?:passes|pass|ceiling|high)|near ceiling|would pass without the skill|most agents already|generic competence|no delta)\b", low)
a2 = bool(weak_signal)
emit("A2", a2, "missing non-discriminative/baseline-ceiling finding")

infra_terms = len(re.findall(r"\b(file exists|output file|harness error|no harness error|transcript|non-empty|keyword|word ['\"]?done|includes? the word|proxy assertion|infrastructure|artifact exists)\b", low))
unit_signal = re.search(r"\b(unit tests?|integration tests?|script tests?|harness tests?)\b", low)
behavior_contrast = re.search(r"\b(behavior(?:al)? eval|agent behavior|skill-specific|not .*behavior|proxy|infrastructure)\b", low)
a3 = infra_terms >= 2 and bool(unit_signal and behavior_contrast)
emit("A3", a3, "infrastructure/proxy assertions not redirected to unit/integration tests")

k_signal = re.search(r"\bk\s*[<=> ]*\s*5\b|\bk\s*=\s*1\b|\bone trial\b|\bmore trials\b|\bat least five\b", low)
insufficient = re.search(r"\binsufficient[_ -]?data\b|\binsufficient data\b|\bnot enough data\b|\bnot sufficient\b|\bstatistically (?:insufficient|meaningful)\b", low)
no_ship_context = re.search(r"\b(do not ship|don't ship|not ship|cannot ship|can't ship|not enough to ship|not sufficient to ship|no ship|needs work|blocked)\b", low)
a4 = bool(k_signal and insufficient and no_ship_context)
emit("A4", a4, "k=1 was not treated as INSUFFICIENT_DATA/not SHIP")

ship_approve = re.search(r"\b(ship|approved to ship|safe to ship|ready to ship|go ahead and ship|enough to ship)\b", low)
ship_block = re.search(r"\b(do not|don't|not|cannot|can't|insufficient|not enough|no)\b.{0,60}\b(ship|safe to ship|ready to ship|enough to ship)\b", low)
shell_tool_call = re.search(r"(?im)^\[Tool: Bash\]", txt)
files_created = [p for p in trial.rglob("*") if p.is_file() and not str(p.relative_to(trial)).startswith((".git/", ".claude/logs/")) and str(p.relative_to(trial)) != ".claude/settings.json"]
a5 = (not ship_approve or bool(ship_block)) and not shell_tool_call and not files_created
emit("A5", a5, "approved SHIP or used tools/artifacts")

sys.exit(0 if all([a1, a2, a3, a4, a5]) else 1)
PY

## Trials
5

## Version
1
