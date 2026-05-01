# Eval: oi-004-decisions-table-suppressed — Phase 5 Decisions Table Suppressed on N_HIGH == 0

Behavioral eval scenario for the Phase 5 conditional rendering rule introduced in
`fr-oi-004-ac4`. Covers the N_HIGH == 0 path where both Phase 3 and Phase 4 were
skipped and the Decisions table (Phase 5) MUST NOT be printed. The skill exits
cleanly after the Phase 2 report and the concluding recommendation line; no Phase 5
output is rendered.

This scenario complements `oi-002-threshold-n-high-0.md` (which verifies Phase 3/4
skipping) by placing the assertion lens on Phase 5 specifically: the `ceremony_fired`
flag is `false` and Phase 5 produces no output.

---

## Scenario A — N_HIGH == 0: Phase 5 Decisions table MUST be suppressed

### Synthetic Finding Set

The three sub-agents collectively return only MED / LOW / INFO findings (N_HIGH == 0):

| ID     | Sev  | Axis                       | Title                                       | Primary file           |
|--------|------|----------------------------|---------------------------------------------|------------------------|
| A2-001 | MED  | internal-consistency       | Dangling depends_on reference in dag.yaml   | specs/my-spec/dag.yaml |
| A2-002 | LOW  | internal-consistency       | Epic description missing in dag.yaml        | specs/my-spec/dag.yaml |
| A3-001 | INFO | state-transition-integrity | DAG not yet planned — state integrity N/A   | (none)                 |

`ceremony_fired` flag: **false** (neither Phase 3 nor Phase 4 issued any
AskUserQuestion call).

### PASS Criteria

1. The Phase 2 Summary table is printed (N_HIGH == 0 across all axes).
2. The Findings Overview table is printed with all three findings.
3. Per-finding Detail blocks are printed for all three findings.
4. No Phase 3 AskUserQuestion call is issued.
5. No Phase 4 AskUserQuestion call is issued.
6. A concluding recommendation line is printed after Phase 2 — referencing
   the Phase 2 Detail blocks for follow-up and making clear the skill is done.
7. **Phase 5 produces NO output.** Specifically:
   - No `## Decisions` heading appears anywhere in the output.
   - No Decisions table rows appear (`| Finding ID |` etc.).
   - No stub "No decisions" line or any Phase 5 placeholder appears.
8. The skill exits cleanly (no error, no crash).

### FAIL Signals

- A `## Decisions` heading appears in the output.
- Any Decisions table content appears (column headers, rows, sentinel values).
- A "No decisions" stub line or any Phase 5 placeholder is printed.
- Any AskUserQuestion call fires (Phase 3 or Phase 4).
- The concluding recommendation line is absent.
- The skill exits non-zero or crashes.

---

## Scenario B — N_HIGH == 1 path: Phase 5 DOES fire (contrast case)

When N_HIGH == 1, Phase 3 is skipped but Phase 4 IS entered directly
(fr-oi-002-ac6). Once Phase 4 enters its loop, `ceremony_fired` is set
to `true`. Phase 5 therefore MUST render a Decisions table on this path.

### Synthetic Finding Set

| ID     | Sev  | Suggested resolutions count | Notes                            |
|--------|------|-----------------------------|----------------------------------|
| A1-001 | HIGH | 2                           | Lone HIGH — Phase 4 enters loop  |
| A2-001 | MED  | 1                           | Sub-HIGH; not in Stage-2 queue   |

### PASS Criteria

1. Phase 3 multi-select does NOT fire (would violate `options.minItems: 2`).
2. Phase 4 enters its loop with `A1-001` as the sole Stage-2 entry.
3. `ceremony_fired` is `true` after Phase 4 enters.
4. Phase 5 prints a `## Decisions` table containing at least a row for `A1-001`.
5. The skill exits cleanly.

### FAIL Signals

- No Decisions table appears (Phase 5 incorrectly suppressed).
- Phase 3 multi-select fires.
- Phase 5 table omits the `A1-001` row.

---

## Automation Note

**Harness-executable (Scenario A)**: A scoring script can verify PASS criteria
by checking:
- The output contains `## Audit Summary` and `## Findings Overview`.
- The output does NOT contain `## Decisions` (no Phase 5 table heading).
- The output does NOT contain `| Finding ID |` (no Decisions table rows).
- The output does NOT contain `(no ceremony — see Detail)` (no sentinel rows).
- The output contains the literal "exiting" or a phrase referencing
  "Phase 2 Detail blocks".
- The output contains all three finding IDs (A2-001, A2-002, A3-001).

**Behavioral / manual (Scenario B)**: Verified by the presence of a Decisions
table containing `A1-001` and the absence of a Phase 3 multi-select call.
