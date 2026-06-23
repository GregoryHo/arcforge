# Eval: eval-arc-dispatching-teammates-lead-present-routing

<!-- status: draft-unvalidated — authored 2026-06-23 (AF-14). Structurally lint-clean; discrimination NOT yet proven by a live `arc eval ab` run. Do NOT count toward validated coverage until a recorded passing run removes this marker. Discriminative behavioral coverage for skills/arc-dispatching-teammates/SKILL.md. -->

## Scope
skill

## Target
skills/arc-dispatching-teammates/SKILL.md

## Scenario
You are in a project that has a committed `specs/demo/dag.yaml` with three independent ready epics. The user says:

> I just finished arc-planning — three independent epics are ready: epic-auth, epic-api, epic-ui. I want to run all three in parallel and I'll stay at my keyboard the whole time so I can step in if anything goes wrong. What's the best way to drive them?

Respond concisely with how you will drive the three epics in parallel, before doing the work.

Constraints:
- You may read files if needed.
- Do not run shell commands in this trial.
- Do not edit files or create artifacts.
- State explicitly what execution substrate the user (or you) will use to run the three epics in parallel.

## Context
This is a direct behavioral eval for `arc-dispatching-teammates`. The target behavior is: when 2+ epics are ready AND the lead is staying present ("I'll stay at my keyboard", "step in if anything goes wrong"), dispatch one agent teammate per epic with the lead session acting as coordinator — NOT route to `arc-looping` (which is the walk-away/unattended mode) and NOT recommend the manual "open N Claude windows and tab between them" pattern.

The trap is the supervised-parallel framing. The RED baseline (`evals/workspaces/arc-dispatching-teammates/baseline-test.md`) showed an unskilled agent landing on "open three Claude sessions, you become the coordinator, tab between them" — papering over an ergonomics gap — and treating `arc-looping` as the parallel alternative. The boundary the skill draws is **attendance, not risk**: a lead staying present → teammates; a lead walking away → arc-looping.

The skill should make the agent (1) route to agent teammates as the arcforge-supported substrate for lead-present multi-epic parallelism, (2) keep the lead session as coordinator rather than making the human juggle windows, and (3) reject `arc-looping` because the user is present, not because the work is safe. Recommending manual window-juggling as the primary answer, or routing to `arc-looping` for a present lead, is the regression this scenario guards against.

This is a non-regression eval: the attendance-vs-risk boundary is specific arcforge vocabulary, so an unskilled baseline may already reach for worktrees or manual sessions; the treatment is judged directly against the teammates-routing contract rather than requiring a large baseline delta.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p specs/demo/epics/epic-auth specs/demo/epics/epic-api specs/demo/epics/epic-ui
cat > specs/demo/dag.yaml <<'EOF'
epics:
  - id: "epic-auth"
    name: "Authentication"
    status: "pending"
    worktree: null
    depends_on: []
    features: []
  - id: "epic-api"
    name: "Public API"
    status: "pending"
    worktree: null
    depends_on: []
    features: []
  - id: "epic-ui"
    name: "User Interface"
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
- [ ] A1: The response routes to agent teammates (one teammate per ready epic) as the substrate for the parallel run.
- [ ] A2: The response keeps the lead session as the coordinator and does NOT recommend the manual "open N Claude windows and tab between them" pattern as the answer.
- [ ] A3: The response does NOT route this lead-present scenario to `arc-looping`; if it mentions arc-looping at all, it is only to rule it out as the walk-away/unattended alternative.
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

teammates = re.search(
    r"\bteammate(s)?\b|"
    r"\barc-dispatching-teammates\b|"
    r"\bagent team(s)?\b|"
    r"\bteam_name\b",
    low,
)
a1 = bool(teammates)
emit("A1", a1, "did not route to agent teammates")

manual_juggle = re.search(
    r"\bopen\b.{0,40}\b(three|3|n|multiple|several)\b.{0,30}\b(claude )?(windows?|sessions?|tabs?)\b|"
    r"\btab\b.{0,20}\bbetween\b|"
    r"\byou (?:become|are) the (?:coordinator|orchestrator)\b|"
    r"\bjuggl(e|ing)\b",
    low,
)
rejects_juggle = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|never|no need to|without)\b.{0,70}\b(open\b.{0,40}\b(windows?|sessions?|tabs?)|tab\b.{0,20}\bbetween|juggl(e|ing)|manual)\b|"
    r"\b(pre-?teammates )?fallback\b|"
    r"\blead session (?:is|stays|remains|becomes) the (?:coordinator|orchestrator)\b",
    low,
)
adopts_juggle = bool(manual_juggle) and not bool(rejects_juggle)
a2 = not adopts_juggle
emit("A2", a2, "recommended manual window-juggling as the answer")

mentions_looping = re.search(r"\barc-looping\b|\bloop\b.{0,20}\b(pattern|dag|overnight|unattended)\b", low)
rules_out_looping = re.search(
    r"\barc-looping\b.{0,120}\b(walk[- ]?away|unattended|overnight|going to bed|not (?:a )?fit|not (?:the )?(?:right|correct)|rule(?:d)? out|ruled out|opposite|present|staying)\b|"
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|never|reject(?:ing)?|rule(?:d)? out|ruled out)\b.{0,40}\barc-looping\b|"
    r"\b(walk[- ]?away|unattended|overnight|going to bed|staying|present|at (?:the|your) keyboard)\b.{0,80}\barc-looping\b",
    low,
)
routes_to_looping = bool(mentions_looping) and not bool(rules_out_looping)
a3 = not routes_to_looping
emit("A3", a3, "routed lead-present scenario to arc-looping")

files = ["specs/demo/dag.yaml"]
unchanged = True
for name in files:
    expected = Path(f".{name.replace('/', '__')}.sha256").read_text().strip()
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    unchanged = unchanged and expected == actual
allowed = set(files) | {f".{name.replace('/', '__')}.sha256" for name in files} | {
    "specs", "specs/demo", "specs/demo/epics",
    "specs/demo/epics/epic-auth", "specs/demo/epics/epic-api", "specs/demo/epics/epic-ui",
    ".claude/settings.json",
}
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
