# Eval: oi-002-threshold-n-high-0 — N_HIGH == 0 Exit Path (No Phase 3 / 4 / 5)

Behavioral eval scenario for the Phase 3 conditional-firing rule introduced in
`fr-oi-002-ac5`. Covers the N_HIGH == 0 degraded path where Phase 3 does not
fire, Phase 4 is not entered, the Decisions table is not rendered, and the
skill prints a concluding recommendation line after Phase 2 and exits cleanly.

---

## Scenario A — N_HIGH == 0 (Phase 3 / 4 / 5 MUST all be skipped)

### Synthetic Finding Set

The three sub-agents collectively return only MED / LOW / INFO findings:

| ID     | Sev  | Axis                       | Title                                       | Primary file           |
|--------|------|----------------------------|---------------------------------------------|------------------------|
| A2-001 | MED  | internal-consistency       | Dangling depends_on reference in dag.yaml   | specs/my-spec/dag.yaml |
| A2-002 | LOW  | internal-consistency       | Epic description missing in dag.yaml        | specs/my-spec/dag.yaml |
| A3-001 | INFO | state-transition-integrity | DAG not yet planned — state integrity N/A   | (none)                 |

Total HIGH count: **0**.

### PASS Criteria

1. The Phase 2 Summary table is printed, showing 0 HIGHs across all axes.
2. The Findings Overview table is printed with all three findings (no omissions).
3. Per-finding Detail blocks are printed for all three findings.
4. No Phase 3 AskUserQuestion call is issued anywhere in the output.
5. No Phase 4 AskUserQuestion call is issued anywhere in the output.
6. A concluding recommendation line is printed after Phase 2 — it MUST:
   - Reference the Phase 2 Detail blocks explicitly.
   - Make clear the skill is done (exiting / no further interaction).
7. No Phase 5 Decisions table (`## Decisions`) appears in the output.
8. The skill exits cleanly (no error, no crash).

### FAIL Signals

- Any AskUserQuestion call fires (Phase 3 or Phase 4).
- A `## Decisions` table appears in the output.
- The concluding recommendation line is absent.
- Any finding is omitted from the Findings Overview table.
- The skill exits non-zero or crashes.

---

## Scenario B — Confirming no Other injection channel on N_HIGH == 0 path

When N_HIGH == 0, the Other free-text injection channel is not available.

### PASS Criteria

1. The skill does not offer any mechanism for the user to inject finding IDs
   into a Stage-2 queue — no AskUserQuestion call is issued at all, so the
   auto-appended Other field never appears.
2. The concluding recommendation line is the only post-Phase-2 output.

### FAIL Signals

- Any hint of an injection channel or AskUserQuestion call in the output.

---

## Automation Note

**Harness-executable (Scenario A)**: A scoring script can verify PASS criteria
by checking:
- The output contains `## Audit Summary` and `## Findings Overview`.
- The output does NOT contain `"Triage"` or `multiSelect` (no Phase 3 call).
- The output does NOT contain `## Decisions` (no Phase 5 table).
- The output contains the literal word "exiting" or "skill exit" or a phrase
  referencing "Phase 2 Detail blocks".
- The output contains all three finding IDs (A2-001, A2-002, A3-001).

**Behavioral / manual (Scenario B)**: Confirmed by the absence of any
AskUserQuestion call in the full output.
