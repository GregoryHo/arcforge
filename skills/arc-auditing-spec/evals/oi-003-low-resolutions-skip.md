# Eval: oi-003-low-resolutions-skip — Phase 4 Auto-Skip for < 2 Resolutions

Behavioral eval scenario for the Phase 4 per-finding skip rule introduced in
`fr-oi-003-ac6`. Covers the case where a Stage-2 queue entry has fewer than 2
suggested resolutions: the skill must NOT issue an AskUserQuestion question for
it, must record it in the Decisions table with the sentinel
`(no ceremony — see Detail)`, and must NOT treat the skip as an error.

---

## Scenario A — Single-resolution finding in Stage-2 queue (1 resolution)

### Context

Phase 3 has fired (N_HIGH >= 2) and added two HIGH findings to the Stage-2
resolution queue. One of them has 2 resolutions (qualifying); the other has
only 1 resolution (below the minimum-2 threshold).

### Synthetic Finding Set (Stage-2 queue after Phase 3)

| ID     | Sev  | Suggested resolutions count | Notes                         |
|--------|------|-----------------------------|-------------------------------|
| A1-001 | HIGH | 2                           | Qualifying — receives question |
| A2-001 | HIGH | 1                           | Below threshold — auto-skipped |

A2-001 was returned by the internal-consistency agent with only a single
suggested resolution ("Rename the mismatched epic id in dag.yaml").

### PASS Criteria

1. Phase 4 issues an AskUserQuestion question for `A1-001` (2 resolutions —
   qualifying), using `header: "A1-001"` and `multiSelect: false`.
2. Phase 4 does NOT issue any AskUserQuestion question for `A2-001` (1
   resolution — below threshold). No AskUserQuestion call with
   `header: "A2-001"` appears in the output.
3. The Decisions table (when rendered per fr-oi-004) contains a row for
   `A2-001` with Chosen Resolution set to the exact sentinel string
   `(no ceremony — see Detail)` and User Note empty.
4. The Decisions table contains a row for `A1-001` with the user's chosen
   resolution (whatever the user selected).
5. The skill does NOT exit non-zero or produce an error message about
   `A2-001` having fewer than 2 resolutions. The skip is silent and clean.
6. The Phase 2 Detail block for `A2-001` was already rendered in Phase 2
   with its full content (Observed evidence table, Why it matters prose,
   Suggested Resolutions table listing the single resolution). The skip at
   Phase 4 does not remove or alter the Phase 2 Detail block.

### FAIL Signals

- An AskUserQuestion call with `header: "A2-001"` appears in the output
  (question should have been skipped).
- The Decisions table row for `A2-001` uses any string other than the exact
  sentinel `(no ceremony — see Detail)` — e.g., `(no ceremony - see Detail)`
  (hyphen instead of em-dash) or `(skipped)` or any other paraphrase.
- The Decisions table row for `A2-001` has a non-empty User Note.
- The skill logs an error, prints a warning, or exits non-zero because
  `A2-001` has fewer than 2 resolutions.
- The Phase 2 Detail block for `A2-001` is absent (the skip must not affect
  Phase 2 output).

---

## Scenario B — Zero-resolution finding in Stage-2 queue (0 resolutions)

### Context

A finding with zero suggested resolutions was injected into the Stage-2
queue via the Other free-text channel in Phase 3 (finding ID pulled in by
the user, but the sub-agent returned an empty resolutions list for it).
Treat 0 resolutions identically to 1 resolution — both are below the
minimum-2 threshold.

### Synthetic Finding Set (Stage-2 queue after Phase 3)

| ID     | Sev  | Suggested resolutions count | Notes                         |
|--------|------|-----------------------------|-------------------------------|
| A1-001 | HIGH | 3                           | Qualifying — receives question |
| A3-001 | INFO | 0                           | Below threshold — auto-skipped |

### PASS Criteria

1. Phase 4 issues an AskUserQuestion question for `A1-001` (3 resolutions).
2. Phase 4 does NOT issue any AskUserQuestion question for `A3-001`
   (0 resolutions — below threshold).
3. The Decisions table row for `A3-001` has Chosen Resolution set to the
   exact sentinel `(no ceremony — see Detail)` and User Note empty.
4. No error, warning, or non-zero exit due to `A3-001` having 0 resolutions.

### FAIL Signals

- AskUserQuestion fires for `A3-001`.
- Decisions table row for `A3-001` uses any string other than the exact
  sentinel `(no ceremony — see Detail)`.
- Skill exits non-zero or logs an error about 0 resolutions.

---

## Sentinel Exact-Punctuation Note

The sentinel string is `(no ceremony — see Detail)`. The dash between
"ceremony" and "see" is an em-dash (`—`, U+2014), not a hyphen-minus (`-`,
U+002D) or an en-dash (`–`, U+2013). Automated grading scripts SHOULD check
for the exact Unicode character.

---

## Automation Note

**Harness-executable (Scenario A)**: A scoring script can verify PASS criteria
by checking:
- The output does NOT contain an AskUserQuestion block with `header: "A2-001"`.
- The output contains the literal string `(no ceremony — see Detail)` in the
  Decisions table row for `A2-001`.
- The Decisions table row for `A2-001` has an empty User Note cell (two
  adjacent `|` separators or only whitespace between them).
- The Phase 2 Detail block for `A2-001` is present in the output.

**Behavioral / manual (Scenario B)**: The zero-resolution case is best
verified by a human reviewer confirming that no AskUserQuestion fires for the
zero-resolution finding and that the sentinel appears in the Decisions table.
