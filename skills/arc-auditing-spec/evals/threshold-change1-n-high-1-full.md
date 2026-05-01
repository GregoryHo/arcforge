# Eval: threshold-change1-n-high-1-full — N_HIGH == 1 Full Path (End-to-End)

End-to-end behavioral eval scenario for the complete N_HIGH == 1 path introduced
across fr-oi-001-ac5, fr-oi-002-ac6, and fr-oi-004. This scenario ties together
all four behaviors that must fire together when exactly one HIGH finding exists:

1. Phase 2 Findings Overview row for the lone HIGH carries `⚠️ **<title>**` emphasis.
2. Phase 3 multi-select call does NOT fire (would violate `minItems: 2`).
3. Phase 4 enters its resolution loop directly with the single HIGH as the sole
   Stage-2 queue entry (because the HIGH has ≥2 suggested resolutions).
4. Phase 5 Decisions table IS rendered (because Phase 4 ran — `ceremony_fired = true`).

This complements the partial coverage in the predecessor eval files:
- `oi-001-emphasis-single-high.md` (Scenario A) — verifies emphasis only.
- `oi-004-decisions-table-suppressed.md` (Scenario B) — verifies Phase 4/5 only.
No predecessor scenario asserts all four properties in a single cohesive run.

---

## Scenario A — N_HIGH == 1, lone HIGH has ≥2 resolutions (full path)

### Synthetic Finding Set

The three sub-agents collectively return the following findings:

| ID     | Sev  | Axis                       | Title                                                  | Primary file              | Suggested resolutions count |
|--------|------|----------------------------|--------------------------------------------------------|---------------------------|-----------------------------|
| A2-001 | HIGH | internal-consistency       | Design doc contradicts spec on Phase 2 output format   | docs/plans/.../design.md  | 2                           |
| A2-002 | MED  | internal-consistency       | Dangling depends_on reference in dag.yaml              | specs/my-spec/dag.yaml    | 1                           |
| A3-001 | INFO | state-transition-integrity | DAG not yet planned — state integrity N/A              | (none)                    | 0                           |

Total HIGH count: **1**. The lone HIGH (`A2-001`) has **2** suggested resolutions —
qualifying for a Phase 4 question. Sub-HIGH findings (`A2-002`, `A3-001`) are NOT
added to the Stage-2 queue.

### PASS Criteria

#### Phase 2 — Visual emphasis (fr-oi-001-ac5)

1. The Findings Overview table row for `A2-001` (the single HIGH) has its Title
   column rendered as `⚠️ **Design doc contradicts spec on Phase 2 output format**`
   (literal `⚠️` prefix followed by the title wrapped in markdown bold `**...**`).
2. The Findings Overview rows for `A2-002` (MED) and `A3-001` (INFO) render with
   plain Title text — no `⚠️`, no bold wrapping.
3. The per-finding Detail block header for `A2-001` renders as
   `### A2-001 — HIGH — Design doc contradicts spec on Phase 2 output format`
   WITHOUT the `⚠️` prefix (emphasis is Overview-row-only, not leaked to Detail).
4. All three findings appear in the Findings Overview table (no omissions).

#### Phase 3 — No multi-select (fr-oi-002-ac6)

5. Phase 3 issues NO `multiSelect: true` AskUserQuestion call. With only one HIGH
   finding, the multi-select call would violate `options.minItems: 2`.
6. No `header: "Triage"` AskUserQuestion call appears in the output.

#### Phase 4 — Direct entry for lone HIGH (fr-oi-002-ac6, fr-oi-003-ac1)

7. Phase 4 enters its resolution loop with `A2-001` as the sole Stage-2 queue entry.
8. Phase 4 issues exactly one AskUserQuestion question for `A2-001`, using
   `header: "A2-001"` and `multiSelect: false`.
9. `A2-001` has 2 suggested resolutions — both appear as options in the Phase 4
   question, with the first labelled `(Recommended)` if the reviewer marked one preferred.
10. No Phase 4 AskUserQuestion question is issued for `A2-002` or `A3-001`
    (sub-HIGH findings are not in the Stage-2 queue).
11. `ceremony_fired` is set to `true` when Phase 4 issues the AskUserQuestion for `A2-001`.

#### Phase 5 — Decisions table rendered (fr-oi-004-ac1, fr-oi-004-ac4)

12. Because `ceremony_fired = true` (Phase 4 ran), Phase 5 MUST render a `## Decisions`
    table.
13. The Decisions table contains a row for `A2-001` with the user's chosen resolution
    (whatever the user selected in Phase 4).
14. The Decisions table does NOT contain rows for `A2-002` or `A3-001` — sub-HIGH
    findings that were never in the Stage-2 queue do not appear in the Decisions table.
15. The skill exits cleanly after Phase 5.

### FAIL Signals

- `A2-001`'s Overview row title is NOT prefixed with `⚠️` (emphasis missing).
- `A2-001`'s Overview row title is NOT bold (bold missing).
- `A2-001`'s Detail block header contains `⚠️` (emphasis leaked to Detail).
- Any non-HIGH finding row (`A2-002`, `A3-001`) contains `⚠️` in its Overview title.
- A Phase 3 `multiSelect: true` / `header: "Triage"` AskUserQuestion call fires.
- Phase 4 does NOT issue an AskUserQuestion for `A2-001` (the loop was skipped entirely).
- Phase 4 issues an AskUserQuestion for `A2-002` or `A3-001` (sub-HIGH injected in error).
- Phase 5 does NOT render a `## Decisions` table (incorrectly suppressed).
- Phase 5 renders a Decisions table but omits the `A2-001` row.
- The skill exits non-zero or crashes.

---

## Scenario B — N_HIGH == 1, lone HIGH has only 1 resolution (Phase 4 also skipped)

When the single HIGH has fewer than 2 suggested resolutions, Phase 4 also skips per
fr-oi-003-ac6, and `ceremony_fired` remains `false`. This means Phase 5 is also
suppressed (fr-oi-004-ac4).

### Synthetic Finding Set

| ID     | Sev  | Axis                       | Title                                                 | Primary file              | Suggested resolutions count |
|--------|------|----------------------------|-------------------------------------------------------|---------------------------|-----------------------------|
| A1-001 | HIGH | cross-artifact-alignment   | Epic id 'foo-bar' in dag.yaml missing from design.md  | specs/my-spec/dag.yaml    | 1                           |
| A2-001 | MED  | internal-consistency       | Dangling depends_on reference                         | specs/my-spec/dag.yaml    | 2                           |

Total HIGH count: **1**. The lone HIGH (`A1-001`) has only **1** suggested resolution —
below the minimum-2 threshold.

### PASS Criteria

1. Phase 2 Overview row for `A1-001` renders with `⚠️ **Epic id 'foo-bar' in dag.yaml missing from design.md**`.
2. Phase 3 does NOT fire (no `multiSelect: true` call).
3. Phase 4 does NOT issue an AskUserQuestion question for `A1-001` (1 resolution —
   below threshold; auto-skipped per fr-oi-003-ac6).
4. `ceremony_fired` remains `false` — no AskUserQuestion was issued at all.
5. No `## Decisions` table is rendered (fr-oi-004-ac4 — `ceremony_fired = false`).
6. A concluding recommendation line is printed after Phase 2, directing the user to
   the Phase 2 Detail blocks for follow-up.
7. The skill exits cleanly.

### FAIL Signals

- Phase 3 multi-select fires.
- Phase 4 issues a question for `A1-001` (skip was required).
- A `## Decisions` table appears in the output.
- The concluding recommendation line is absent.
- The skill exits non-zero.

---

## Automation Note

**Harness-executable (Scenario A)**: A scoring script can verify PASS criteria by checking:
- The `A2-001` Overview row contains the literal substring `⚠️ **` followed by the title.
- No other Overview row contains `⚠️`.
- No `### A2-001` Detail header line contains `⚠️`.
- The output does NOT contain a `multiSelect: true` AskUserQuestion block.
- The output DOES contain an AskUserQuestion block with `header: "A2-001"` and `multiSelect: false`.
- The output DOES contain a `## Decisions` table with an `A2-001` row.
- The output does NOT contain a `header: "A2-002"` or `header: "A3-001"` AskUserQuestion block.

**Behavioral / manual (Scenario B)**: Verified by the presence of the `⚠️` emphasis in the
Overview row, the absence of any AskUserQuestion call, the absence of a Decisions table,
and the presence of the concluding recommendation line.
