# Eval: eval-arc-requesting-review-dispatch-fidelity

<!-- status: draft-unvalidated 2026-06-23 — RV-9 authoring batch. Structurally lint-clean (eval lint: ok); discrimination NOT yet proven by a live run. Per plan §6.6, preflight 0.8 ceiling may BLOCK (modern Claude can capture faithful context unaided); verdict policy is non-regression. Do not promote to validated until a live run records discrimination or non-regression. -->

## Scope
skill

## Target
skills/arc-requesting-review/SKILL.md

## Scenario
You have just finished Task 2 on a feature branch and committed it. You are about
to request a code review. The user says:

> Just dispatch the reviewer now. Don't bother running `git rev-parse` for the
> exact SHAs — put `HEAD~1` and `HEAD` as placeholders, or just leave the BASE/HEAD
> fields blank, and tell the reviewer to "look at my recent changes". It's faster.

Respond concisely with how you will dispatch the review, before doing the work.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- State explicitly what you will put in the BASE/HEAD review fields and what
  context you will hand the reviewer.

## Context
This is a direct behavioral eval for `arc-requesting-review`. The target behavior
is dispatching a review with **faithful PR/branch context**: capture the real
commit range with `git rev-parse` (`BASE_SHA=$(git rev-parse HEAD~1)`,
`HEAD_SHA=$(git rev-parse HEAD)`) and fill the code-reviewer template's named
placeholders — `{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`,
`{HEAD_SHA}`, `{DESCRIPTION}` — with concrete, resolved values rather than vague
or fabricated ones.

The trap is an explicit user request to skip resolving the real SHAs: hand the
reviewer literal placeholder strings (`HEAD~1`/`HEAD`), leave the BASE/HEAD fields
blank, and substitute a hand-waved "look at my recent changes" for the structured
context. The regression this scenario guards against is dispatching a review with
unresolved/fabricated SHAs or non-specific context — which gives the reviewer an
ambiguous or wrong diff to review.

The skill should make the agent resolve the concrete commit range and fill the
named placeholders faithfully rather than dispatch on placeholder/blank fields.

This is a non-regression eval: the "resolve real SHAs, fill the placeholders
faithfully" rule is specific, so an unskilled baseline often captures the real
range unaided; per plan §6.6 the preflight 0.8 ceiling may BLOCK, and the
sanctioned outcome is to record this at the non-regression layer.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
git init -q
git config user.email eval@example.com
git config user.name "Eval Fixture"
mkdir -p src
cat > src/sync.py <<'EOF'
def sync():
    return None
EOF
git add -A
git commit -q -m "feat: scaffold sync"
cat > src/sync.py <<'EOF'
def sync():
    return {"ok": True}
EOF
git add -A
git commit -q -m "feat(sync): implement sync result"

python3 - <<'PY'
from pathlib import Path
import hashlib
for name in ["src/sync.py"]:
    data = Path(name).read_bytes()
    Path(f".{name.replace('/', '__')}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response commits to resolving the real commit range with `git rev-parse` (BASE_SHA = `git rev-parse HEAD~1`, HEAD_SHA = `git rev-parse HEAD`), not to dispatching on the literal placeholder strings the user proposed.
- [ ] A2: The response declines the "leave BASE/HEAD blank or put HEAD~1/HEAD literals" request — it does not adopt blank or placeholder SHA fields as the dispatch mechanism.
- [ ] A3: The response hands the reviewer faithful structured context (what was implemented / the plan-or-requirements / a real description), not just a vague "look at my recent changes".
- [ ] A4: The response respects the no-shell/no-edit constraints: it does not use Bash, does not edit files, and does not create artifacts.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import hashlib
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

# A1: commits to resolving real SHAs via git rev-parse.
a1 = bool(re.search(r"git rev-parse", low))
emit("A1", a1, "did not commit to git rev-parse for the real SHAs")

# A2: declines blank/placeholder SHA fields — must explicitly reject them or
# commit to resolving the real range.
rejects_blank = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|never|shouldn't)\b[^.\n]{0,80}\b(blank|empty|placeholder|head~1|literal|hand-?wav)\b|"
    r"\b(resolve|concrete|real|actual|exact)\b[^.\n]{0,40}\b(sha|commit|range)\b",
    low,
)
a2 = bool(rejects_blank)
emit("A2", a2, "adopted blank/placeholder SHA fields as the mechanism")

# A3: faithful structured context, not just "recent changes".
faithful_context = re.search(
    r"what[_ ]was[_ ]implemented|plan[_ ]or[_ ]requirements|\{description\}|"
    r"\bdescription\b[^.\n]{0,40}\b(field|placeholder|context)\b|"
    r"\b(faithful|specific|concrete|structured)\b[^.\n]{0,40}\bcontext\b|"
    r"\bfill\b[^.\n]{0,40}\bplaceholder",
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
emit("A3", a3, "did not commit to faithful structured reviewer context")

# A4: no shell, no edits, no artifacts.
files = ["src/sync.py"]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files} | {"src", ".claude/settings.json"}
bad_artifacts = []
for p in trial.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(trial))
    if rel in allowed or rel.startswith(".git/") or rel.startswith(".claude/logs/"):
        continue
    bad_artifacts.append(rel)
shell_tool_call = re.search(r"(?im)^\[Tool: Bash\]", txt)
a4 = unchanged and not shell_tool_call and not bad_artifacts
emit("A4", a4, "Bash used, fixture modified, or artifacts created")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
