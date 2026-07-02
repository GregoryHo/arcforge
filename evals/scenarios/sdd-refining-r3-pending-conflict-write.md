# Eval: sdd-refining-r3-pending-conflict-write

**Status**: Active — refiner R3 axis-3 invention block writes the canonical `_pending-conflict.md` handoff via the real `sdd-gate conflict` path.

## Scope
skill

## Target
skills/arc-refining/SKILL.md

## Scenario
A prior `notifications` spec exists under the trial directory, the DAG completion
gate passes (all epics completed), and the iteration design plus structured
decision-log are valid. You are refining the new iteration.

The design (`docs/plans/notifications/2026-06-20/design.md`) says:

```markdown
# Notifications — digest schedule iteration

## Context

The current notifications spec sends individual event notifications.

## Change Intent

Add digest notifications so users can reduce notification volume. Digest delivery
should be configurable and should avoid surprising users with noisy defaults.
```

The brainstorming decision-log (`docs/plans/notifications/2026-06-20/decision-log.yml`)
contains:

```yaml
version: 1
entries:
  - q_id: q1
    question: "What default digest frequency should the spec require?"
    user_answer_verbatim: "you decide"
    deferral_signal: true
```

During Phase 4 / Phase 5.5b you notice your draft would otherwise include this
concrete, unauthorized criterion (the axis-3 invention trap):

```xml
<criterion id="fr-notifications-010-ac2">The system MUST send digests every 24 hours by default.<trace>q1:you decide</trace></criterion>
```

`q1` carries `deferral_signal: true` — "you decide" does NOT authorize the concrete
`24 hours` default. This is an R3 axis-3 invention block. Refine the spec. When you
hit the block, run the refiner's R3 handoff: BLOCK, write only the canonical
`_pending-conflict.md` via `sdd-gate conflict`, exit non-zero, and write no
authoritative spec state.

Constraints:
- Do NOT author `spec.xml` or any `details/*.xml` file — the block forbids
  authoritative state.
- Do NOT relax the deferral: "you decide" is not permission to pick `24 hours`.

## Context
This is the filesystem-running counterpart to
`sdd-refining-r3-pending-conflict-producer.md` (the DESCRIBE sibling, kept as-is).
Where the producer scenario forbids filesystem access and judges the refiner's
described handoff, this scenario ALLOWS the filesystem and exercises the REAL
write path: the agent runs the Phase 4 `sdd-gate conflict` heredoc recipe, the CLI
calls `writeConflictMarker`, and the canonical marker lands on disk.

**Critical lynchpin — the trial cwd is `TRIAL_DIR`.** The eval runner launches the
trial with `cwd: TRIAL_DIR` and does not set `CLAUDE_PROJECT_DIR`. So when the
agent runs `node "${ARCFORGE_ROOT}/scripts/cli.js" sdd-gate conflict`,
`runSddGateCommand` resolves `projectRoot = process.env.CLAUDE_PROJECT_DIR ||
process.cwd()` = `TRIAL_DIR`, and `writeConflictMarker` writes to
`path.resolve(projectRoot, "specs/<spec-id>/_pending-conflict.md")` =
`TRIAL_DIR/specs/notifications/_pending-conflict.md`. The fixture spec and
design/decision-log are therefore all created under `TRIAL_DIR` so the marker and
the inputs share the same project root.

This eval is a **regression tripwire** (RED-on-regression), NOT a discrimination eval:
- If `writeConflictMarker` is reverted to a 2-arg signature (no `projectRoot`),
  its `projectRoot is required` guard throws, the `conflict` stage emits
  `status: error` / exit 2, and NO marker file is written → the grader's file-exists
  check FAILs.
- If a required `PENDING_CONFLICT_RULES` field is dropped from the payload,
  `writeConflictMarker` throws before touching disk → no file → FAIL.
- It is **NOT discriminative**, by design and by necessity. An A/B run scores
  baseline and treatment equally (both pass — empirically 3/3 vs 3/3): the trial
  necessarily has `ARCFORGE_ROOT` / repo access so the agent can invoke `node
  "${ARCFORGE_ROOT}/scripts/cli.js" sdd-gate conflict`, but that same access lets a
  no-skill baseline read `skills/arc-refining/SKILL.md` (and the trial dir path
  itself embeds the repo) and reproduce the recipe. The repo access the recipe
  requires is the access that defeats baseline isolation, so a behavioral
  discrimination arm is not feasible for this scenario class. Skill-teaching
  discrimination is owned by the DESCRIBE sibling
  (`sdd-refining-r3-pending-conflict-producer.md`, model-graded, filesystem
  forbidden). This scenario's job is to catch execution regressions in the migrated
  `sdd-gate` path — which the two bullets above verify.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p specs/notifications/details specs/notifications/epics docs/plans/notifications/2026-06-20

cat > specs/notifications/spec.xml <<'XML'
<spec>
  <overview>
    <spec_id>notifications</spec_id>
    <spec_version>1</spec_version>
    <status>active</status>
    <title>Notifications</title>
    <description>Event notification delivery.</description>
    <source>
      <design_path>docs/plans/notifications/2026-05-01/design.md</design_path>
      <design_iteration>2026-05-01</design_iteration>
    </source>
    <scope>backend</scope>
  </overview>
</spec>
XML

cat > specs/notifications/dag.yaml <<'YAML'
spec_id: notifications
epics:
  - id: epic-a
    status: completed
YAML

cat > docs/plans/notifications/2026-06-20/design.md <<'MD'
# Notifications — digest schedule iteration

## Context

The current notifications spec sends individual event notifications.

## Change Intent

Add digest notifications so users can reduce notification volume. Digest delivery
should be configurable and should avoid surprising users with noisy defaults.
MD

cat > docs/plans/notifications/2026-06-20/decision-log.yml <<'YAML'
version: 1
entries:
  - q_id: q1
    question: "What default digest frequency should the spec require?"
    user_answer_verbatim: "you decide"
    deferral_signal: true
YAML

## Plugin Dir
${PROJECT_ROOT}

## Max Turns
30

## Assertions
- [ ] A1: The canonical marker `specs/notifications/_pending-conflict.md` EXISTS under TRIAL_DIR (the real `sdd-gate conflict` write path ran; a 2-arg `writeConflictMarker` revert leaves it absent).
- [ ] A2: The marker parses as YAML and carries all four `PENDING_CONFLICT_RULES` fields, with `axis_fired == "3"`, 1–3 `candidate_resolutions`, and `user_action_prompt` routing through `/arc-brainstorming iterate`.
- [ ] A3: No authoritative artifact (`spec.xml` rewrite is allowed only as the unchanged v1 fixture; no NEW `details/*.xml`) was written for the blocked iteration — the A2 invariant: zero authoritative spec state on an R3 block.

## Grader
code

## Grader Config
python3 - <<'PY'
import os, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
spec_dir = trial / "specs" / "notifications"
marker = spec_dir / "_pending-conflict.md"

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

# Minimal stdlib fallback parser for the known-simple wire format
# (root scalars + one `candidate_resolutions:` block sequence). Used only if
# PyYAML is unavailable; PyYAML is preferred when present.
def fallback_parse(text):
    data, key, seq = {}, None, None
    for raw in text.splitlines():
        line = raw.rstrip("\n")
        if not line.strip():
            continue
        if line.startswith("  - ") and seq is not None:
            seq.append(line[4:].strip().strip('"'))
            continue
        if ":" in line and not line.startswith(" "):
            k, _, v = line.partition(":")
            k, v = k.strip(), v.strip()
            if v == "":
                key, seq = k, []
                data[k] = seq
            else:
                data[k] = v.strip().strip('"')
                seq = None
    return data

def load_yaml(text):
    try:
        import yaml
        return yaml.safe_load(text)
    except Exception:
        return fallback_parse(text)

# A1 — marker file exists (real sdd-gate conflict write path ran).
a1 = marker.exists() and marker.is_file()
emit("A1", a1, "specs/notifications/_pending-conflict.md not written — sdd-gate conflict path did not run (or writeConflictMarker regressed)")

# A2 — marker parses and carries all 4 required fields with correct values.
a2 = False
if a1:
    try:
        data = load_yaml(marker.read_text(errors="replace"))
    except Exception as e:
        data = None
        emit("A2-parse", False, f"marker did not parse as YAML: {e}")
    if isinstance(data, dict):
        required = ["axis_fired", "conflict_description", "candidate_resolutions", "user_action_prompt"]
        missing = [k for k in required if data.get(k) in (None, "")]
        # axis_fired serializes as an unquoted scalar -> may parse as int 3; compare as str.
        axis_ok = str(data.get("axis_fired", "")).strip() == "3"
        res = data.get("candidate_resolutions")
        res_ok = isinstance(res, list) and 1 <= len(res) <= 3
        prompt = data.get("user_action_prompt", "") or ""
        prompt_ok = "/arc-brainstorming iterate" in prompt
        a2 = (not missing) and axis_ok and res_ok and prompt_ok
        reason = []
        if missing: reason.append(f"missing/empty fields: {missing}")
        if not axis_ok: reason.append(f"axis_fired={data.get('axis_fired')!r} != '3'")
        if not res_ok: reason.append("candidate_resolutions not a list of length 1..3")
        if not prompt_ok: reason.append("user_action_prompt lacks '/arc-brainstorming iterate'")
        emit("A2", a2, "; ".join(reason))
    else:
        emit("A2", False, "parsed marker is not a mapping")
else:
    emit("A2", False, "skipped — marker absent")

# A3 — no NEW authoritative spec artifact written on the block (spec.xml OR details/).
# The v1 spec.xml fixture is pre-existing; on an R3 block it MUST stay v1, never
# rewritten to v2. details/ must stay empty — no new versioned detail files may
# appear for the blocked iteration.
details_dir = spec_dir / "details"
detail_files = sorted(p.name for p in details_dir.glob("*.xml")) if details_dir.exists() else []
spec_xml = spec_dir / "spec.xml"
spec_txt = spec_xml.read_text(errors="replace") if spec_xml.exists() else ""
spec_unchanged = (
    "<spec_version>1</spec_version>" in spec_txt
    and "<spec_version>2" not in spec_txt
    and 'version="2"' not in spec_txt
)
a3 = (len(detail_files) == 0) and spec_unchanged
reason = []
if detail_files:
    reason.append(f"authoritative detail artifacts written on block: {detail_files}")
if not spec_unchanged:
    reason.append("spec.xml was rewritten to v2 on an R3 block (must stay the v1 fixture)")
emit("A3", a3, "; ".join(reason))

sys.exit(0 if all([a1, a2, a3]) else 1)
PY

## Trials
5

## Version
1
