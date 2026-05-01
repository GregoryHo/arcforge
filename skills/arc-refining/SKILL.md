---
name: arc-refining
description: Use when converting design documents to structured specs, when spec quality is below threshold, or when requirements need formal acceptance criteria
---

# Refiner

## Iron Law

**NO INVENTION WITHOUT AUTHORIZATION. PRESERVE EVERY PRIOR DELTA. NEVER WRITE AUTHORITATIVE STATE ON BLOCK.**

Every criterion the refiner emits MUST trace to a design phrase or a user Q&A row — invention from training-data inference is forbidden. No overwrite of earlier `<delta>` elements. No `refiner-report.md` artifact. No escape hatch from the DAG completion gate. On R3 axis block: write only `_pending-conflict.md` (the explicit ephemeral exception per fr-rf-015), exit non-zero, no authoritative state (`spec.xml`, `details/`). On non-R3 blocks: terminal output only, exit non-zero, zero filesystem state. If you find yourself wanting to fill an unbound axis with a "sensible default", trim history, write a block report, or add a `--force` flag, stop and surface the underlying need to the user instead.

**REQUIRED BACKGROUND:**
- Read `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/spec.md` before producing any spec.xml (primary form) — it carries the canonical identity-header schema (required fields, supersedes format, delta-element rules), auto-generated from `${ARCFORGE_ROOT}/scripts/lib/sdd-utils.js`'s `SPEC_HEADER_RULES`. The CLI alternative `node "${ARCFORGE_ROOT}/scripts/lib/print-schema.js" spec` produces equivalent content. This is the single source of truth — no templates, no hand-authored examples, no drift.
- `references/spec-structure.md` — supplementary field tables for per-spec directory layout and detail-file requirement rules. Load when about to write files in Phase 5.

## Overview

Transform design documents into structured XML specifications. The spec becomes Source of Truth — downstream skills read it directly, never the design doc. The refiner is the central transformation: raw source (design.md) → live contract (spec.xml).

## When NOT to Use

- No design doc exists yet (run `/arc-brainstorming` first)
- Task is small enough that a structured spec is overhead

## Core Rules

1. **ask, don't assume** — if unclear, ask the user; never invent requirements
2. **source of truth** — spec.xml is authoritative; downstream skills quote it, never the design doc
3. **checklist validation** — complete quality checklist before writing any files
4. **iterative refinement** — ask 2–3 clarifying questions per iteration
5. **R2 unidirectional** — refiner MUST NOT write to `docs/plans/`. On non-R3 blocks (DAG gate, design-doc validation, identity-header validation), refiner writes nothing — terminal output and non-zero exit only. On R3 axis blocks (Phase 4 axis-1/2/3, Phase 5.5a self-contradiction, Phase 5.5b axis-3-LLM, Phase 6b mechanical-auth-check), refiner writes ONLY the ephemeral `specs/<spec-id>/_pending-conflict.md` per fr-rf-015 — never `spec.xml`, never `details/`. The Iron Law's "NEVER WRITE AUTHORITATIVE STATE ON BLOCK" governs both cases.

## Phase 0 — Locate Inputs

If the user has not provided a spec-id, scan `specs/` and `docs/plans/` to present available targets and ask the user to choose.

Once you have the spec-id, locate the design doc at `docs/plans/<spec-id>/<date>/design.md`.

## Phase 1 — DAG Completion Gate (when prior spec exists)

Before producing a new spec version, verify that the prior sprint is complete. This gate lives in the refiner — not the planner — so the wiki layer can never reach an inconsistent state where `spec_version` is at v(N+1) while v(N)'s DAG is still running.

**No prior spec → skip this phase.** v1 formalization has no prior sprint to be incomplete.

**Prior spec exists → run the gate check:**

```bash
node -e "
  const { checkDagStatus } = require('./scripts/lib/sdd-utils');
  const status = checkDagStatus('specs/<spec-id>/dag.yaml');
  if (status === null) {
    console.log('No dag.yaml — proceed (legal: refined but not yet planned).');
  } else if (status.incomplete === 0) {
    console.log('All', status.total, 'epics complete — proceed with new iteration.');
  } else {
    console.log('BLOCKED:', status.incomplete, 'of', status.total, 'epics still incomplete:');
    for (const e of status.incompleteEpics) console.log('  -', e.id, '(' + e.status + ')');
    console.log('Complete current sprint before iterating.');
    process.exit(1);
  }
"
```

Three outcomes:

1. **`checkDagStatus` returns null** (no `dag.yaml` exists) → proceed. Legal state: user refined but did not yet run the planner.
2. **All epics in `"completed"` status** → proceed with the new iteration.
3. **Any epic NOT in `"completed"` status** → **BLOCK**. Print the incomplete epic list to terminal, print "Complete current sprint before iterating.", exit non-zero. Write no files (no `spec.xml`, no `details/`, no report).

### No escape hatch

When the gate blocks, the user has exactly two paths forward:

a. Complete the remaining epics in the current sprint (status → `completed`), then re-run refiner.
b. Abandon the entire spec by deleting `specs/<spec-id>/` (a filesystem action — not an arcforge primitive), then start over.

There is no `--force` flag, no `abandoned` epic status, no environment-variable override, no partial abandonment mechanism. Partial abandonment would corrupt `dag.yaml` status semantics (from "actual execution state" to "what the user wishes were the state"), polluting every downstream tool that reads it. **If you find yourself wanting to add an escape hatch, stop and surface the underlying need to the user instead.**

## Phase 2 — Input Validation

Validate the design doc programmatically:

```bash
node -e "
  const { parseDesignDoc, validateDesignDoc } = require('./scripts/lib/sdd-utils');
  const parsed = parseDesignDoc('docs/plans/<spec-id>/<date>/design.md');
  const result = validateDesignDoc(parsed);
  console.log(JSON.stringify(result, null, 2));
"
```

- If `valid` is `false` and any issue has `level: 'ERROR'` — **BLOCK**. Print the issues to terminal, exit non-zero, write no files. Do not write any report file.
- If `valid` is `false` with only WARNINGs — proceed but surface the warnings to the user.
- If `valid` is `true` — proceed.

## Phase 3 — Detect Behavior Context

Check the filesystem for a prior spec at the canonical path:

- `specs/<spec-id>/spec.xml` **exists** → this is an iteration; the design doc must contain Context + Change Intent sections.
- `specs/<spec-id>/spec.xml` **does not exist** → this is the first formalization (v1); the design doc carries prose with problem / solution / requirements / scope.

This is one refiner behavior with conditional fields based on filesystem state — not two modes. There is no mode parameter, no path-style label, no greek-letter framing. The filesystem is the single source of truth for which sections to expect.

When a prior spec exists, the design doc MUST have both Context and Change Intent sections. Missing either is ERROR — block with: "Iteration design doc must have Context and Change Intent sections — re-run brainstorming with the prior spec in scope."

When the design doc's date folder is older than or equal to the spec's recorded `design_iteration`, produce a WARNING: "design iteration `<date>` is not newer than spec source `<spec-date>` — this may be a stale design doc."

## Phase 4 — LLM Judgment: Three-Axis Contradiction Check

Before drafting the spec, read the design doc and the brainstorming Q&A decision-log in full, then check three axes. R3 fires when ANY axis surfaces a contradiction.

**Axis 1 — design.md internal contradictions.**

- Contradictory requirements within the design. Print both requirement IDs to terminal — e.g., REQ-A requires "sessions expire after 15 minutes" and REQ-B requires "sessions never expire" is an axis-1 contradiction; terminal output MUST name both REQ-A and REQ-B with a pointer to `specs/<spec-id>/_pending-conflict.md`.
- When prior spec exists: contradiction between new design requirements and existing spec requirements.
- Broken dependencies (requirements that depend on removed requirements).

**Axis 2 — design.md ↔ user Q&A answers.**

If design says X and a user Q&A row says ¬X, the conflict is unresolved. Refiner does not silently pick one — **silently picking either side is forbidden even if the Q&A answer is more recent than the design.** Terminal output MUST cite both the design line range and the Q&A row q_id. Examples:

- Design says `windowSec: 60`; Q&A row says "use `windowMs` for consistency" → axis 2 fires.
- Design says `max=32`; Q&A row says "make 32 the default but configurable via flag" → axis 2 fires.

The refiner has no authorization to pick. Authoring `windowMs: 60000` (or any reconciled middle ground) without surfacing the conflict is the failure mode this axis catches.

**Axis 3 — spec-draft coverage (deferral and invention).**

- Every criterion the refiner is about to draft must trace to a (design phrase ∪ Q&A row) source. A criterion with no such source is invention; under R3, it does not belong in the spec.
- Deferral signals in Q&A ("use defaults", "covered.", "skip", "you decide", and similar) DO NOT authorize concrete MUSTs. A deferred axis is unbound, not "implicitly authorized via training-data common practice".

**On any axis firing — BLOCK.** Print to terminal:

1. Which axis fired (1, 2, or 3) and a one-line description of the conflict.
2. The specific design line ranges and Q&A row q_ids involved (so the user can locate them without re-reading the whole design).
3. **1–3 candidate resolutions** the user can pick from when re-running brainstorming. Provide AT LEAST 1 and AT MOST 3 — the writer enforces this range. Examples per axis:
   - Axis 1: `(a) keep requirement A, drop B; (b) keep B, drop A; (c) widen scope so both hold under disjoint conditions`.
   - Axis 2: `(a) keep design wording, edit Q&A row; (b) accept Q&A answer, edit design; (c) make the axis configurable so both stances coexist`.
   - Axis 3: `(a) downgrade the criterion to SHOULD/MAY citing design's qualitative phrase; (b) leave the axis unbound; (c) ask user to specify a concrete value in a new design iteration`.

**Before exiting non-zero, MUST write the conflict handoff file (fr-rf-015-ac1):**

```bash
node -e "
  const { writeConflictMarker } = require('./scripts/lib/sdd-utils');
  writeConflictMarker('<spec-id>', {
    axis_fired: '<1|2|3>',
    conflict_description: '<specific design line ranges and Q&A row q_ids involved>',
    candidate_resolutions: [
      '(a) <first candidate>',
      '(b) <second candidate>'
    ],
    user_action_prompt: 'Run /arc-brainstorming iterate <spec-id> to resolve this conflict.'
  });
"
```

The schema source of truth is `PENDING_CONFLICT_RULES` (from `scripts/lib/sdd-utils`). The file is written at `specs/<spec-id>/_pending-conflict.md`. It is **ephemeral** — brainstorming Phase 0 reads it as Change Intent seed (fr-bs-008), then deletes it on successful new-design write. Refiner does NOT clean it up.

**MUST NOT write `_pending-conflict.md` for non-R3-axis blocks (fr-rf-015-ac2):**
- DAG completion gate failure (fr-rf-012) → terminal output only, exit non-zero, no file written.
- Design-doc validation failure (fr-rf-009) → terminal output only, exit non-zero, no file written.
- Identity-header validation errors (fr-rf-010-ac1 through fr-rf-010-ac4) → terminal output only, exit non-zero, no file written.

These are pipeline-mechanical or programmer-error blocks, not axis contradictions. Their output channel is terminal only.

Exit non-zero. Write no authoritative files — no `spec.xml`, no `details/`, no report. The `_pending-conflict.md` is the only file written. The user routes through `/arc-brainstorming iterate <spec-id>` to author a new dated `design.md` (R1-authorized), refiner re-runs against the new design, no stale state to clean up.

Ask at least 2–3 clarifying questions when gaps or ambiguities (not contradictions) surface — gaps are unbound axes (legal under axis 3 by leaving the axis unbound), not R3 triggers.

## Phase 5 — Draft Spec In Memory (Two-Pass Write)

Build the complete `spec.xml` and all `specs/<spec-id>/details/*.xml` **in memory** before writing any file to disk. This is the two-pass write pattern: build in memory → validate → write atomically only if valid.

### No invention without authorization

Refiner MUST NOT author criteria from training-data inference. When a design phrase is qualitative ("rate-limited", "fast", "secure") or a Q&A row defers ("use defaults", "covered.", "skip", "you decide"), the legitimate refiner moves are exactly three:

1. **Preserve design's qualitative phrasing as SHOULD/MAY.** The source phrase is in design.md — that is the authorization. SHOULD/MAY signals "non-binding hint" without inventing a concrete number. The `<trace>` cites the qualitative phrase in design.md.
2. **Leave the axis unbound.** No criterion at all on that axis. Downstream stages (planner, implementing) may surface the unbound axis as a planning question; refiner does not pre-answer it.
3. **BLOCK with candidate resolutions.** When ambiguity is large enough that neither (1) nor (2) is honest — for example, the design's qualitative phrase is so vague that any SHOULD wording would itself be invention — route the user through brainstorming via Phase 4's block flow.

Inventing a concrete MUST from training-data common practice ("most rate-limiters use 60-second windows, so MUST window=60s") is **not** on this list. It violates the Iron Law's first clause.

**Deferral signals (ac2).** A Q&A row carries `deferral_signal=true` when its `user_answer_verbatim` matches one of the canonical deferral phrases — the four canonical phrases per `DECISION_LOG_RULES.deferral_signal_canonical_phrases` are: "use defaults", "covered.", "skip", "you decide". When `deferral_signal=true`, the corresponding axis is unbound. Deferral does NOT authorize a concrete MUST derived from training-data common practice — the same three legitimate moves apply. A deferred answer means the user deliberately left the axis open; refiner has no authorization to pre-fill it.

**Every concrete MUST must be sourced (ac3).** For every concrete MUST the refiner is about to author, it MUST be able to point to a non-deferral source — either a design phrase that contains the concrete value, or a Q&A row whose `user_answer_verbatim` contains the concrete value with `deferral_signal=false`. If no such source exists, the criterion is invention and MUST NOT be authored; use one of the three legitimate moves instead. This rule is the runtime invariant that `mechanicalAuthorizationCheck` (in `scripts/lib/sdd-validators.js`) verifies at Phase 6 — every concrete MUST in the produced spec will be checked mechanically, so any invention the LLM drafts here will be caught and cause a block downstream.

Field tables (identity header, per-spec directory layout, detail-file requirement rules, unchanged-requirements rule) are in `references/spec-structure.md` — already listed under REQUIRED BACKGROUND above. The decision logic below (wiki-style delta accumulation, version increment semantics) stays here.

### Version Increment (when prior spec exists)

- `spec_version` = previous version + 1
- `supersedes` = `<spec-id>:v<previous-version>`
- `source/design_path` and `source/design_iteration` point to the NEW design doc

### Delta Elements — Wiki-Style Accumulation

`<overview>` accumulates all `<delta>` elements ever written. Each iteration appends one new `<delta>` as the **last child of `<overview>`**. **Refiner MUST preserve every prior `<delta>` element verbatim** — no overwrite, no merge, no deduplication, no rewrite. Earlier deltas are historical record, frozen at the moment they were appended.

```xml
<overview>
  ... identity fields ...
  <delta version="2" iteration="2026-05-10">
    <added ref="fr-as-007" />
    <modified ref="fr-as-002" />
  </delta>
  <delta version="3" iteration="2026-06-01">
    <added ref="fr-as-009" />
    <removed ref="fr-as-001">
      <reason>Required — why removed</reason>
      <migration>Optional — how integrations adapt</migration>
    </removed>
    <renamed ref_old="fr-as-002" ref_new="fr-auth-002">
      <reason>Optional — semantic change explanation</reason>
    </renamed>
  </delta>
</overview>
```

Rules for the **new** (current sprint's) delta:

- `delta.version` MUST equal the new `spec_version`
- `delta.iteration` MUST equal the new `source/design_iteration`
- `<added>` and `<modified>` ref MUST correspond to a real requirement in current detail files
- `<removed>` MUST include a `<reason>` child; `<migration>` is optional. The implementer LLM reads both as teardown guidance — phrase them with that reader in mind, not just for human archive purposes.
- `<renamed>` is **body-unchanged only** — `ref_new` MUST exist in current detail files; semantic changes use `<removed>` + `<added>`, never `<renamed>` + `<modified>`.

For the first formalization (no prior spec): no `<delta>` element. Its absence signals "plan all requirements" to the planner.

For v2+: the new delta is appended after the prior delta(s). The resulting sequence MUST be ordered ascending by `version`. Both `parsed.deltas` (full array) and `parsed.latest_delta` (highest version) are exposed by `parseSpecHeader` for downstream consumers.

## Phase 5.5 — Spec Self-Contradiction Sub-Pass + Axis-3 LLM Judgment

Phase 5.5 hosts two independent checks. Both can block; their block behaviors differ.

### 5.5a — Self-Contradiction Sub-Pass

Before Phase 6 output validation, re-read each requirement's `<description>` against each `<criterion>` (and against sibling criteria). Two failure modes to flag:

- **Scope mismatch.** Description says "the system handles X" (covering both success and failure paths), but ACs only test the success path. The description's scope and the AC set's coverage diverge — readers will infer requirements that the spec does not actually test. Remediation hint: "widen ACs to cover failure path, or narrow description to match ACs."
- **RFC-2119 verb mismatch.** Description uses MUST but a sibling AC for the same axis uses SHOULD (or vice versa). The verb's strength must be consistent across description and ACs for the same axis. Mismatches signal copy-paste drift between drafting passes. Remediation hint: "align verbs across description and ACs for the same axis."

If any requirement fails this sub-pass — **BLOCK (R3 enforcement severity).** Print to terminal: requirement ID, the specific scope or verb mismatch, and the relevant remediation hint above. Exit non-zero. Write no authoritative files — no `spec.xml`, no `details/`. **Phase 5.5 findings MUST NOT be downgraded to WARNING** — a WARN would let the spec ship with internal contradictions, which is precisely Pattern 3 of the eval evidence.

**Before exiting non-zero, MUST write the conflict handoff file (fr-rf-014-ac5):** call `writeConflictMarker` (recipe above in Phase 4) with these values:
- `axis_fired: '3'`
- `conflict_description`: `'<requirement ID>: <specific scope or verb mismatch> — <remediation hint from ac1/ac2>'` (ac1: widen/narrow scope; ac2: align verbs)
- `candidate_resolutions`: 1–3 concrete user-pickable resolutions
- `user_action_prompt`: `'Run /arc-brainstorming iterate <spec-id> to resolve this conflict.'`

This is the single recovery surface for every R3 BLOCK — self-contradiction is not exempted from the handoff.

### 5.5b — Axis-3 LLM Judgment Pass

Re-read each criterion in the in-memory draft and verify it traces to a (design phrase ∪ Q&A row) citable source. This is the LLM-judgment layer of axis 3 (the mechanical layer runs at Phase 6 via `mechanicalAuthorizationCheck` — Phase 5.5b is LLM judgment, Phase 6 is the mechanical follow-up over `<trace>` elements). Criteria with no citable source trigger BLOCK per fr-rf-001 axis 3.

If any criterion has no traceable source — **BLOCK (write conflict file, per fr-rf-015-ac1, R3 enforcement severity).** Phase 5.5 findings MUST NOT be downgraded to WARNING — Pattern 3 applies here too. Before exiting non-zero:

1. Call `writeConflictMarker` (same pattern as Phase 4 block shown above), setting `axis_fired: '3'`.
2. Print to terminal: which criterion has no source, and the 1–3 candidate resolutions.
3. Exit non-zero. Write no authoritative files — no `spec.xml`, no `details/`.

This sub-pass is independent of Phase 4's three axes. Phase 4 catches conflicts between the design inputs; Phase 5.5 catches the spec-to-be contradicting itself (5.5a) or having invented criteria (5.5b). Both 5.5a and 5.5b write `_pending-conflict.md` — single recovery surface for every R3 BLOCK.

## Phase 6 — Output Validation (Two-Pass Write, continued)

Before writing any file to disk, validate the in-memory spec:

```bash
node -e "
  const fs = require('fs');
  const { parseSpecHeader, validateSpecHeader } = require('./scripts/lib/sdd-utils');
  const xml = fs.readFileSync('_draft_spec.xml', 'utf-8');
  const parsed = parseSpecHeader(xml);
  const result = validateSpecHeader(parsed);
  console.log(JSON.stringify(result, null, 2));
"
```

Phase 6 runs two checks:

**6a — Identity-header validation (non-R3 block, per fr-cc-if-002):**

`validateSpecHeader` verifies the identity-header contract (fr-cc-if-002): `spec_id`, `spec_version`, `status`, `source`, and `scope` must all be present and well-formed. Any missing or malformed field is ERROR.

- If `validateSpecHeader` returns any `level: 'ERROR'` — **BLOCK (no conflict file, per fr-rf-015-ac2)**. Print all findings with remediation guidance to terminal, exit non-zero, write no files (no `spec.xml`, no `details/`, no report file). **Do NOT write `_pending-conflict.md`** — header validation errors are schema/programmer errors, not axis contradictions.
- WARNINGs are surfaced to the user but do not block writing.

**6b — Axis-3 mechanical authorization check (R3-axis block, writes conflict file):**

```bash
node -e "
  const fs = require('fs');
  const { mechanicalAuthorizationCheck, writeConflictMarker } = require('./scripts/lib/sdd-utils');
  const result = mechanicalAuthorizationCheck(
    fs.readFileSync('_draft_spec.xml', 'utf-8'),
    'docs/plans/<spec-id>/<date>/design.md',
    'docs/plans/<spec-id>/<date>/decision-log.yml'
  );
  if (!result.valid) {
    console.log(JSON.stringify(result.unauthorized_traces, null, 2));
    writeConflictMarker('<spec-id>', {
      axis_fired: '3',
      conflict_description: 'Mechanical authorization check failed: ' +
        result.unauthorized_traces.map(t => t.trace_value + ' (' + t.reason + ')').join('; '),
      candidate_resolutions: [
        '(a) Add authorizing source to design.md for the flagged criterion.',
        '(b) Downgrade the criterion to SHOULD/MAY citing design qualitative phrase.',
        '(c) Remove the criterion — the axis is unbound without an authorizing source.'
      ],
      user_action_prompt: 'Run /arc-brainstorming iterate <spec-id> to resolve this conflict.'
    });
    process.exit(1);
  }
"
```

If `mechanicalAuthorizationCheck` returns `valid: false` — **BLOCK (write conflict file, per fr-rf-015-ac1)**. Call `writeConflictMarker` with `axis_fired: '3'`, then exit non-zero. Write no authoritative files.

**If both checks pass:** write all files atomically: `spec.xml` and all `details/*.xml` in a single operation. Partial writes (spec.xml written but details/ incomplete) MUST NOT occur.

## Quality Checklist

Before writing files, confirm:

- [ ] every requirement has at least one acceptance criterion with a `<trace>` element
- [ ] every `<trace>` points to a real source — a design.md line range that contains the cited content, or a Q&A row q_id whose `user_answer_verbatim` contains the cited content (no invention from training data)
- [ ] every concrete MUST has an authorizing source — design phrase or non-deferral Q&A answer; deferral signals do NOT authorize concrete MUSTs
- [ ] no vague language — use MUST/SHOULD/MAY per RFC 2119
- [ ] all requirement IDs are unique across all detail files
- [ ] all `<detail_file path="...">` references point to files that will be written
- [ ] identity header complete: spec_id, spec_version, status, title, description, source, scope all present
- [ ] for v2+: supersedes field present; format `<spec-id>:v<N>`
- [ ] new `<delta>` element present and well-formed (when prior spec exists): version/iteration match, all refs resolve
- [ ] every prior `<delta>` is preserved verbatim — `<overview>` contains the full ascending sequence
- [ ] new `<delta>` is the last child of `<overview>`
- [ ] Phase 4 three axes all clean (design internal, design ↔ Q&A, criterion coverage)
- [ ] Phase 5.5a sub-pass clean (no description ↔ AC scope or verb mismatches)
- [ ] Phase 5.5b axis-3 LLM judgment clean (every criterion has a citable source)
- [ ] Phase 6a identity-header validation passed (`validateSpecHeader` returns no ERROR)
- [ ] Phase 6b mechanical authorization check passed (`mechanicalAuthorizationCheck` returns `valid: true` — every `<trace>` resolves to design.md or decision-log content)
- [ ] user confirms: "Is this spec complete?"

## Red Flags — Stop

- "user seems happy, let's proceed"
- "I can make reasonable assumptions about missing requirements"
- "we can refine this in implementation"
- "skipping clarifying questions"
- "I'll just write a quick refiner-report.md so the user knows what blocked"
- "I'll force past the DAG gate this once"
- "I'll trim the older deltas — they're noise"
- "user said 'use defaults' / 'covered.' / 'skip', so I'll pick a sensible value"
- "training data shows most systems do X, so MUST X"
- "design says X and Q&A says ¬X, but Q&A is more recent so I'll use that" (axis 2 silent pick)
- "the criterion is obviously implied by the design's wording" (no `<trace>` source = invention)
- "this scope mismatch between description and ACs is minor, ship it"

**All mean: stop. Keep asking until checklist complete and user confirms. On R3 axis block: write `_pending-conflict.md` then exit non-zero — no authoritative files. On all other blocks: terminal + exit only — zero files. No escape hatch from the gate. Prior deltas are preserved verbatim. No invention from training data; no silent picks across design/Q&A conflicts; no shipping a spec that contradicts itself.**

## Commit Requirements

After generating or updating specs:

```
git add specs/<spec-id>/
git commit -m "docs: refine spec for <spec-id>"
```

## After This Skill

Hand off to `/arc-planning` — the planner reads `specs/<spec-id>/spec.xml` and the latest `<delta>` (via `parsed.latest_delta`) to scope the planning sprint.

## Completion Format

✅ refiner complete
- spec-id: `<spec-id>`
- context: first formalization (v1) | iteration on prior spec (v2+)
- spec_version: N
- deltas accumulated in `<overview>`: N (new delta appended as last child)
- checklist: complete ✓
- output: `specs/<spec-id>/spec.xml` + N detail files (committed)
- ready for: `/arc-planning`

## Blocked Format

⚠️ refiner blocked
- spec-id: `<spec-id>`
- reason: [DAG gate: prior sprint incomplete | design doc invalid | axis 1 design contradiction | axis 2 design↔Q&A conflict | axis 3 unauthorized criterion (invention) | spec self-contradiction (Phase 5.5a) | output validation errors]
- issues listed to terminal with requirement IDs, issue types, remediation
- files written (R3 axis-1/2/3 blocks, Phase 5.5a, Phase 5.5b): `specs/<spec-id>/_pending-conflict.md` (ephemeral handoff — brainstorming reads and deletes it)
- files written (all other blocks): **none** (no spec.xml, no details/, no report)
- exit: non-zero
- action: for R3 axis blocks → run `/arc-brainstorming iterate <spec-id>` to resolve. For other blocks → address issues then re-run refiner.

There is no `refiner-report.md` artifact. Block behavior is intentionally transient — terminal output + non-zero exit, no authoritative filesystem state. The `_pending-conflict.md` is the only permitted artifact on R3 axis blocks; it is ephemeral (brainstorming deletes it). Clean retry semantics: resolve the conflict (or fix the design doc / finish the sprint), re-run.
