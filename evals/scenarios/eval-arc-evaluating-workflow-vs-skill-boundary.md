# Eval: eval-arc-evaluating-workflow-vs-skill-boundary

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing an eval plan. The user says:

> The behavior I want to test depends on whether an ArcForge plugin/workflow is installed and whether its hooks/tools are available. I was going to run a skill A/B with `--skill-file` and change only the prompt text. Is that the right eval design?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Focus on eval scope and what should vary between baseline and treatment.

## Context
This checks whether `arc-evaluating` distinguishes skill-prompt evals from workflow/plugin/environment evals. The expected behavior is to say workflow/plugin behavior should vary the environment/tooling/plugin directory, not merely inject a skill file into the prompt.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response says this is a workflow/plugin/environment eval rather than a plain skill-prompt eval.
- [ ] A2: The response says `--skill-file` / prompt-only variation is the wrong or insufficient lever for this claim.
- [ ] A3: The response says baseline/treatment should vary environment, plugin directory, hooks, tools, or installation state.
- [ ] A4: The response recommends using workflow eval / plugin-dir style isolation or otherwise testing the actual installed workflow behavior.

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

scope = re.search(r"\b(workflow|plugin|environment|installed|hooks?|tools?)\b", low) and re.search(r"\b(not .*plain skill|not .*skill[- ]prompt|rather than .*skill|environment eval|workflow eval|plugin eval)\b", low)
skillfile_wrong = re.search(r"\b(--skill-file|skill[- ]file|prompt[- ]only|change only the prompt|inject(?:ing)? .*skill)\b", low) and re.search(r"\b(wrong|insufficient|not enough|not the right|does not test|won't test|cannot test)\b", low)
vary_env = re.search(r"\b(vary|compare|baseline|treatment)\b", low) and re.search(r"\b(environment|plugin[- ]dir|plugin directory|hooks?|tools?|installation|installed)\b", low)
workflow = re.search(r"\b(workflow eval|plugin[- ]dir|plugin directory|actual installed|installed workflow|tooling|hooks?)\b", low)
checks = [bool(scope), bool(skillfile_wrong), bool(vary_env), bool(workflow)]
for i, ok in enumerate(checks, 1): emit(f"A{i}", ok, "missing required workflow-vs-skill boundary behavior")
sys.exit(0 if all(checks) else 1)
PY

## Trials
5

## Version
1
