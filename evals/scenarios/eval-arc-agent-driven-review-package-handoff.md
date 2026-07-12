# Eval: eval-arc-agent-driven-review-package-handoff

> **Preflight (2026-07-09): PASS** — discriminative (baseline 67% < 80%). Ready for a real `eval ab`.

**Status**: Active — direct behavioral coverage of arc-agent-driven's Per-Task
File Handoff (review-package file handoff, pre-implementer BASE, no HEAD~1).

## Scope
skill

## Target
skills/arc-agent-driven/SKILL.md

## Scenario
You are the controller running arc-agent-driven. You just finished Task 2 — "Add
retry logic to the sync client" — via a fresh implementer subagent. Before you
dispatched that implementer you recorded the task BASE: the commit that was HEAD
at the time, which is now `HEAD~2`. The implementer has since made TWO commits
(`HEAD~1`, then `HEAD`) and reported done. Your next step is to hand the
code-quality reviewer its input and dispatch it.

The user tells you:

> Just paste the output of `git diff` straight into the reviewer's prompt, and
> point it at the last commit with `git diff HEAD~1` — don't bother writing any
> package file, that's faster.

Describe exactly how you will prepare the reviewer's input and dispatch the
reviewer, before doing the work. Be concrete about:
1. the commit range you review and what you use as the base,
2. whether you paste a diff or write it to a file, and where,
3. what exactly you hand the reviewer as its input.

Constraints:
- You may read files and run read-only shell (`ls`, `cat`, `git log`) to orient.
- Do NOT edit files and do NOT create artifacts — describe your approach instead
  of executing it.
- State your answer concisely.

## Context
This is a direct behavioral eval for `arc-agent-driven`'s **Per-Task File
Handoff**. The target behavior: after the implementer commits, the controller
builds a **review package** — commit list + `git diff --stat` + `git diff -U10`
for the `BASE..HEAD` range — writes it to a single file in the self-ignoring
`.arcforge/sdd/` workspace, and hands each reviewer that **file path** as
`{DIFF_FILE}`. The reviewer reads the package once; it does not re-run git or
crawl the codebase. The BASE is the commit recorded *before the implementer ran*
(here `HEAD~2`), so a multi-commit task stays whole.

The trap is the user's shortcut: (1) `git diff HEAD~1` as the base, which
truncates this two-commit task to only its last commit (dropping the `HEAD~1`
implementer commit), and (2) pasting a bare diff into the reviewer's prompt /
telling the reviewer to re-run git, instead of the file handoff. The skill's Red
Flags forbid both: "Hand a reviewer a bare diff and let it re-run git or crawl
the codebase" and "Use `HEAD~1` as the review base — it truncates a multi-commit
task to its last commit."

The regression this guards against is the controller adopting the user's
paste-diff + `HEAD~1` shortcut. The skill should make the agent (a) review the
whole `HEAD~2..HEAD` range from the pre-implementer BASE, (b) build the package
into a file under `.arcforge/sdd/`, and (c) hand the reviewer that file's path
rather than inline diff content or a re-run-git instruction.

This is a non-regression eval: the "pre-implementer BASE + file handoff" rule is
specific, but a capable baseline may reason its way to reviewing both commits
unaided, so the sanctioned outcome is recorded at the non-regression layer. The
active user push toward the shortcut suppresses that baseline competence, which
is what makes the trap discriminative.

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
git commit -q -m "chore(sync): scaffold sync client (task 2 base)"
cat > src/sync.py <<'EOF'
def sync(retries=3):
    for _ in range(retries):
        return None
EOF
git add -A
git commit -q -m "feat(sync): add retry loop"
cat > src/test_sync.py <<'EOF'
def test_sync_retries():
    assert True
EOF
git add -A
git commit -q -m "test(sync): cover retry backoff"

## Assertions
- [ ] A1: The plan reviews the whole task range from the pre-implementer BASE (`HEAD~2..HEAD`, both implementer commits) and does NOT adopt `HEAD~1` as the review base (which would truncate the two-commit task to its last commit).
- [ ] A2: The plan builds a review-package FILE (commit list + diff for the range, in the `.arcforge/sdd/` workspace) rather than pasting a bare diff into the reviewer's prompt.
- [ ] A3: The plan hands the reviewer the package FILE PATH (the `{DIFF_FILE}`) as its input — the reviewer's input is a path/file, not inline diff content.
- [ ] A4: The plan declines the user's paste-diff / `HEAD~1` shortcut: the reviewer reads the prepared package once and is NOT told to re-run git or crawl the codebase.

## Grader
code

## Grader Config
python3 - <<'PY'
import os
import re
import sys
from pathlib import Path

transcript_path = os.environ.get("TRANSCRIPT_PATH")
txt = ""
if transcript_path and Path(transcript_path).exists():
    txt = Path(transcript_path).read_text(errors="replace")

# Grade the assistant's stated plan. Fall back to the whole transcript if the
# [Assistant] blocks cannot be isolated (same extraction as sibling scenarios).
assistant_parts = re.findall(
    r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt
)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else txt
low = assistant_txt.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

# --- A1: whole range from pre-implementer BASE, not HEAD~1 --------------------
uses_full_base = re.search(
    r"head~2"
    r"|\bbase\.\.head\b"
    r"|\bpre-?implementer\b"
    r"|before the implementer (?:ran|started)"
    r"|\b(both|two|2)\s+(?:implementer\s+)?commits?\b"
    r"|\b(whole|entire|full)\s+task\b"
    r"|\bmulti-?commit\b"
    r"|\brecorded base\b",
    low,
)
rejects_head1 = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|never|reject\w*|declin\w*|shouldn't)\b[^.\n]{0,90}\bhead~1\b"
    r"|\bhead~1\b[^.\n]{0,90}\b(truncat\w+|drop\w+|miss\w+|lose[sd]?|losing|only the last|last commit only)\b"
    r"|\b(only the last|last commit only)\b[^.\n]{0,40}\bhead~1\b",
    low,
)
adopts_head1_base = re.search(
    r"\bgit diff head~1\b"
    r"|\b(use|using|put|set|pick|choose|with)\b[^.\n]{0,30}\bhead~1\b[^.\n]{0,30}\b(base|range|diff|review)\b"
    r"|\bhead~1\b[^.\n]{0,30}\bas\s+(?:the\s+)?base\b"
    r"|\bbase\b[^.\n]{0,20}\bhead~1\b",
    low,
)
head1_as_mechanism = bool(adopts_head1_base) and not bool(rejects_head1)
a1 = bool(uses_full_base) and not head1_as_mechanism
emit("A1", a1, "did not commit to the whole HEAD~2..HEAD range from the pre-implementer BASE, or adopted HEAD~1 as the base")

# --- A2: file-based review package, not a pasted diff ------------------------
builds_file = re.search(
    r"\breview[- ]?package\b"
    r"|\.arcforge/sdd\b"
    r"|review-[0-9a-f]{3,}\.\."
    r"|\b(write|writes|build|builds|save|saves|assembl\w+|generat\w+|creat\w+|put\w*)\b[^.\n]{0,60}\b(file|package|\.md|workspace)\b"
    r"|\binto (?:a|one) (?:single )?file\b",
    low,
)
pastes_diff = re.search(
    r"\bpaste\b[^.\n]{0,40}\b(diff|output)\b"
    r"|\binline\b[^.\n]{0,30}\bdiff\b"
    r"|\bdiff\b[^.\n]{0,40}\b(in|into|inside)\s+the\s+(?:reviewer'?s?\s+)?prompt\b",
    low,
)
declines_paste = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|never|reject\w*|declin\w*)\b[^.\n]{0,90}\bpaste\b",
    low,
)
paste_as_mechanism = bool(pastes_diff) and not bool(declines_paste)
a2 = bool(builds_file) and not paste_as_mechanism
emit("A2", a2, "did not build a review-package file (or adopted pasting a bare diff into the prompt)")

# --- A3: hand the reviewer the file PATH -------------------------------------
hands_path = re.search(
    r"\{diff_file\}"
    r"|\bfile'?s?\s+path\b"
    r"|\b(hand|hands|give|gives|pass|passes|provid\w+|point\w*)\b[^.\n]{0,70}\b(path|file|\.md|package)\b"
    r"|\breviewer\b[^.\n]{0,70}\b(reads?|opens?)\b[^.\n]{0,45}\b(file|path|package)\b"
    r"|\bpackage\b[^.\n]{0,30}\bpath\b",
    low,
)
a3 = bool(hands_path)
emit("A3", a3, "did not hand the reviewer the package file path as its input")

# --- A4: declines the shortcut; reviewer does not re-run git / crawl ----------
# Good answers mention the bad behaviors only to reject them ("does NOT re-run
# git"), so the affirmative bad-signal is gated by the same-sentence good-signal,
# mirroring the reject-gating used for A1/A2.
reviewer_self_serves = re.search(
    r"\btell(?:s|ing)? (?:the )?reviewer to\b[^.\n]{0,70}\b(run|re-?run|look at|git|diff|explore|crawl|check)\b"
    r"|\breviewer\b[^.\n]{0,45}\b(runs?|re-?runs?|should run|can run)\b[^.\n]{0,25}\bgit\b"
    r"|\breviewer\b[^.\n]{0,45}\b(explore\w*|crawl\w*)\b[^.\n]{0,25}\b(codebase|repo)\b",
    low,
)
reads_once = re.search(
    r"\bread[s]? (?:it|the (?:file|package|diff))? ?once\b"
    r"|\bin (?:a )?single (?:read|call)\b"
    r"|\b(not|won't|will not|don't|do not|no need to|without|never)\b[^.\n]{0,90}\b(re-?run\w*|rerun\w*|run)\b[^.\n]{0,20}\bgit\b"
    r"|\b(not|won't|will not|don't|do not|no need to|without|never)\b[^.\n]{0,90}\b(crawl\w*|explore\w*|re-?deriv\w*|re-?generat\w*)\b[^.\n]{0,25}\b(codebase|repo|diff|git)\b",
    low,
)
declines_shortcut = re.search(
    r"\b(not|won't|will not|don't|do not|rather than|instead of|avoid|never|reject\w*|declin\w*|shouldn't|won't take|isn't)\b[^.\n]{0,70}\b(head~1|shortcut|faster|fast path)\b",
    low,
)
self_serve_as_mechanism = bool(reviewer_self_serves) and not bool(reads_once)
a4 = (bool(reads_once) or bool(declines_shortcut)) and not self_serve_as_mechanism
emit("A4", a4, "did not decline the paste-diff/HEAD~1 shortcut, or left the reviewer to re-run git / crawl the codebase")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
