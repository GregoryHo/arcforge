---
name: arc-refining
description: Use when converting design documents to structured specs, when spec quality is below threshold, or when requirements need formal acceptance criteria
---

# Refiner

## Iron Law

**SPEC IS THE WIKI — PRESERVE EVERY PRIOR DELTA. NEVER WRITE ON BLOCK.**

No overwrite of earlier `<delta>` elements. No `refiner-report.md` artifact. No escape hatch from the DAG completion gate. Block = terminal output + non-zero exit + zero filesystem state. If you find yourself wanting to trim history, write a block report, or add a `--force` flag, stop and surface the underlying need to the user instead.

**REQUIRED BACKGROUND:**
- `scripts/lib/sdd-schemas/spec.md` — read before producing any spec.xml; covers identity header + multi-delta accumulation rules.
- `references/spec-structure.md` — field tables for identity header, per-spec directory layout, detail-file requirement rules. Load when about to write files in Phase 5.

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
5. **R2 unidirectional** — refiner MUST NOT write to `docs/plans/`. On block (any reason), refiner writes nothing — terminal output and non-zero exit only.

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

## Phase 4 — LLM Judgment: Contradiction Check

Before drafting the spec, read the design doc in full and check for:

- Contradictory requirements (e.g., "sessions expire after 15 minutes" vs. "sessions never expire")
- When prior spec exists: contradiction between new requirements and existing spec requirements
- Broken dependencies (requirements that depend on removed requirements)

If contradictions or broken dependencies are found — **BLOCK**. Print each detected issue to terminal with the specific requirement IDs involved, plus a Recommendations section with concrete remediation per issue. Exit non-zero. Write no files. **No `refiner-report.md` or any other persistent artifact is written anywhere** — block behavior is terminal-only, with clean retry semantics (fix the design doc, re-run refiner, no stale state to clean up).

Ask at least 2–3 clarifying questions based on gaps or ambiguities found.

## Phase 5 — Draft Spec In Memory (Two-Pass Write)

Build the complete `spec.xml` and all `specs/<spec-id>/details/*.xml` **in memory** before writing any file to disk. This is the two-pass write pattern: build in memory → validate → write atomically only if valid.

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

- If validation returns any `level: 'ERROR'` — **BLOCK**. Print all findings with remediation guidance to terminal, exit non-zero, write no files (no `spec.xml`, no `details/`, no report file).
- WARNINGs are surfaced to the user but do not block writing.
- If zero ERRORs — write all files atomically: `spec.xml` and all `details/*.xml` in a single operation. Partial writes (spec.xml written but details/ incomplete) MUST NOT occur.

## Quality Checklist

Before writing files, confirm:

- [ ] every requirement has at least one acceptance criterion with a `<trace>` element
- [ ] no vague language — use MUST/SHOULD/MAY per RFC 2119
- [ ] all requirement IDs are unique across all detail files
- [ ] all `<detail_file path="...">` references point to files that will be written
- [ ] identity header complete: spec_id, spec_version, status, title, description, source, scope all present
- [ ] for v2+: supersedes field present; format `<spec-id>:v<N>`
- [ ] new `<delta>` element present and well-formed (when prior spec exists): version/iteration match, all refs resolve
- [ ] every prior `<delta>` is preserved verbatim — `<overview>` contains the full ascending sequence
- [ ] new `<delta>` is the last child of `<overview>`
- [ ] no contradictions between requirements
- [ ] user confirms: "Is this spec complete?"

## Red Flags — Stop

- "user seems happy, let's proceed"
- "I can make reasonable assumptions about missing requirements"
- "we can refine this in implementation"
- "skipping clarifying questions"
- "I'll just write a quick refiner-report.md so the user knows what blocked"
- "I'll force past the DAG gate this once"
- "I'll trim the older deltas — they're noise"

**All mean: stop. Keep asking until checklist complete and user confirms. On block, terminal + exit only — no files. No escape hatch from the gate. Prior deltas are preserved verbatim.**

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
- reason: [DAG gate: prior sprint incomplete | design doc invalid | contradictions found | output validation errors]
- issues listed to terminal with requirement IDs, issue types, remediation
- files written: **none** (no spec.xml, no details/, no report)
- exit: non-zero
- action: address issues then re-run refiner

There is no `refiner-report.md` artifact. Block behavior is intentionally transient — terminal output + non-zero exit, zero filesystem state across invocations. Clean retry semantics: fix the design doc (or finish the sprint), re-run.
