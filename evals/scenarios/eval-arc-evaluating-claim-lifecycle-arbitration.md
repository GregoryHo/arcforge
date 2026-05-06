# Eval: eval-arc-evaluating-claim-lifecycle-arbitration

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
You are reviewing an eval audit result for a skill release. The user says:

> The latest grading artifacts include several `discovered_claims` that passed in one scenario, and several `weak_assertions` that contradict a claim currently in the skill. I want to automatically promote the discovered claims into the skill and retire the contradicted claim before release. Is that reliable?

Respond as an eval-design/audit review. Be concise and decisive.

Constraints:
- Do not edit files.
- Do not run shell commands.
- Focus on discovered-claims / weak-assertions lifecycle decisions and how to make the release evidence trustworthy.

## Context
This checks whether `arc-evaluating` handles the audit lifecycle after raw eval results exist. The expected behavior is to treat `discovered_claims` and `weak_assertions` as audit candidates requiring human arbitration, evidence consistency checks, and scenario-quality review before promotion or retirement. It should not allow automatic self-promotion or automatic retirement from a weak/stale grader artifact.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response treats `discovered_claims` and `weak_assertions` as audit/review candidates or corpus signals, not as automatic canonical skill changes.
- [ ] A2: The response says promotion and retirement require human arbitration/review rather than automatic agent action.
- [ ] A3: The response requires consistency/generalizability evidence before promotion, such as multiple trials, multiple scenarios, no contradictions, or non-redundancy with existing skill content.
- [ ] A4: The response distinguishes retirement of a bad/outdated claim from redesigning a weak scenario/assertion; it does not retire a claim solely because one weak assertion or stale artifact exists.
- [ ] A5: The response recommends an audit workflow such as running/reviewing `arc eval audit`, reviewing historical grader artifacts/evidence, updating/canonicalizing only after approval, and rerunning evals after changes.

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

candidate_terms = re.search(r"\b(discovered[_ -]?claims?|weak[_ -]?assertions?)\b", low) and re.search(r"\b(candidate|audit|review|signal|evidence|corpus|not automatic|not .*canonical|do not .*promote|do not .*retire)\b", low)
human_arbitration = re.search(r"\b(human|reviewer|approval|arbitrat(?:e|ion)|manual review)\b", low) and re.search(r"\b(promot|retir|canonical|skill body|agent cannot|not automatic|do not)\b", low)
promotion_evidence = re.search(r"\b(promot|discovered[_ -]?claims?)\b", low) and re.search(r"\b(multiple|3\+|three|trials?|scenarios?|consistent|consistency|generaliz(?:e|able|ability)|no contradict|non[- ]redundant|distinct)\b", low)
retirement_distinction = re.search(r"\b(retir|weak[_ -]?assertions?|contradict|outdated|obsolete|redesign|scenario quality|weak scenario)\b", low) and re.search(r"\b(scenario|assertion|redesign|poorly designed|stale artifact|single|one|grader miscalibration|scenario drift|assertion-quality|grader artifact|calibrated)\b", low) and re.search(r"\b(not .*retir|do not .*retir|don't .*retir|before retiring|rather than retiring|distinguish|decide whether|not .*claim.*wrong|not .*underlying skill claim|not the claim|underlying claim may still be correct|retire a correct claim|assertion was the broken artifact|cannot justify|do not justify|before drawing any conclusion|diagnosed as assertion-design|before touching the claim|only after the assertion is validated|prefer revision over retirement|assertion isn't testing the right thing)\b", low)
audit_workflow = re.search(r"\b(arc eval audit|audit workflow|historical|grader artifacts?|evidence|audit log|canonicaliz|rerun|re-run|run eval|verify)\b", low) and re.search(r"\b(review|approval|after|then|before release|candidate)\b", low)
checks = [bool(candidate_terms), bool(human_arbitration), bool(promotion_evidence), bool(retirement_distinction), bool(audit_workflow)]
for i, ok in enumerate(checks, 1): emit(f"A{i}", ok, "missing required claim-lifecycle arbitration behavior")
sys.exit(0 if all(checks) else 1)
PY

## Trials
5

## Version
4
