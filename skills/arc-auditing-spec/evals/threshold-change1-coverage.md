# Change-1 Threshold Branch Eval Coverage Index

**Requirement**: `fr-sc-003-ac3` (skill-contract.xml v2, iteration 2026-04-24-iterate2)

This document is the human-readable audit trail confirming that the eval suite contains
at least one scenario for each of the three Change-1 threshold branches introduced in
the v2 iteration of arc-auditing-spec. It is NOT itself an eval scenario.

---

## Coverage Matrix

| Branch | Condition | Required behavior | Covering scenario(s) | Scenario ID(s) |
|--------|-----------|-------------------|----------------------|----------------|
| **(a)** | N_HIGH == 0 | Skill exits after Phase 2 with concluding recommendation line; no Phase 3 / 4 / 5 output | `oi-002-threshold-n-high-0.md` (primary), `oi-004-decisions-table-suppressed.md` (Phase 5 lens), `oi-001-emphasis-single-high.md` (baseline) | Scenario A in oi-002; Scenario A in oi-004; Scenario B in oi-001 |
| **(b)** | N_HIGH == 1 | Phase 2 Overview row carries `⚠️ **<title>**`; no Phase 3 multi-select; direct Phase 4 entry (when HIGH has ≥2 resolutions); Phase 5 Decisions table rendered | `threshold-change1-n-high-1-full.md` (end-to-end), `oi-001-emphasis-single-high.md` (emphasis only), `oi-004-decisions-table-suppressed.md` (Phase 4/5 only) | Scenario A in threshold-change1-n-high-1-full; Scenario A in oi-001; Scenario B in oi-004 |
| **(c)** | Stage-2 entry with < 2 resolutions | No AskUserQuestion issued; Decisions-table row shows `Chosen Resolution = (no ceremony — see Detail)` | `oi-003-low-resolutions-skip.md` | Scenario A (1 resolution), Scenario B (0 resolutions) in oi-003 |

---

## Branch (a) — N_HIGH == 0 Exit Path

**Condition**: All sub-agents return only MED / LOW / INFO findings; no HIGH findings.

**Required behavior** (fr-sc-003-ac3 (a)):
- Skill exits after Phase 2 with a concluding recommendation line.
- No Phase 3 AskUserQuestion call is issued.
- No Phase 4 AskUserQuestion call is issued.
- No Phase 5 Decisions table (`## Decisions`) is rendered.

**Covered by**:
- `oi-002-threshold-n-high-0.md` — Scenario A (primary): asserts all Phase 3/4 skipping and
  the concluding recommendation line. Scenario B: confirms no injection channel on the N_HIGH == 0 path.
- `oi-004-decisions-table-suppressed.md` — Scenario A: places the assertion lens on Phase 5
  suppression specifically, confirming no `## Decisions` heading appears.
- `oi-001-emphasis-single-high.md` — Scenario B: baseline case confirming no `⚠️` and no
  Phase 3 firing.

**Status**: Fully covered. No new scenario needed.

---

## Branch (b) — N_HIGH == 1 Full Path (Emphasis + No Phase 3 + Direct Phase 4 + Phase 5)

**Condition**: Exactly one HIGH finding; the lone HIGH has ≥2 suggested resolutions.

**Required behavior** (fr-sc-003-ac3 (b)):
- Phase 2 Findings Overview row for the lone HIGH carries `⚠️ **<title>**`.
- Phase 3 multi-select call does NOT fire.
- Phase 4 enters its resolution loop directly with the single HIGH as the sole Stage-2 entry.
- Phase 5 Decisions table IS rendered (because `ceremony_fired = true` after Phase 4 ran).

**Gap finding**: Predecessor scenarios covered these behaviors in isolation but not together:
- `oi-001-emphasis-single-high.md` Scenario A: verifies emphasis and no Phase 3 only.
- `oi-004-decisions-table-suppressed.md` Scenario B: verifies direct Phase 4 entry and Phase 5
  only — does NOT assert the `⚠️` emphasis.

No single predecessor scenario asserts all four properties in one cohesive run.

**Gap closed by**:
- `threshold-change1-n-high-1-full.md` — Scenario A: end-to-end scenario tying all four
  behaviors together. Scenario B additionally covers the sub-case where the lone HIGH has
  only 1 resolution, causing Phase 4 also to skip and Phase 5 to be suppressed.

**Status**: Gap closed by new scenario. End-to-end coverage now exists.

---

## Branch (c) — <2-Resolutions Phase 4 Skip with Sentinel

**Condition**: A Stage-2 queue entry has fewer than 2 suggested resolutions (0 or 1).

**Required behavior** (fr-sc-003-ac3 (c)):
- Phase 4 issues NO AskUserQuestion question for the sub-threshold finding.
- The Decisions-table row for that finding records `Chosen Resolution = (no ceremony — see Detail)`.
- The skip is treated as non-error / clean.

**Covered by**:
- `oi-003-low-resolutions-skip.md` — Scenario A: 1-resolution finding in Stage-2 queue; asserts
  no AskUserQuestion for the finding and exact sentinel string in the Decisions-table row.
  Scenario B: 0-resolution finding; same assertions. Includes exact-punctuation note on em-dash.

**Status**: Fully covered. No new scenario needed.

---

## Summary

| Branch | Pre-existing coverage complete? | Action taken |
|--------|---------------------------------|--------------|
| (a) N_HIGH == 0 exit | Yes | None (predecessors sufficient) |
| (b) N_HIGH == 1 end-to-end | No — partial coverage only | Added `threshold-change1-n-high-1-full.md` |
| (c) <2-resolutions skip + sentinel | Yes | None (oi-003 sufficient) |
