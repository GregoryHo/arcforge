# arc-auditing-spec — Eval Suite

Evaluation scenarios validating the `/arc-auditing-spec` skill. Organized by the epic that produces each file.

## Harness-executable vs Behavioral Review

| Shape | Meaning |
|---|---|
| **Harness-executable** | A scoring script can evaluate PASS/FAIL automatically (e.g., grep for a finding id prefix, check tool call logs) |
| **Behavioral / manual** | A human reviewer reads the agent's output to verify conformance (used when the criterion is about absence of rationalization or qualitative content) |

---

## Landed in `skill-contract` epic

| File | Covers | ACs | Shape |
|---|---|---|---|
| `sc-001-invocation-contract.md` | fr-sc-001-ac1, fr-sc-001-ac2 | Invocation fail-closed, no substitution | Behavioral — manual review |
| `sc-001-no-pipeline-invocation.sh` | fr-sc-001-ac3 | No pipeline auto-invocation | Harness-executable (shell grep) |
| `sc-002-read-only-behavior.md` | fr-sc-002-ac1, fr-sc-002-ac2 | Read-only under edit pressure | Behavioral — manual review |
| `tests/skills/test_skill_arc_auditing_spec.py::test_agent_read_only_tool_grant` | fr-sc-002-ac3 | Agent frontmatter tool allowlist | Harness-executable (pytest / yaml.safe_load — canonical) |

Structural checks are also codified in `tests/skills/test_skill_arc_auditing_spec.py` and run under `npm run test:skills`.

---

## Landed in `audit-agents` epic (this epic)

| File | Covers | ACs | Shape |
|---|---|---|---|
| `aa-cross-artifact-001-rename-drift.md` | fr-aa-001–fr-aa-004 (axis 1) | Cross-artifact rename drift detection | Harness-executable (A1-prefix check) + Behavioral (no axis bleed) |
| `aa-internal-001-ac-contradiction.md` | fr-aa-001–fr-aa-004 (axis 2) | Internal AC contradiction detection | Harness-executable (A2-prefix check) + Behavioral (no axis bleed) |
| `aa-state-transition-001-stale-worktree.md` | fr-aa-001–fr-aa-004 (axis 3) | Stale worktree pointer detection | Harness-executable (A3-prefix + no git calls) + Behavioral (no git-history findings) |

Ship gate (fr-sc-003-ac2): all three axis evals MUST exist and at least one scenario per axis MUST pass before the skill ships.

### AC Coverage by Eval Scenario

| AC | Scenario | Check type |
|---|---|---|
| fr-aa-001-ac1 (single-message parallel dispatch) | All three axis evals | Harness (structural — verified by SKILL.md tests) |
| fr-aa-001-ac2 (prompt template with paths) | All three axis evals | Harness (agent receives spec-id + paths) |
| fr-aa-002-ac1 (id format A\<axis>-NNN) | All three axis evals | Harness (regex check on finding ids) |
| fr-aa-002-ac2 (resolution preview field) | aa-cross-artifact-001 | Behavioral (agent emits preview diff) |
| fr-aa-002-ac3 (Recommended prefix rule) | All three axis evals | Behavioral (agent follows schema) |
| fr-aa-002-ac4 (severity enum + cut-offs) | All three axis evals | Behavioral (agent uses HIGH/MED/LOW correctly) |
| fr-aa-003-ac1 (cross-artifact patterns + counter-examples) | aa-cross-artifact-001 | Harness + Behavioral |
| fr-aa-003-ac2 (internal-consistency patterns + counter-examples) | aa-internal-001 | Harness + Behavioral |
| fr-aa-003-ac3 (state-transition file-level patterns + git exclusion) | aa-state-transition-001 | Harness (no git calls) + Behavioral |
| fr-aa-004-ac1 (spec.xml absent → single INFO) | Not in aa-* evals; covered by sc-002 behavioral | Behavioral |
| fr-aa-004-ac2 (dag.yaml absent → single INFO, verbatim title) | Not in aa-* evals; covered by sc-002 behavioral | Behavioral |
| fr-aa-004-ac3 (partial failure error_flag) | All three axis evals (negative path) | Behavioral |

---

## Landed in `update-oi-001` epic (fr-oi-001-ac5)

| File | Covers | ACs | Shape |
|---|---|---|---|
| `oi-001-emphasis-single-high.md` | fr-oi-001-ac5 | Single-HIGH ⚠️ emphasis in Phase 2 Overview; N_HIGH == 0 and N_HIGH >= 2 baseline non-emphasis | Harness-executable (⚠️ prefix check) + Behavioral (detail-block no-bleed, Phase 3 firing) |

## To be added in future `output-and-interaction` epics

| File | Covers | Shape |
|---|---|---|
| `report-rendering.md` | fr-oi-001 (full layout conformance) | Harness-executable (table layout conformance) |
| `triage-ux.md` | fr-oi-002 | Behavioral — AskUserQuestion multi-select + Other pull-in |
| `resolution-ux.md` | fr-oi-003 | Behavioral — AskUserQuestion per-finding + preview diffs |
| `decisions-and-save.md` | fr-oi-004, fr-oi-005 | Harness-executable (Decisions table format) + Behavioral (--save path) |
