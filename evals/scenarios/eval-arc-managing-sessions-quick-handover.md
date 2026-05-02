# Eval: eval-arc-managing-sessions-quick-handover

## Scope
skill

## Target
skills/arc-managing-sessions/SKILL.md

## Scenario
We just finished a short read-only Q&A session about why a CI badge was stale. No files were changed, no commands were run, and there were no durable architecture or product decisions.

The user says: "Wrap this up with a handover for next time."

Respond with the handover only.

Constraints:
- Do not edit files.
- Do not create an archive or saved session.
- Keep the response concise.
- Include whether archiving is recommended and why.

## Context
This is a lightweight behavioral eval for `arc-managing-sessions`. The target behavior is choosing quick handover over durable archive for a pure Q&A/read-only wrap-up.

This is a non-regression eval: baseline agents may produce a reasonable summary, so the treatment is judged directly against the contract rather than by requiring a large baseline delta.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response provides a concise quick handover with current context and next step.
- [ ] A2: The response says archive is not recommended, using an explicit archive recommendation of no or equivalent.
- [ ] A3: The response gives a reason tied to pure Q&A, read-only inspection, no durable decision, or immediate continuity only.
- [ ] A4: The response does not create or claim to create an archive/session file.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys

scenario = "eval-arc-managing-sessions-quick-handover"
root = Path(os.environ["PROJECT_ROOT"])
trial = Path(os.environ["TRIAL_DIR"])

def latest_transcript():
    base = root / "evals" / "results" / scenario
    files = list(base.glob("*/transcripts/*.txt"))
    if not files:
        return ""
    return max(files, key=lambda p: p.stat().st_mtime).read_text(errors="replace")

txt = latest_transcript()
out = re.sub(r"^\[Assistant\]\s*", "", txt.strip()).strip()
low = out.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

handover_terms = re.search(r"handover|context|next step|next time|resume|pick up", low)
concise = len(re.findall(r"(?m)^\s*[-*]\s+", out)) <= 8 and len(out.split()) <= 220
a1 = bool(handover_terms and concise and re.search(r"next", low))
emit("A1", a1, "missing concise quick handover with next step")

archive_no = (
    re.search(r"archive (recommendation|recommended)\??(?:\*\*)?\s*:?(?:\*\*)?\s*(no|not recommended|不要|不建議)", low)
    or re.search(r"(do not|don't|not)\s+archive|archive\s+(is\s+)?not\s+recommended|不建議.*archive", low)
)
a2 = bool(archive_no)
emit("A2", a2, "missing explicit no archive recommendation")

reason = re.search(r"pure q&a|read-only|no files|no commands|no durable|no .*decision|immediate continuity|short context|沒有.*決策|只.*handover", low)
a3 = bool(reason)
emit("A3", a3, "missing reason for not archiving")

created_claim = re.search(
    r"\b(i|we)\s+(created|saved|archived|wrote|written).{0,40}(file|archive|session)|"
    r"\b(created|saved|archived|wrote|written)\s+(an?\s+)?(archive|session file)|"
    r"~/.arcforge|session-.*\.md",
    low,
)
# Ignore harness-created hidden files such as .git and .claude/settings.json.
files_created = [p for p in trial.rglob("*") if p.is_file() and not str(p.relative_to(trial)).startswith(".")]
a4 = not created_claim and not files_created
emit("A4", a4, "claimed archive/file creation or created files")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
