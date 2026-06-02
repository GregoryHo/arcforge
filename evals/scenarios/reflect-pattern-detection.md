# Eval: reflect-pattern-detection

**Status**: Active — /reflect pattern detection accuracy gate.

## Scope
learning

## Target
skills/arc-reflecting/SKILL.md

## Scenario
A project's diary directory contains 4 diary entries that share a clear repeating pattern:
"The REFACTOR step of TDD was consistently skipped." The pattern marker is the phrase
`FORGOT_TO_REFACTOR` embedded in each diary.

There is also one diary that mentions a one-off issue (missed a `npm run lint` step once),
which does NOT recur and should NOT be identified as a pattern.

Run `/reflect` (or invoke arc-reflecting) against the diary directory. The output should:
1. Identify the `FORGOT_TO_REFACTOR` / "skipped REFACTOR step" as a repeating pattern
2. NOT invent patterns that are not evidenced by multiple diaries
3. NOT dump the raw diary contents verbatim into the response

Review the diary files in `.arcforge/diaries/` and produce a reflection summary.

Constraints:
- Read the diary files to build your summary.
- Do NOT write or edit any files.
- Keep your summary under 20 lines.

## Context
Layer 4 (LLM curator) depends on the quality of patterns surfaced by `/reflect`. If the
reflect skill misses clearly-repeated patterns, no useful candidates will be generated.
This eval gates the basic detection accuracy:

- True positive: `FORGOT_TO_REFACTOR` appears in 4 of 4 diaries — must be identified as pattern
- True negative: the one-off lint miss in diary-4 appears only once — must stay as observation, not be promoted to pattern
- Verbosity guard: raw diary dumps would pollute candidate bodies with unprocessed content

This tests the arc-reflecting skill's core duty: extract signal from repetition, not noise.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p .arcforge/diaries
python3 - <<'PY'
from pathlib import Path

diaries_dir = Path('.arcforge/diaries')
diaries_dir.mkdir(parents=True, exist_ok=True)

(diaries_dir / 'diary-2026-05-01.md').write_text("""\
# Session Diary

**Date:** 2026-05-01

## TDD Work

Completed RED and GREEN phases for the new parser module. Wrote failing test, then made it pass.
FORGOT_TO_REFACTOR — moved straight to next task after green. Code works but has duplication.

## What Worked

Parser logic is correct.

## What Could Improve

Should have taken 5 minutes to deduplicate the regex patterns after making tests pass.
""")

(diaries_dir / 'diary-2026-05-03.md').write_text("""\
# Session Diary

**Date:** 2026-05-03

## TDD Work

Implemented the validator module using TDD. Test written, then implementation passed.
FORGOT_TO_REFACTOR again — committed immediately after green without cleaning up variable names.

## What Worked

Validator correctly rejects all invalid inputs per spec.

## What Could Improve

Variable names in the validator are inconsistent. A 10-minute refactor would have fixed this.
""")

(diaries_dir / 'diary-2026-05-05.md').write_text("""\
# Session Diary

**Date:** 2026-05-05

## TDD Work

Added error boundary tests for the API handler. RED -> GREEN complete.
FORGOT_TO_REFACTOR — the function is now 80 lines with 3 levels of nesting that could be extracted.

## What Worked

All error paths are now covered by tests.

## What Could Improve

Need to schedule a dedicated refactor session for error-handler complexity.
""")

(diaries_dir / 'diary-2026-05-07.md').write_text("""\
# Session Diary

**Date:** 2026-05-07

## TDD Work

Finished the cache invalidation logic with full TDD coverage.
FORGOT_TO_REFACTOR — duplicate invalidation conditions could be collapsed to a single predicate.

## What Worked

Cache invalidation is now reliable under concurrent writes.

## What Could Improve

The four separate invalidation checks should be merged. REFACTOR step was skipped again.
""")

(diaries_dir / 'diary-2026-05-09.md').write_text("""\
# Session Diary

**Date:** 2026-05-09

## Code Quality

Ran tests before commit. Everything passed.
Forgot to run npm run lint before pushing — caught in CI instead of locally.

## What Worked

Tests all green on first run.

## What Could Improve

Add lint to pre-push mental checklist.
""")

print("Setup complete: 5 diary files written to .arcforge/diaries/")
PY

## Assertions
- [ ] A1: Agent identifies a repeating pattern named around "REFACTOR step skipped", "FORGOT_TO_REFACTOR", or equivalent — appearing across multiple diaries (should cite 4 diaries).
- [ ] A2: Agent does NOT classify the one-off lint miss (diary-2026-05-09) as a pattern — it appears only once and should remain an observation or be omitted.
- [ ] A3: Agent response does not dump raw diary file contents verbatim (i.e., the response is a synthesis/summary, not a concatenation of diary text).
- [ ] A4: Agent does not write or edit any files.

## Grader
code

## Grader Config
python3 - <<'PY'
import json, os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
transcript_path = os.environ.get("TRANSCRIPT_PATH")

def trial_transcript():
    if transcript_path and Path(transcript_path).exists():
        return Path(transcript_path).read_text(errors="replace")
    return ""

txt = trial_transcript()
assistant_parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else ""
al = assistant_txt.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

# A1: identifies REFACTOR-skipped as a repeating pattern
refactor_pattern = re.search(
    r"\b(forgot.to.refactor|skip.{0,10}refactor|refactor.{0,15}skip|refactor.{0,15}miss|refactor.{0,15}omit|"
    r"refactor.{0,15}forget|refactor step.{0,15}skip|missing.{0,10}refactor|pattern.*refactor|refactor.*pattern)\b",
    al,
)
# Also accept FORGOT_TO_REFACTOR as a phrase
marker_identified = re.search(r"forgot_to_refactor", al)
a1 = bool(refactor_pattern or marker_identified)
emit("A1", a1, "agent did not identify the REFACTOR-skipped repeating pattern")

# A2: lint miss NOT called a pattern (only 1 occurrence)
lint_as_pattern = re.search(
    r"\b(lint.{0,20}pattern|pattern.{0,20}lint|recurring.{0,20}lint|lint.{0,20}recurring|lint.{0,20}consistent)\b",
    al,
)
a2 = not bool(lint_as_pattern)
emit("A2", a2, "agent incorrectly classified the one-off lint miss as a pattern")

# A3: response is not a raw diary dump — check that it doesn't reproduce large verbatim blocks
# Raw diaries contain date headers and specific verbatim phrases; a synthesis won't copy them all
verbatim_dump_signals = [
    "**date:** 2026-05-01",
    "**date:** 2026-05-03",
    "**date:** 2026-05-05",
    "**date:** 2026-05-07",
    "**date:** 2026-05-09",
]
verbatim_count = sum(1 for s in verbatim_dump_signals if s in al)
a3 = verbatim_count < 3  # Allowing up to 2 in case of partial citation, but not all 5
emit("A3", a3, "agent appears to have dumped raw diary contents verbatim instead of synthesizing")

# A4: no file writes
write_tool_call = re.search(r"(?im)^\[Tool: (?:Write|Edit|MultiEdit)\]", txt)
a4 = not bool(write_tool_call)
emit("A4", a4, "agent wrote or edited a file — constraint violation")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
