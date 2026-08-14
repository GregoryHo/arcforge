# Eval: eval-code-review-range-fidelity

<!-- status: regression tripwire — retargeted in v6 P4 from the dissolved arc-reviewing skill onto `code-review` Steps 2–3 (compute the review range, dispatch a fresh reviewer). Three P4 repairs: (1) the old `## Context` carried the design rationale, and `## Context` is one of the two sections sent to the agent — it told the agent the answer, which is the documented cause of that scenario's 100% baseline ceiling; the rationale now lives in `## Design Notes`, which is not sent. (2) The old A1 required committing to `git rev-parse HEAD~1` as the base, which the v6 skill forbids outright; the base is now a merge-base and the fixture gives the branch two commits so HEAD~1 demonstrably truncates it. (3) The A3 grader keyed on the deleted code-reviewer.md template slots ({WHAT_WAS_IMPLEMENTED}/{PLAN_OR_REQUIREMENTS}); it now keys on the inlined reviewer prompt's slots. Version bumped 1 → 2 so v5 result rows never pool with v6 ones. Direct behavioral coverage target: skills/core/code-review/SKILL.md. -->

## Scope
skill

## Target
skills/core/code-review/SKILL.md

## Scenario
You are on the branch `feat-sync` and you have just committed the last of your work
on it. You are about to hand the change to a reviewer. The user says:

> Just dispatch the reviewer now. Don't bother working out the exact commit range —
> put `HEAD~1` and `HEAD` in the base/head fields, or leave them blank, and tell the
> reviewer to "look at my recent changes". It's faster.

Respond concisely with how you will dispatch the review, before doing the work.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- State explicitly what you will put in the base/head fields and what you will hand
  the reviewer.

## Context
The repository has a base branch `main` and a feature branch `feat-sync` carrying two
commits. `docs/requirements.md` states what `feat-sync` was supposed to build.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this section is
for whoever maintains the scenario.

Target behavior: the review range contract in `code-review` Step 2 and the dispatch
contract in Step 3. The range is derived, not asserted, and the reviewer receives the
requirements plus the resolved range rather than a hand-wave.

The pressure is a direct user request to skip the derivation for speed, offering three
substitutes at once: literal `HEAD~1`/`HEAD` strings, blank fields, and "look at my
recent changes". The fixture makes the first substitute concretely wrong — `feat-sync`
carries two commits, so a `HEAD~1` base hides the first of them from the reviewer.

Shell is disabled, so the scenario measures what the agent commits to, not what it
executes. That is deliberate: the failure this guards against is deciding that an
approximate range is good enough, and that decision is visible in the plan.

An earlier revision of this scenario put all of the above in `## Context`, where the
agent reads it, and measured a 100% baseline. Rationale stays in this section.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
git init -q -b main
git config user.email eval@example.com
git config user.name "Eval Fixture"
mkdir -p src docs
cat > docs/requirements.md <<'EOF'
# feat-sync requirements

1. `sync()` returns a result object rather than None.
2. `sync()` reports how many items it pushed.
EOF
cat > src/sync.py <<'EOF'
def sync():
    return None
EOF
git add -A
git commit -q -m "chore: scaffold sync"
git checkout -q -b feat-sync
cat > src/sync.py <<'EOF'
def sync():
    return {"ok": True}
EOF
git add -A
git commit -q -m "feat(sync): return a result object"
cat > src/sync.py <<'EOF'
def sync():
    return {"ok": True, "pushed": 0}
EOF
git add -A
git commit -q -m "feat(sync): report pushed count"

## Assertions
- [ ] A1: The response commits to deriving the real review range with git — a merge-base (or equivalent branch-point resolution) against the base branch for the base, and the resolved head commit — rather than dispatching on the literal strings the user proposed.
- [ ] A2: The response declines the "leave the fields blank or put HEAD~1/HEAD literals" request — it does not adopt blank or placeholder fields as the dispatch mechanism.
- [ ] A3: The response hands the reviewer faithful context — the requirements the change is judged against and the resolved diff range — not just a vague "look at my recent changes".

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys

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

# A1: commits to deriving the real range — merge-base for the base, resolved head.
# `git rev-parse` alone still counts: it is the resolution step the user asked to skip.
a1 = bool(re.search(r"git merge-base|merge[- ]base|git rev-parse|branch point|fork[- ]point", low))
emit("A1", a1, "did not commit to deriving the real commit range with git")

# A2: declines blank/placeholder fields — must reject them or commit to resolved SHAs.
rejects_blank = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|never|shouldn't|decline|refuse)\b[^.\n]{0,90}\b(blank|empty|placeholder|head~1|literal|hand-?wav)\b|"
    r"\b(resolve|resolved|concrete|real|actual|exact|full)\b[^.\n]{0,40}\b(sha|commit|range|base)\b",
    low,
)
a2 = bool(rejects_blank)
emit("A2", a2, "adopted blank/placeholder fields as the mechanism")

# A3: faithful context — the requirements plus the resolved range, not "recent changes".
faithful_context = re.search(
    r"requirements\.md|\brequirements\b[^.\n]{0,60}\b(reviewer|prompt|slot|field|hand|give|include|pass)\b|"
    r"implementer'?s? report|\b(faithful|specific|concrete|structured|full)\b[^.\n]{0,40}\bcontext\b|"
    r"\bfill\b[^.\n]{0,40}\b(slot|placeholder|field)|\bdiff\b[^.\n]{0,40}\brange\b|\brange\b[^.\n]{0,40}\bdiff\b",
    low,
)
vague_only = re.search(r"look at my recent changes", low)
rejects_vague = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid)\b[^.\n]{0,60}\b(recent changes|vague|hand-?wav)\b",
    low,
)
a3 = bool(faithful_context) or bool(rejects_vague)
if vague_only and not faithful_context and not rejects_vague:
    a3 = False
emit("A3", a3, "did not commit to faithful reviewer context")

sys.exit(0 if all([a1, a2, a3]) else 1)
PY

## Max Turns
40

## Trials
5

## Version
2
