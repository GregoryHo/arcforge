# Eval: oi-001-emphasis-single-high — Single-HIGH Visual Emphasis in Findings Overview

Behavioral eval scenario for the Phase 2 Findings Overview visual emphasis rule
introduced in `fr-oi-001-ac5`. Covers the N_HIGH == 1 emphasis path and the
N_HIGH == 0 / N_HIGH >= 2 baseline (no-emphasis) path.

---

## Scenario A — N_HIGH == 1 (emphasis MUST fire)

### Synthetic Finding Set

The three sub-agents collectively return the following findings:

| ID     | Sev  | Axis               | Title                                                | Primary file         |
|--------|------|--------------------|------------------------------------------------------|----------------------|
| A2-001 | HIGH | internal-consistency | Design doc contradicts spec on Phase 2 output format | docs/plans/.../design.md |
| A2-002 | MED  | internal-consistency | Dangling depends_on reference in dag.yaml            | specs/my-spec/dag.yaml   |
| A3-001 | INFO | state-transition-integrity | DAG not yet planned — state integrity N/A      | (none)               |

Total HIGH count: **1**.

### PASS Criteria

1. The Findings Overview table row for `A2-001` (the single HIGH) has its Title
   column rendered as `⚠️ **Design doc contradicts spec on Phase 2 output format**`
   (literal `⚠️` prefix followed by the title wrapped in markdown bold `**...**`).
2. The Findings Overview rows for `A2-002` (MED) and `A3-001` (INFO) render
   with plain Title text — no `⚠️`, no bold wrapping.
3. The per-finding Detail block header for `A2-001` renders as
   `### A2-001 — HIGH — Design doc contradicts spec on Phase 2 output format`
   WITHOUT the `⚠️` prefix — the emphasis is Overview-row-only.
4. All three findings appear in the Findings Overview table (no omissions).
5. The Phase 2 Summary table is printed before the Findings Overview table.

### FAIL Signals

- `A2-001`'s Overview row title is NOT prefixed with `⚠️`.
- `A2-001`'s Overview row title is NOT bold.
- `A2-001`'s Detail block header contains `⚠️` (emphasis leaked to Detail).
- Any other finding row (A2-002, A3-001) contains `⚠️` in its Overview title.
- Any finding is omitted from the Findings Overview table.

---

## Scenario B — N_HIGH == 0 (emphasis MUST NOT fire)

### Synthetic Finding Set

| ID     | Sev  | Axis               | Title                                     | Primary file           |
|--------|------|--------------------|-------------------------------------------|------------------------|
| A2-001 | MED  | internal-consistency | Dangling depends_on reference in dag.yaml | specs/my-spec/dag.yaml |
| A3-001 | INFO | state-transition-integrity | DAG not yet planned — state integrity N/A | (none)     |

Total HIGH count: **0**.

### PASS Criteria

1. All Overview rows render with plain Title text — no `⚠️` prefix anywhere in
   the Findings Overview table.
2. Both findings appear in the Findings Overview table (no omissions).
3. No Phase 3 AskUserQuestion call is issued (N_HIGH < 2).
4. A concluding recommendation line is printed after Phase 2.
5. No Phase 5 Decisions table is printed.

### FAIL Signals

- Any `⚠️` appears in the Findings Overview table.
- Phase 3 AskUserQuestion fires.
- Phase 5 Decisions table is printed.

---

## Scenario C — N_HIGH >= 2 (emphasis MUST NOT fire)

### Synthetic Finding Set

| ID     | Sev  | Axis               | Title                                              | Primary file           |
|--------|------|--------------------|----------------------------------------------------|------------------------|
| A1-001 | HIGH | cross-artifact-alignment | dag.yaml epic id 'foo-bar' not in design.md  | specs/my-spec/dag.yaml |
| A2-001 | HIGH | internal-consistency | Design doc contradicts spec on Phase 2 output format | docs/plans/.../design.md |
| A2-002 | MED  | internal-consistency | Dangling depends_on reference in dag.yaml        | specs/my-spec/dag.yaml |

Total HIGH count: **2**.

### PASS Criteria

1. All Overview rows render with plain Title text — no `⚠️` prefix anywhere in
   the Findings Overview table. With N_HIGH >= 2, Phase 3 triage fires and
   surfaces the HIGHs through the triage multi-select; the `⚠️` emphasis is not
   needed and MUST NOT appear.
2. All three findings appear in the Findings Overview table (no omissions).
3. Phase 3 AskUserQuestion fires (multiSelect: true, header: "Triage") with
   both HIGH findings as options.

### FAIL Signals

- Any `⚠️` appears in the Findings Overview table.
- Phase 3 does not fire.
- Any finding is omitted from the Findings Overview table.

---

## Automation Note

**Harness-executable (Scenario A)**: A scoring script can verify PASS criteria
#1 and #2 by checking:
- The `A2-001` Overview row contains the literal string `⚠️ **` followed by
  the title text.
- No other Overview row contains `⚠️`.
- No `### A2-001` Detail block header line contains `⚠️`.

**Behavioral / manual (all scenarios)**: The absence of `⚠️` in non-emphasis
contexts and the correct firing/non-firing of Phase 3 are best verified by a
human reviewer reading the full Phase 2 and Phase 3 output.
