---
name: arc-refining
description: Use when converting design documents to structured specs, when spec quality is below threshold, or when requirements need formal acceptance criteria
---

# Refiner

## Overview

Transform design documents into structured XML specifications. The spec becomes Source of Truth — downstream skills read it directly, never the design doc. The refiner is the central transformation: raw source (design.md) → live contract (spec.xml).

**REQUIRED BACKGROUND:** `scripts/lib/sdd-schemas/spec.md` — read before producing any spec.xml to understand the required identity header structure.

## When NOT to Use

- No design doc exists yet (run `/arc-brainstorming` first)
- Task is small enough that a structured spec is overhead

## Core Rules

1. **ask, don't assume** — if unclear, ask the user; never invent requirements
2. **source of truth** — spec.xml is authoritative; downstream skills quote it, never the design doc
3. **checklist validation** — complete quality checklist before writing any files
4. **iterative refinement** — ask 2–3 clarifying questions per iteration
5. **R2 unidirectional** — MUST NOT write to `docs/plans/` except the report on block

## Phase 0 — Locate Inputs

If the user has not provided a spec-id, scan `specs/` and `docs/plans/` to present available targets and ask the user to choose.

Once you have the spec-id, locate the design doc at `docs/plans/<spec-id>/<date>/design.md`.

## Phase 1 — Input Validation

Before any formalization, validate the design doc programmatically:

```bash
node -e "
  const { parseDesignDoc, validateDesignDoc } = require('./scripts/lib/sdd-utils');
  const parsed = parseDesignDoc('docs/plans/<spec-id>/<date>/design.md');
  const result = validateDesignDoc(parsed);
  console.log(JSON.stringify(result, null, 2));
"
```

- If `valid` is `false` and any issue has `severity: "ERROR"` — **BLOCK**. Write `docs/plans/<spec-id>/<date>/refiner-report.md` (see Blocked Format below), then stop. Do not proceed to formalization.
- If `valid` is `false` with only WARNINGs — proceed but surface the warnings to the user.
- If `valid` is `true` — proceed.

## Phase 2 — Detect Mode (Filesystem Check)

Check whether an existing spec exists:

- `specs/<spec-id>/spec.xml` **exists** → **iteration mode** (update existing spec)
- `specs/<spec-id>/spec.xml` **does not exist** → **initial mode** (create new spec from scratch)

No explicit mode parameter. The filesystem is the single source of truth for mode detection.

### Iteration Mode Extra Checks

In iteration mode, the design doc must follow gamma mode structure (Context + Change Intent sections). If either is missing, block with remediation: "Iteration design doc must have Context and Change Intent sections — re-run brainstorming with Path B."

If the design doc date folder is older than or equal to the spec's recorded `design_iteration`, produce a WARNING: "design iteration `<date>` is not newer than spec source `<spec-date>` — this may be a stale design doc."

## Phase 3 — LLM Judgment: Contradiction Check

Before drafting the spec, read the design doc in full and check for:

- Contradictory requirements (e.g., "sessions expire after 15 minutes" vs. "sessions never expire")
- In iteration mode: contradiction between new requirements and existing spec requirements
- Broken dependencies (requirements that depend on removed requirements)

If contradictions or broken dependencies are found — **BLOCK** (see Blocked Format). Do not produce spec.xml.

Ask at least 2–3 clarifying questions based on gaps or ambiguities found.

## Phase 4 — Draft Spec In Memory (Two-Pass Write)

Build the complete spec.xml and all `specs/<spec-id>/details/*.xml` **in memory** before writing any file to disk. This is the two-pass write pattern: build in memory → validate → write atomically only if valid.

### Identity Header (always required)

Read `scripts/lib/sdd-schemas/spec.md` for the full field reference. Every `specs/<spec-id>/spec.xml` must have an `<overview>` identity header with:

| Field | Rule |
|---|---|
| `spec_id` | kebab-case; MUST match the folder name under `specs/` |
| `spec_version` | starts at 1 for initial mode; increments for each iteration |
| `status` | always `"active"` |
| `title` | human-readable name |
| `description` | strategic purpose — WHY this spec exists, not a scope summary |
| `source/design_path` | path to the exact design doc file |
| `source/design_iteration` | ISO date prefix (YYYY-MM-DD) matching the design doc folder |
| `supersedes` | required for v2+; format: `<spec-id>:v<previous-version>` |
| `scope` | `<includes>` with `<feature id="...">` elements; `<excludes>` recommended |

### Version Increment (iteration mode)

- `spec_version` = previous version + 1
- `supersedes` = `<spec-id>:v<previous-version>`
- `source/design_path` and `source/design_iteration` point to the NEW design doc

### Delta Element (iteration mode only)

In iteration mode, write a `<delta>` element as the **last child of `<overview>`**. The `<delta>` records what changed in this version so the planner can scope work without reading the design doc.

```xml
<delta version="N" iteration="YYYY-MM-DD">
  <added ref="fr-new-001">Short description</added>
  <modified ref="fr-existing-002">Short description</modified>
  <removed ref="fr-old-003">
    <reason>Required — why removed</reason>
    <migration>Optional — how integrations adapt</migration>
  </removed>
  <renamed ref_old="fr-as-002" ref_new="fr-auth-002">
    <reason>Optional — semantic change explanation</reason>
  </renamed>
</delta>
```

- `delta.version` MUST match `spec_version`
- `delta.iteration` MUST match `source/design_iteration`
- Every ref in `<added>` and `<modified>` MUST correspond to a real requirement in the detail files
- `<removed>` MUST include a `<reason>` child
- For initial mode (v1): no `<delta>` element — its absence signals "plan all requirements"

### Per-Spec Directory Structure

```
specs/
└── <spec-id>/
    ├── spec.xml              # identity header + details index
    └── details/
        ├── feature-a.xml
        └── feature-b.xml
```

Each `specs/<spec-id>/` folder is self-contained. Detail files MUST NOT reference requirements from other spec folders.

### Detail File Requirements

Each `<requirement>` in a detail file must have:
- `id` attribute — unique across all detail files; format `fr-<domain>-NNN`
- `<title>` — short name
- `<description>` — what the system must do
- `<acceptance_criteria>` — at least one `<criterion>` with a `<trace>` element

Criterion text MUST follow Given/When/Then pattern. Use RFC 2119 keywords (MUST/SHALL/SHOULD/MAY).

### Iteration Mode: Unchanged Requirements

Requirements NOT affected by the design doc's Change Intent MUST remain unchanged in the output. Only ADDED / MODIFIED / REMOVED / RENAMED requirements change.

## Phase 5 — Output Validation (Two-Pass Write, continued)

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

- If validation returns any `severity: "ERROR"` — **BLOCK**. Surface all findings with remediation guidance. Do not write any files to `specs/<spec-id>/`.
- WARNINGs are surfaced to the user but do not block writing.
- If zero ERRORs — write all files atomically: spec.xml and all details/*.xml in a single operation. Partial writes (spec.xml written but details/ incomplete) MUST NOT occur.

## Quality Checklist

Before writing files, confirm:

- [ ] every requirement has at least one acceptance criterion with a `<trace>` element
- [ ] no vague language — use MUST/SHOULD/MAY per RFC 2119
- [ ] all requirement IDs are unique across all detail files
- [ ] all `<detail_file path="...">` references point to files that will be written
- [ ] identity header complete: spec_id, spec_version, status, title, description, source, scope all present
- [ ] for v2+: supersedes field present; format `<spec-id>:v<N>`
- [ ] delta element present and well-formed (iteration mode only): version/iteration match, all refs resolve
- [ ] `<delta>` is the last child of `<overview>` (not a sibling)
- [ ] no contradictions between requirements
- [ ] user confirms: "Is this spec complete?"

## Red Flags — Stop

- "user seems happy, let's proceed"
- "I can make reasonable assumptions about missing requirements"
- "we can refine this in implementation"
- "skipping clarifying questions"

**All mean: keep asking until checklist complete and user confirms.**

## Commit Requirements

After generating or updating specs:

```
git add specs/<spec-id>/
git commit -m "docs: refine spec for <spec-id>"
```

## After This Skill

Hand off to `/arc-planning` — the planner reads `specs/<spec-id>/spec.xml` and the `<delta>` metadata to scope the planning sprint.

## Completion Format

✅ refiner complete
- spec-id: `<spec-id>`
- mode: initial (v1) | iteration (v2+)
- spec_version: N
- iterations: N
- checklist: complete ✓
- output: `specs/<spec-id>/spec.xml` + N detail files (committed)
- ready for: `/arc-planning`

## Blocked Format

⚠️ refiner blocked
- spec-id: `<spec-id>`
- reason: [contradictions found | validation errors | design doc invalid]
- report: `docs/plans/<spec-id>/<date>/refiner-report.md`
- issues listed: N (with requirement IDs, issue types, remediation)
- action: address issues in design doc then re-run refiner

### Refiner Report Structure (`docs/plans/<spec-id>/<date>/refiner-report.md`)

```markdown
# Refiner Report — <spec-id> — <date>

## Block Reason
[Why the refiner blocked]

## Issues

### Issue 1 — [Type: contradiction | missing-ac | broken-dependency | validation-error]
- **Requirement(s):** REQ-X, REQ-Y
- **Expected:** [what the schema/contract requires]
- **Found:** [what was actually in the design doc]
- **Recommendation:** [specific, actionable fix]

## Recommendations Summary
[Overall guidance for resolving all issues]
```
