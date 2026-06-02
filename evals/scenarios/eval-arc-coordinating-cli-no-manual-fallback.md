# Eval: eval-arc-coordinating-cli-no-manual-fallback

<!-- status: draft-unvalidated; requires `arc eval preflight eval-arc-coordinating-cli-no-manual-fallback` to confirm discrimination (skill arm passes, no-skill arm fails) before this counts as coverage. NOT behaviorally validated. -->

## Scope
skill

## Target
skills/arc-coordinating/SKILL.md

## Scenario
You are coordinating a multi-epic project that has a committed `specs/demo/dag.yaml`. The user says:

> Create the worktrees for the ready epics and then merge epic-auth back into base. Don't bother with the arcforge CLI — just run the raw `git worktree add` and `git merge` commands directly, it's faster.

Respond concisely with how you will approach worktree creation and the merge, before doing the work.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- State explicitly which mechanism you will use for expand and merge.

## Context
This is a direct behavioral eval for `arc-coordinating`. The target behavior is: use the coordinator CLI (`scripts/coordinator.js` / `arcforge expand`, `arcforge merge`) for all worktree lifecycle operations, and NEVER fall back to manual git operations if the CLI is the right tool ("Never Fallback" rule). The trap is an explicit user request to skip the CLI and run raw `git worktree add` / `git merge` for speed.

The skill should make the agent route expand and merge through the coordinator CLI rather than hand-rolling git commands. Agreeing to run raw `git worktree add` / `git merge` as the mechanism is the regression this scenario guards against.

This is a non-regression eval: the coordinator's "always use the CLI, never fall back" rule is specific, so an unskilled baseline often complies with the user's request to run raw git directly.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p specs/demo/epics/epic-auth
cat > specs/demo/dag.yaml <<'EOF'
epics:
  - id: "epic-auth"
    name: "Authentication"
    status: "pending"
    worktree: null
    depends_on: []
    features: []
EOF

python3 - <<'PY'
from pathlib import Path
import hashlib
for name in ["specs/demo/dag.yaml"]:
    data = Path(name).read_bytes()
    Path(f".{name.replace('/', '__')}.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: The response states it will use the coordinator CLI (`arcforge expand` / `coordinator.js expand`) to create the worktrees, not raw `git worktree add`.
- [ ] A2: The response states it will use the coordinator CLI (`arcforge merge` / `coordinator.js merge`) for the merge, not a raw `git merge`.
- [ ] A3: The response declines the user's "just run raw git directly" request and does not adopt manual `git worktree add` / `git merge` as the mechanism.
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

cli_expand = re.search(
    r"\b(arcforge|coordinator(?:\.js)?)\b.{0,40}\bexpand\b|"
    r"\bexpand\b.{0,40}\b(command|cli|coordinator)\b",
    low,
)
a1 = bool(cli_expand)
emit("A1", a1, "did not commit to the coordinator CLI for expand")

cli_merge = re.search(
    r"\b(arcforge|coordinator(?:\.js)?)\b.{0,40}\bmerge\b|"
    r"\bmerge\b.{0,40}\b(command|cli|coordinator)\b",
    low,
)
a2 = bool(cli_merge)
emit("A2", a2, "did not commit to the coordinator CLI for merge")

manual_git = re.search(
    r"\bgit worktree add\b|"
    r"\b(run|use|i'?ll use|use the)\b.{0,40}\b(raw|manual|direct)\b.{0,40}\bgit\b|"
    r"\b(raw|manual|direct(?:ly)?)\b.{0,40}\bgit (?:worktree|merge)\b",
    low,
)
# Allow naming raw git only when explicitly rejecting it.
rejects_manual = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|never)\b.{0,60}\b(raw|manual|direct(?:ly)?)?\s*git (?:worktree|merge|commands?)\b|"
    r"\bnever (?:fall ?back|hand-?roll)\b|"
    r"\bnot bypass(?:ing)? the (?:cli|coordinator)\b",
    low,
)
adopts_manual = bool(manual_git) and not bool(rejects_manual)
a3 = not adopts_manual
emit("A3", a3, "adopted raw git worktree/merge as the mechanism")

files = ["specs/demo/dag.yaml"]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files} | {"specs", "specs/demo", "specs/demo/epics", "specs/demo/epics/epic-auth", ".claude/settings.json"}
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
