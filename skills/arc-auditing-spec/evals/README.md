# arc-auditing-spec — Eval Suite

Evaluation scenarios validating the `/arc-auditing-spec` skill. Organized by the epic that produces each file.

## Landed in `skill-contract` epic (this epic)

| File | Covers | Shape |
|---|---|---|
| `sc-001-invocation-contract.md` | fr-sc-001-ac1, fr-sc-001-ac2 | Behavioral pressure scenarios (RED baselines captured during skill-contract epic) |
| `sc-001-no-pipeline-invocation.sh` | fr-sc-001-ac3 | Static shell check |
| `sc-002-read-only-behavior.md` | fr-sc-002-ac1, fr-sc-002-ac2 | Behavioral pressure scenarios — verify read-only boundary holds under edit-pressure |
| `sc-002-tool-grant-structural.sh` | fr-sc-002-ac3 | Static YAML-frontmatter check on the three agent files |

Structural checks are also codified in `tests/skills/test_skill_arc_auditing_spec.py` and run under `npm run test:skills`.

## To be added in `audit-agents` epic

| File | Covers | Shape |
|---|---|---|
| `axis-cross-artifact-alignment.md` | fr-aa-001–fr-aa-004 (axis 1) | Behavioral eval — synthetic spec with injected design↔spec drift |
| `axis-internal-consistency.md` | fr-aa-001–fr-aa-004 (axis 2) | Behavioral eval — synthetic spec with self-contradicting acceptance criteria |
| `axis-state-transition-integrity.md` | fr-aa-001–fr-aa-004 (axis 3) | Behavioral eval — synthetic dag.yaml with drift from on-disk markers |

Ship gate (fr-sc-003-ac2): all three axis evals MUST exist and at least one scenario per axis MUST pass before the skill ships.

## To be added in `output-and-interaction` epic

| File | Covers | Shape |
|---|---|---|
| `report-rendering.md` | fr-oi-001 | Table layout conformance |
| `triage-ux.md` | fr-oi-002 | AskUserQuestion Stage 1 multi-select + Other pull-in |
| `resolution-ux.md` | fr-oi-003 | AskUserQuestion Stage 2 per-finding + preview diffs |
| `decisions-and-save.md` | fr-oi-004, fr-oi-005 | Decisions table format + --save path + no-save default |
