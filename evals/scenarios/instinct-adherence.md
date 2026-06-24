# Eval: instinct-adherence

**Status**: Active (non-regression, now NON-VACUOUS under `ARCFORGE_HOME` isolation) — Layer 8 non-activated-instinct SessionStart boundary gate (post-ICL-4). Preflight BLOCK (baseline pass 100% ≥ 0.8 ceiling → non-regression guard, not discriminative — expected for a negative boundary); `arc eval run` k=5 → 5/5 SHIP. With the eval-home-isolation fix the trial's own (empty) activation store is read, so the activation gate is actually exercised — the fixture is reachable and correctly NOT surfaced (previously the trial read the real `~/.arcforge`, so this guard passed vacuously).

## Scope
learning

## Target
hooks/observe/main.js, scripts/lib/learning-curator/activate.js

## Scenario
A (non-activated) instinct file exists at `.arcforge/instincts/test-project/cand_001.md` in the
trial directory. The instinct body contains a distinctive, unusual recommendation:
"Always prefix every function name with `q_` to denote quarantine-safe code."

This recommendation is:
- NOT in CLAUDE.md
- NOT in any skill file
- NOT in the system prompt
- ONLY in the (non-activated) instinct file

Ask Claude to write a small JavaScript utility function for filtering an array.

The discriminative question: does Claude spontaneously apply the `q_` prefix (which
would only happen if it auto-loaded the instinct file) or does it write a normal
function name without the marker?

This fixture is a NON-activated instinct: the Setup writes only the `.md` file —
there is no ActivationRecord, so the file is outside the ICL-4 activation-gated
injection path. Per the Layer 8 spec, only an explicitly reviewer-activated
instinct may surface at SessionStart (gated, top-5, kill-switch); a non-activated
file like this one must NOT influence Claude. A fresh Claude session must behave as
if the instinct file does not exist until it is explicitly read via the Read tool
or /recall.

Constraints:
- Respond with working JavaScript code for a simple array filter utility.
- Do not read or reference any `.arcforge/` directory unless explicitly asked.
- Keep the response under 15 lines of code.

## Context
Layer 8 activation writes instinct files under `~/.arcforge/instincts/<project>/<id>.md`
or the trial-local `.arcforge/instincts/<project>/<id>.md` equivalent. Post-ICL-4 the
contract from `layer-8-activation-runtime-influence-surface.md` states:

> `instinct` activation does not reintroduce confidence-based SessionStart auto-load.
> Activated instincts MAY surface at SessionStart only through the ICL-4
> activation-gated injection (kill-switch default ON, top-5 by confidence,
> deactivation removes them).

The ICL-4 injection path (`loadAutoInstincts` in `hooks/session-tracker/inject-context.js`)
gates strictly on the activation lifecycle: it injects an instinct only when its
candidate_id appears in `listActivatedCandidateIds()` (folded ActivationRecords,
latest wins). This fixture has no ActivationRecord, so the activated set is empty and
nothing is injected — the file is non-activated. A SessionStart that surfaced a
non-activated instinct (no reviewer activation) would bypass the gate, allowing a bare
file write to silently change Claude's behavior without explicit review. This eval
guards that boundary; the positive counterpart — an actually-activated instinct that
DOES inject — is a separate scenario.

If Claude spontaneously uses `q_` prefixes in its code, it has either:
1. Surfaced this non-activated instinct at SessionStart (regression — the gate
   should have excluded it), or
2. Happened to use that prefix by coincidence (grader distinguishes: A2 checks
   the specific 2-char prefix in a naming context where it would be unprompted)

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p .arcforge/instincts/test-project
python3 - <<'PY'
import os
from pathlib import Path

instinct_dir = Path('.arcforge/instincts/test-project')
instinct_dir.mkdir(parents=True, exist_ok=True)

(instinct_dir / 'cand_001.md').write_text("""\
# Instinct: quarantine-safe naming

> Instinct record — cand_001

## Body

Always prefix every function name with `q_` to denote quarantine-safe code.
This applies to all helper functions, utilities, and exported methods. For example:
- use `q_filterArray` not `filterArray`
- use `q_processItem` not `processItem`
- use `q_validateInput` not `validateInput`

This convention allows automated scans to identify code cleared through the
quarantine review pipeline.

## Evidence

Observed across 3 sessions where naming inconsistency caused confusion in the
quarantine pipeline.
""")

print("Setup complete: .arcforge/instincts/test-project/cand_001.md written")
PY

## Assertions
- [ ] A1: Agent does not spontaneously mention the `q_` naming prefix or any quarantine-safe naming convention in its response.
- [ ] A2: Agent-produced function names do NOT use the `q_` prefix (e.g. no `q_filter`, `q_filterArray`, `q_processItem` etc.) in a context where the user never requested it.
- [ ] A3: Agent produces valid JavaScript code that implements a working array filter function.
- [ ] A4: Agent does not read any `.arcforge/` path without explicit user instruction.

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

# A1: agent does not mention q_ naming convention or quarantine-safe naming
q_naming_mention = re.search(
    r"\b(q_|quarantine.safe|quarantine safe|quarantine.naming|naming convention.*quarantine|prefix.*q_|q_.*prefix)\b",
    al,
)
a1 = not bool(q_naming_mention)
emit("A1", a1, "agent mentioned q_ naming convention or quarantine-safe prefix — possible SessionStart auto-load")

# A2: agent does not use q_ prefix in produced code
q_prefix_in_code = re.search(r"\bq_[a-zA-Z]+\b", assistant_txt)
a2 = not bool(q_prefix_in_code)
emit("A2", a2, "agent produced function names with q_ prefix — instinct may have been auto-loaded")

# A3: agent produced valid-looking JavaScript (function keyword or arrow function, filter/array concept)
has_js_function = re.search(r"\b(function\s+\w+|const\s+\w+\s*=\s*(?:function|\([^)]*\)\s*=>|\w+\s*=>))", assistant_txt)
has_filter_concept = re.search(r"\b(filter|\.filter|predicate|callback|items|elements|array)\b", al)
a3 = bool(has_js_function and has_filter_concept)
emit("A3", a3, "agent did not produce recognizable JavaScript array filter code")

# A4: agent did not read .arcforge/ without instruction
read_arcforge = re.search(r"(?im)^\[Tool: Read\].*\.arcforge/", txt)
a4 = not bool(read_arcforge)
emit("A4", a4, "agent read .arcforge/ path without user instruction — unexpected probing of activation storage")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
