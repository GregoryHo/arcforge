# Eval: eval-arc-agent-driven-model-selection

> **Preflight (2026-07-09): BLOCK** — baseline ~100%, non-discriminative _as authored_. Kept as a **regression tripwire**, not a lift gate. `eval run` "SHIP" here is single-condition pass-rate, NOT discriminative evidence.

<!--
status: draft-unvalidated 2026-07-09 — direct behavioral coverage of
skills/arc-agent-driven "Model Selection". Ported ground truth: name an EXPLICIT
model on every dispatch (never silently inherit the controller's session model);
a transcription-style implementer whose task carries complete/exact code → haiku
(cheapest tier); prose-plan implementer and both per-task reviewers → sonnet
floor; the final whole-branch review → opus (pinned in agents/code-reviewer.md —
"do not let it ride the session default").

Trap: a baseline without the skill omits the model on each dispatch (silently
inheriting the sonnet session tier everywhere) and never explicitly pins the
final review to opus. Load-bearing discriminator is A2 — opus-for-final is
counter-intuitive for a plain cost-cutter, so even a baseline that engages with
models won't produce it. A1 (explicit-every / never-inherit) is near-ceiling by
design; A3 (haiku transcription) is secondary.

Designer notes live in this comment (not sent to the agent). ## Context and
## Scenario ARE sent verbatim, so they stay neutral — they must not reveal the
haiku/sonnet/opus mapping, which only the injected skill teaches. Preflight
skipped + non-regression verdict policy per the direct-behavioral skill-eval
convention; discrimination is unverified here (trials orchestrated separately).
-->

## Scope
skill

## Target
skills/arc-agent-driven/SKILL.md

## Scenario
Here is the prepared task list you are about to execute.

Task 1 — Add a `SyncResult` dataclass to `models.py`. Exact code — complete code to transcribe:

```python
from dataclasses import dataclass, field

@dataclass
class SyncResult:
    ok: bool
    synced: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)
```

Task 2 — Add a `--dry-run` flag to the `sync` subcommand in `cli.py`. Exact code — complete code to transcribe:

```python
def register_dry_run(subparser):
    subparser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview the sync plan without writing changes.",
    )
    return subparser
```

Task 3 — Rework the retry/backoff path in `net.py` so transient network failures use exponential backoff with jitter. There is no reference implementation for this task: choose the retry ceiling and base delay yourself, keep the existing public function signatures, and update every call site that currently retries by hand.

Lay out your dispatch plan before doing any work. For each subagent you would dispatch — the per-task implementers and the two per-task reviewers — state the role and exactly how you would configure that dispatch; then state separately how you would run the final whole-branch code review. Be concise.

Constraints:
- Do NOT actually dispatch subagents, run commands, or write any code in this trial — describe the plan only.
- Cover all three tasks and the final review.

## Context
You are the controller for an automated, unattended pass over a prepared task list, dispatching a fresh subagent per task. For each task, in order, you dispatch: an implementer subagent, then a spec-compliance reviewer, then a code-quality reviewer. After every task has landed you dispatch one final whole-branch code review over the entire branch. The three tasks below therefore expand to roughly ten subagent dispatches. Your controller session is currently running on the sonnet tier.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
true

## Assertions
- [ ] A1: The dispatch plan assigns an explicit model to its dispatches and does not leave them to silently inherit the controller's session model — the "name a model on every dispatch, never rely on inherit" rule.
- [ ] A2: The final whole-branch code review is explicitly pinned to opus (the strongest tier), not left to ride the session default.
- [ ] A3: The transcription-style implementers — Tasks 1 and 2, which carry complete/exact code — are dispatched on haiku (the cheapest tier).

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, sys
from pathlib import Path

def transcript_text():
    p = os.environ.get("TRANSCRIPT_PATH")
    if p and Path(p).exists():
        return Path(p).read_text(errors="replace")
    return ""

txt = transcript_text()
assistant_parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else txt
low = assistant_txt.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

# A1 (near-ceiling by design): explicit model on the dispatches, never silently
# inherit the session tier. Passes on an explicit per-dispatch naming commitment,
# an anti-inherit statement, OR having assigned >=2 distinct explicit tiers
# (which only happens when the agent introduces haiku/opus itself — a baseline
# that stays silent on models names no tiers and fails).
explicit_every = re.search(
    r"(explicit\w*|nam\w*|specif\w*|assign\w*|\bset\b|\bpin\w*|choos\w*|select\w*|pass\w*)"
    r"[\s\S]{0,60}\bmodel\b[\s\S]{0,80}\b(every|each|per|all|both)\b|"
    r"\b(every|each|per|all|both)\b[\s\S]{0,80}"
    r"(dispatch|task|subagent|implementer|reviewer|agent)"
    r"[\s\S]{0,80}(explicit\w*|\bmodel\b|\btier\b|haiku|sonnet|opus)",
    low,
)
never_inherit = re.search(
    r"\b(not|never|don't|do not|doesn't|avoid|rather than|instead of|without)\b"
    r"[\s\S]{0,60}(inherit\w*|\bride\b|riding|rode|"
    r"session (?:default|model|tier)|default (?:tier|model))",
    low,
)
tiers = set(re.findall(r"\b(haiku|sonnet|opus)\b", low))
a1 = bool(explicit_every) or bool(never_inherit) or (len(tiers) >= 2)
emit("A1", a1, "no explicit per-dispatch model / did not reject inheriting the session tier")

# A2 (load-bearing discriminator): final whole-branch review explicitly pinned to
# opus. "opus" never appears in a correct plan except for the final review, so a
# proximity match to a final/whole-branch anchor is safe; a baseline that omits
# models never writes opus at all.
final_opus = re.search(
    r"(final|whole[\s-]?branch)[\s\S]{0,200}\bopus\b|"
    r"\bopus\b[\s\S]{0,200}(final|whole[\s-]?branch)",
    low,
)
a2 = bool(final_opus)
emit("A2", a2, "final whole-branch review not explicitly pinned to opus")

# A3: transcription implementers (Tasks 1 & 2, which carry complete/exact code)
# dispatched on haiku. "haiku" is only ever the transcription tier, so a
# proximity match to an implementer/transcription/task-1-or-2 anchor is safe.
haiku_transcription = re.search(
    r"\bhaiku\b[\s\S]{0,200}"
    r"(implement\w*|transcri\w*|complete code|exact code|task\s*[12])|"
    r"(implement\w*|transcri\w*|complete code|exact code|task\s*[12])"
    r"[\s\S]{0,200}\bhaiku\b",
    low,
)
a3 = bool(haiku_transcription)
emit("A3", a3, "transcription (complete-code) implementers not dispatched on haiku")

sys.exit(0 if all([a1, a2, a3]) else 1)
PY

## Trials
5

## Version
1
