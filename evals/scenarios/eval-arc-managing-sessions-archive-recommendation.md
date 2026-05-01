# Eval: eval-arc-managing-sessions-archive-recommendation

## Scope
skill

## Target
skills/arc-managing-sessions/SKILL.md

## Scenario
We are ending a multi-session product/design discussion for ArcForge. The session made several durable decisions:

- Learning remains optional, not core.
- Once enabled, learning should be automatic through an observe daemon.
- Learned behavior changes require user authorization.
- Project-level learning is the default; global promotion needs explicit approval or cross-project evidence.
- Release flow should materialize as a project skill, not just a command.

The user says: "Give me the handover and tell me if this should be archived."

Respond with the handover and archive recommendation only.

Constraints:
- Do not edit files.
- Do not actually create an archive.
- Include the concrete next step.
- Include whether archiving is recommended and why.

## Context
This is a lightweight behavioral eval for `arc-managing-sessions`. The target behavior is recommending durable archive when a session has high decision density and long-running product direction value, while still producing a usable handover.

This is a non-regression eval: the treatment is judged directly against the contract rather than by requiring a large baseline delta.

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response gives a handover that captures the important decisions and the concrete next step.
- [ ] A2: The response explicitly recommends archive.
- [ ] A3: The archive reason mentions high decision density, durable future reference, product/design decisions, long-running work, or learning value.
- [ ] A4: The response does not claim to have created the archive or saved a file.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys

scenario = "eval-arc-managing-sessions-archive-recommendation"
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

has_decisions = all(term in low for term in ["optional", "automatic", "project"])
has_next = re.search(r"next step|next concrete step|concrete next step|next action|下一步|接下來", low)
a1 = bool(has_decisions and has_next and re.search(r"handover|summary|context|交接", low))
emit("A1", a1, "missing decision-rich handover or next step")

archive_yes = (
    re.search(r"archive (recommendation|recommended)\??(?:\*\*)?\s*:?(?:\*\*)?\s*(yes|recommended|建議|是)", low)
    or re.search(r"recommend\s+archiv|should\s+be\s+archived|yes\s*[—-]\s*archive|yes.{0,30}archive this session|建議.*archive", low)
)
a2 = bool(archive_yes)
emit("A2", a2, "missing explicit archive recommendation yes")

reason = re.search(r"high decision density|durable future reference|durable|product.*decision|design.*decision|long-running|multi-session|learning value|future sessions|未來.*參考|決策密度", low)
a3 = bool(reason)
emit("A3", a3, "archive reason does not cite durable decision value")

created_claim = re.search(
    r"\b(i|we)\s+(created|saved|wrote|written).{0,40}(archive|session|file)|"
    r"\b(created|saved|wrote|written)\s+(an?\s+)?(archive|session file)|"
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
