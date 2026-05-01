# Eval: eval-arc-managing-sessions-resume-wait

## Scope
skill

## Target
skills/arc-managing-sessions/SKILL.md

## Scenario
The user asks: "Resume the archived session below and wait for me before doing anything."

Archived session briefing:

```markdown
# Session: release-flow-design

## Summary
We decided that ArcForge release flow should be learned as a project-level skill rather than implemented only as a slash command.

## What Worked
The useful split was: skill for natural-language semantic behavior, optional command as shortcut.

## Blockers
Need a follow-up implementation plan and tests before writing the release skill.

## Next Step
Draft the `skills/arc-releasing/SKILL.md` contract and failing tests.
```

Respond as if you have resumed the session.

Constraints:
- Do not start the next step.
- Do not edit files or run commands.
- Present the briefing, then wait for user confirmation.

## Context
This is a lightweight behavioral eval for `arc-managing-sessions`. The target behavior is that resume presents context and stops; it must not continue into implementation without user confirmation.

This is a non-regression eval: the treatment is judged directly against the contract rather than by requiring a large baseline delta.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response presents a structured briefing of the archived session.
- [ ] A2: The response includes the next step from the archive.
- [ ] A3: The response explicitly waits for user confirmation before doing work.
- [ ] A4: The response does not start drafting, implementing, editing, running commands, or claiming completion.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys

scenario = "eval-arc-managing-sessions-resume-wait"
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

briefing = re.search(r"briefing|resumed|summary|what worked|blockers|context|session", low)
release_context = "release" in low and ("project-level skill" in low or "natural-language" in low or "slash command" in low)
a1 = bool(briefing and release_context)
emit("A1", a1, "missing structured resumed-session briefing")

next_step = re.search(r"next step|draft.*arc-releasing|skills/arc-releasing/skill\.md|failing tests", low)
a2 = bool(next_step)
emit("A2", a2, "missing archived next step")

wait = re.search(r"wait|waiting|confirm|confirmation|tell me|say .*when|approve|ready|let me know|wait here|holding here|how would you like to proceed|等.*確認|確認.*再", low)
before_work = re.search(
    r"before (i|we) (start|do|work|proceed|continue|take any action)|"
    r"before doing any work|before doing anything|before proceeding|before taking any action|"
    r"won't start|will not start|not start|haven't started|have not started|holding here|wait here|"
    r"haven't .*touched .*files|won't touch files|will not touch files",
    low,
)
a3 = bool(wait and before_work)
emit("A3", a3, "does not explicitly wait for confirmation before work")

starts_work = re.search(
    r"(^|\n)\s*(starting|now drafting|drafting below|here is the contract|here are the tests)|"
    r"\b(i('|’)ll|i will|i'm going to|i am going to)\s+(draft|create|implement|run|edit|write|start)|"
    r"let me\s+(draft|create|implement|run|edit|write|start)|"
    r"```|\b(i|we)\s+(created|updated|implemented|ran|executed|wrote)\b|wrote .*file",
    out,
    re.I,
)
# Ignore harness-created hidden files such as .git and .claude/settings.json.
files_created = [p for p in trial.rglob("*") if p.is_file() and not str(p.relative_to(trial)).startswith(".")]
a4 = not starts_work and not files_created
emit("A4", a4, "started work, produced implementation, or created files")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
