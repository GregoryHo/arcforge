# Eval: eval-icl4-activated-instinct-injection

**Status**: validated-DISCRIMINATION 2026-06-23 — Layer 8 activated-instinct SessionStart injection gate (ICL-4 positive boundary). Preflight PASS (baseline pass 0% < 0.8 — genuinely discriminative); `arc eval run` k=5 → 5/5 SHIP (baseline 0% → treatment 100%, Δ+1.0). Proves ICL-4's activation-gated injection actually surfaces an activated instinct at SessionStart. REQUIRES `ARCFORGE_HOME` trial isolation at runtime (the eval-home-isolation fix); without it the trial reads the real `~/.arcforge` and the fixture never reaches the hook.

## Scope
learning

## Target
hooks/session-tracker/inject-context.js, scripts/lib/learning-curator/activate.js

## Scenario
A reviewer-ACTIVATED instinct exists in the trial's arcforge home: an instinct file at
`.arcforge/instincts/global/cand_q1.md` PLUS a matching ActivationRecord under
`.arcforge/learning/activations/`, so `listActivatedCandidateIds()` returns `cand_q1`.
The instinct carries a distinctive, unusual recommendation in its `trigger`:
"Always prefix every function name with `q_` to denote quarantine-safe code."

This recommendation is:
- NOT in CLAUDE.md
- NOT in any skill file
- NOT in the system prompt
- ONLY in the activated instinct (surfaced to Claude via the ICL-4 SessionStart
  activation-gated injection)

Ask Claude to write a small JavaScript utility function for filtering an array.

The discriminative question: does Claude spontaneously apply the `q_` prefix? With the
plugin loaded (`--plugin-dir .`), the SessionStart hook injects the activated instinct,
so a treatment agent should apply its guidance. A bare baseline that never received the
injection writes a normal function name without the marker.

This fixture is an ACTIVATED instinct — the exact mirror of `instinct-adherence`, which
tests the NEGATIVE boundary (a non-activated file that must NOT surface). Here the Setup
writes the `.md` file AND a real ActivationRecord, putting the instinct inside the ICL-4
activation-gated injection path. Per the Layer 8 spec, an explicitly reviewer-activated
instinct MAY surface at SessionStart (gated, top-5 by confidence, kill-switch default
ON). The POSITIVE signal here is the inverse of the negative scenario: spontaneous use
of the distinctive marker indicates the activated instinct WAS injected and applied.

Constraints:
- Respond with working JavaScript code for a simple array filter utility.
- Do not read or reference any `.arcforge/` directory unless explicitly asked.
- Keep the response under 15 lines of code.

## Context
Layer 8 activation writes instinct files under `~/.arcforge/instincts/<project>/<id>.md`
or `~/.arcforge/instincts/global/<id>.md`, and ActivationRecords under
`~/.arcforge/learning/activations/<id>.json`. Post-ICL-4 the contract from
`layer-8-activation-runtime-influence-surface.md` states:

> `instinct` activation does not reintroduce confidence-based SessionStart auto-load.
> Activated instincts MAY surface at SessionStart only through the ICL-4
> activation-gated injection (kill-switch default ON, top-5 by confidence,
> deactivation removes them).

The ICL-4 injection path (`loadAutoInstincts` in `hooks/session-tracker/inject-context.js`)
gates strictly on the activation lifecycle: it injects an instinct only when its
candidate_id appears in `listActivatedCandidateIds()` (folded ActivationRecords, latest
wins). This fixture HAS an `activate` ActivationRecord, so `cand_q1` is in the activated
set and its instinct file is injected. The injection is governed by guards the run must
respect: it is capped at the top five by confidence (`MAX_INJECTED_INSTINCTS=5`) and
silenced if the `inject_activated_instincts` kill-switch is set to `false` (default ON).
A single global-scoped instinct sits well inside the top-5 cap.

If Claude spontaneously uses `q_` prefixes in its code, it has either:
1. Surfaced this activated instinct at SessionStart (the intended ICL-4 behavior — the
   gate admitted it because a real ActivationRecord exists), or
2. Happened to use that prefix by coincidence (grader distinguishes: A2 checks the
   specific 2-char prefix in a naming context where it would be unprompted)

Runtime note (deferred to the probe-gated phase): the eval harness runs Setup and the
claude trial with `cwd=TRIAL_DIR` but does NOT redirect `HOME`, while the SessionStart
hook resolves the arcforge home via `os.homedir()` (`~/.arcforge`). Setup writes the
fixture under a trial-local home (`HOME=TRIAL_DIR` inside the Setup process, matching the
`daemon-candidate-generation` fixture pattern), so the ActivationRecord and instinct file
are real and correctly located relative to that home. For the injection to actually reach
the trial agent at runtime, the harness must spawn the claude trial with `HOME=TRIAL_DIR`
(the same isolation the hook unit tests use). Wiring that `HOME` override into the trial
spawn is the prerequisite for this scenario's discriminative run; static acceptance
(`eval lint` + `eval list`) does not depend on it.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
node - <<'JS'
// Deterministic setup — builds a REAL activated instinct (no Claude agent, no daemon).
// Writes the active instinct file via the canonical buildActiveInstinctContent transform
// AND a matching ActivationRecord so listActivatedCandidateIds() returns its candidate_id.
const path = require('path');
const fs = require('fs');

const trialDir = process.env.TRIAL_DIR || process.cwd();
const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '../..');

// Redirect HOME so getArcforgeHome() resolves to TRIAL_DIR/.arcforge for the
// fixture write (mirrors the daemon-candidate-generation fixture pattern).
process.env.HOME = trialDir;

const {
  buildActiveInstinctContent,
} = require(path.join(projectRoot, 'scripts/lib/learning-curator/activate.js'));

const candidateId = 'cand_q1';
const candidate = {
  candidate_id: candidateId,
  name: 'quarantine-safe naming',
  artifact_type: 'instinct',
  evidence_quality: 'high',
  domain: 'naming',
  scope: { kind: 'global' },
  trigger: 'Always prefix every function name with `q_` to denote quarantine-safe code.',
  summary: 'quarantine-safe function naming convention',
  body:
    'Always prefix every function name with `q_` to denote quarantine-safe code.\n' +
    'This applies to all helper functions, utilities, and exported methods. For example:\n' +
    '- use `q_filterArray` not `filterArray`\n' +
    '- use `q_processItem` not `processItem`\n' +
    '- use `q_validateInput` not `validateInput`',
};

// 1) Active instinct file at instincts/global/<candidate_id>.md (global scope avoids
//    project-name fragility). buildActiveInstinctContent emits the YAML `---` frontmatter
//    (id/trigger/confidence/...) the injection reader requires; basename === candidate_id
//    is the activation gate key.
const instinctDir = path.join(trialDir, '.arcforge', 'instincts', 'global');
fs.mkdirSync(instinctDir, { recursive: true });
fs.writeFileSync(path.join(instinctDir, candidateId + '.md'), buildActiveInstinctContent(candidate));

// 2) Real ActivationRecord — the exact shape activate() persists (see activate.js),
//    reduced to the fields listActivatedCandidateIds() folds on: candidate_id, action,
//    created_at. This is a genuine record, not a fake transcript marker.
const activationsDir = path.join(trialDir, '.arcforge', 'learning', 'activations');
fs.mkdirSync(activationsDir, { recursive: true });
const now = new Date().toISOString();
const activationId = 'act8_' + Date.now() + '_fixture';
const activationRecord = {
  schema_version: 1,
  activation_id: activationId,
  action: 'activate',
  created_at: now,
  candidate_id: candidateId,
  materialization_id: 'mat_fixture',
  source_action_id: 'fixture',
  artifact_type: 'instinct',
  reported_to_layer5: false,
};
fs.writeFileSync(
  path.join(activationsDir, activationId + '.json'),
  JSON.stringify(activationRecord, null, 2) + '\n',
);

console.log('Setup complete: activated instinct cand_q1 (instinct file + ActivationRecord)');
JS

## Assertions
- [ ] A1: The injected instinct's distinctive marker surfaces at all — the agent uses a `q_`-prefixed name in its code OR references the quarantine-safe naming convention in prose (a silent code-only application still counts).
- [ ] A2: Agent-produced function names use the `q_` prefix (e.g. `q_filter`, `q_filterArray`) in a context where the user never requested it — the signal that the activated instinct was injected and applied.
- [ ] A3: Agent produces valid JavaScript code that implements a working array filter function.
- [ ] A4: Agent does not read any `.arcforge/` path without explicit user instruction (the marker should arrive via SessionStart injection, not via the agent probing activation storage).

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

# Shared marker checks. A silent application — naming a function `q_filterArray`
# without narrating why — applies the instinct correctly but emits no prose, so
# the marker-present signal (code OR prose) must cover both forms.
q_prefix_in_code = re.search(r"\bq_[a-zA-Z]+", assistant_txt)
q_naming_mention = re.search(
    r"(q_|quarantine.safe|quarantine safe|quarantine.naming|naming convention.*quarantine|prefix.*q_|q_.*prefix)",
    al,
)

# A1: the injected marker surfaced at all — in produced code OR in prose. This is
# the robust "instinct was applied" signal; it must NOT punish silent compliance.
a1 = bool(q_prefix_in_code or q_naming_mention)
emit("A1", a1, "no q_ / quarantine-safe marker in code or prose — activated instinct may not have been injected")

# A2: agent uses q_ prefix in produced code (positive: instinct applied to function names)
a2 = bool(q_prefix_in_code)
emit("A2", a2, "agent produced no q_-prefixed function names — activated instinct not applied")

# A3: agent produced valid-looking JavaScript (function keyword or arrow function, filter/array concept)
has_js_function = re.search(r"\b(function\s+\w+|const\s+\w+\s*=\s*(?:function|\([^)]*\)\s*=>|\w+\s*=>))", assistant_txt)
has_filter_concept = re.search(r"\b(filter|\.filter|predicate|callback|items|elements|array)\b", al)
a3 = bool(has_js_function and has_filter_concept)
emit("A3", a3, "agent did not produce recognizable JavaScript array filter code")

# A4: agent did not read .arcforge/ without instruction
read_arcforge = re.search(r"(?im)^\[Tool: Read\].*\.arcforge/", txt)
a4 = not bool(read_arcforge)
emit("A4", a4, "agent read .arcforge/ path without user instruction — marker should arrive via SessionStart injection, not probing")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
