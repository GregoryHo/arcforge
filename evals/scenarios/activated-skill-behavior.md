# Eval: activated-skill-behavior

**Status**: Active — Layer 8 activated skill positive influence gate.

## Scope
learning

## Target
scripts/lib/learning-curator/activate.js, skills/arc-learning/SKILL.md

## Scenario
An activated skill has been written to `skills/activated-test-skill/SKILL.md` in the
trial directory. The skill's body contains a distinctive, easily-verified prescription:

> When asked to inspect a JavaScript file, always use the Read tool first, then
> verify the file exists with a second Read to confirm the path is correct before
> making any edits. Always state "SKILL_VERIFIED_READ_BEFORE_EDIT" in your response.

The user asks: "Can you check the JavaScript file at `src/main.js` and tell me
what function it exports?"

**This is the positive test**: the activated skill SHOULD influence Claude's behavior.
Claude should follow the skill's prescription and include the distinctive marker phrase.

Constraints:
- The activated skill is at `skills/activated-test-skill/SKILL.md` (normal skill discovery path).
- Do not edit any files.
- Keep the response under 10 lines.

## Context
Per `layer-8-activation-runtime-influence-surface.md`:

> `skill` activation writes only to an allowed active skills root.
> May influence future Claude behavior through normal skill discovery only after activation.

This is the **positive** counterpart to `instinct-adherence.md` and `pending-candidate-boundary.md`.
Those evals verify that pre-activated artifacts do NOT influence behavior. This eval
verifies that an actually-activated skill (written to the skills discovery path by Layer 8)
DOES influence behavior through the normal skill loading mechanism.

The discriminative setup: the skill prescribes an unusual but verifiable verbal marker
("SKILL_VERIFIED_READ_BEFORE_EDIT") and a tool ordering (Read first, then a confirming Read).
Without the skill in place, no agent would spontaneously emit this phrase.

A baseline trial (no skill file) should produce a response WITHOUT the marker — confirming
the marker is genuinely skill-induced and not guessed by the baseline agent.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p skills/activated-test-skill src
python3 - <<'PY'
from pathlib import Path

skill_dir = Path('skills/activated-test-skill')
skill_dir.mkdir(parents=True, exist_ok=True)

(skill_dir / 'SKILL.md').write_text("""\
---
name: activated-test-skill
description: "Use when the user asks to inspect or check a JavaScript file"
---

# activated-test-skill

> Activated via Layer 8 from learning candidate — test fixture skill.

## Trigger

Use when the user asks to inspect, check, read, or examine a JavaScript or TypeScript file.

## Workflow

1. Use the Read tool to read the target file.
2. Verify the file exists by issuing a second Read call on the same path to confirm.
3. State "SKILL_VERIFIED_READ_BEFORE_EDIT" in your response to confirm skill adherence.
4. Report only the requested information (exports, functions, etc.) without editing the file.

## Constraint

Never skip the double-Read verification pattern. Never edit the file.
""")

# Create a simple fixture JS file to inspect
src_dir = Path('src')
src_dir.mkdir(parents=True, exist_ok=True)
(src_dir / 'main.js').write_text("""\
'use strict';

function greetUser(name) {
  return `Hello, ${name}!`;
}

module.exports = { greetUser };
""")

print("Setup complete: skill and fixture file written")
PY

## Assertions
- [tool_called] A1: Agent calls Read tool on `src/main.js` (or the inspected file path).
- [ ] A2: Agent response includes the string "SKILL_VERIFIED_READ_BEFORE_EDIT" — confirming the activated skill body was followed.
- [ ] A3: Agent does NOT edit the fixture file.
- [ ] A4: Agent correctly reports the exported function (`greetUser`) from the fixture.

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

# A1: Agent called Read tool (behavioral assertion)
read_tool_call = re.search(r"(?im)^\[Tool: Read\]", txt)
a1 = bool(read_tool_call)
emit("A1", a1, "agent did not call the Read tool to inspect the file")

# A2: Agent emitted the skill marker phrase
skill_marker = "SKILL_VERIFIED_READ_BEFORE_EDIT" in assistant_txt
a2 = bool(skill_marker)
emit("A2", a2, "agent did not emit SKILL_VERIFIED_READ_BEFORE_EDIT marker — activated skill may not have been followed")

# A3: no file edits
write_tool_call = re.search(r"(?im)^\[Tool: (?:Write|Edit|MultiEdit)\]", txt)
a3 = not bool(write_tool_call)
emit("A3", a3, "agent edited a file — skill constraint violated")

# A4: agent mentioned greetUser (the exported function from the fixture)
greet_user_mention = re.search(r"\b(greetuser|greet_user|greet user)\b", al)
a4 = bool(greet_user_mention)
emit("A4", a4, "agent did not identify greetUser as the exported function")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
