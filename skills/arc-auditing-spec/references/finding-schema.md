# Finding Schema — arc-auditing-spec

Single source of truth for the structured finding format emitted by all
three audit axis agents. Each agent body cites this file and follows it
exactly. Axis-specific severity cut-off criteria are NOT in this file —
they live in each agent's own body, because cut-offs are axis-specific
judgment calls.

---

## Finding Structure

Every finding returned by an axis agent MUST conform to the following
fields. Fields marked Required must always be present. Fields marked
Conditional are present when specified.

| Field | Type | Required? | Description |
|---|---|---|---|
| `id` | string | Required | Unique ID in format `A<axis>-<NNN>` |
| `severity` | enum | Required | One of: HIGH, MED, LOW, INFO |
| `title` | string | Required | One-line description of the issue |
| `affected_files` | list | Required | File paths (with line refs when known) |
| `observed` | string | Required | What evidence was found; concrete prose |
| `why_it_matters` | string | Required | "Why it matters" — why this issue is a problem |
| `resolutions` | list | Required | 1–4 suggested resolutions |
| `error_flag` | string | Conditional | Present only on partial-failure findings |

---

## ID Format

```
A<axis>-<NNN>
```

- `axis` ∈ {1, 2, 3}:
  - 1 = cross-artifact-alignment
  - 2 = internal-consistency
  - 3 = state-transition-integrity
- `NNN` = zero-padded three-digit counter, starting at 001 within each
  axis's output for a given audit run (e.g., A1-001, A1-002, A2-001)

Examples: `A1-001`, `A2-003`, `A3-001`

---

## Severity Enum

Severity MUST be one of: **{HIGH, MED, LOW, INFO}**

### INFO — Structurally Reserved

**INFO is RESERVED for informational notices only.** It is the severity
used by graceful-degradation branches (e.g., "spec.xml not present" or
"DAG not yet planned"). It MUST NOT be used as a downgrade bucket for
real issues that are merely LOW confidence or edge-case HIGH/MED/LOW
findings. If a finding is a real issue, assign HIGH, MED, or LOW based
on the axis-specific cut-off criteria in the agent body. Use INFO ONLY
for the specific graceful-degradation scenarios defined per fr-aa-004.

---

## Resolution Structure

Each resolution in the `resolutions` list has:

| Sub-field | Required? | Description |
|---|---|---|
| `label` | Required | 1–5-word label for this resolution |
| `description` | Required | What this resolution does |
| `preview` | Conditional | Diff string when the resolution modifies an editable artifact |

### Recommended Prefix Rule

- When the agent has a **clear preference**, the FIRST resolution MUST be
  prefixed: `"(Recommended)"` in the label or description.
- When there is **no clear preference**, the `"(Recommended)"` prefix
  MUST NOT appear on any resolution.
- Never mark all resolutions "(Recommended)".

### Preview Field

- MUST be present when the resolution corresponds to an editable-artifact
  change (e.g., renaming an epic in dag.yaml, updating a feature id in
  spec.xml).
- MAY be omitted for engine-fix-type resolutions (e.g., "file a bug
  against coordinator.js") where no diff is meaningful.

---

## Partial Failure Contract

When an agent encounters a token-limit error, malformed input, or tool
error mid-audit:

1. Return any findings already collected before the error.
2. Append a final finding with `severity: INFO` and an `error_flag` field
   describing the failure cause. Example:

```
id: A1-ERR
severity: INFO
title: "Audit axis 1 incomplete — tool error"
error_flag: "Glob returned unexpected error at details/*.xml; findings before this point are complete"
```

The main session (`SKILL.md` Phase 1) MUST continue rendering Phases 2–5
using findings from axes that succeeded. One axis's `error_flag` does NOT
halt the audit. The `error_flag` is surfaced in the Phase 2 Summary table
as a warning row.

---

## Full Example Finding

```
id: A1-001
severity: HIGH
title: "dag.yaml epic id 'foo-bar' not referenced in design.md"
affected_files:
  - specs/my-spec/dag.yaml:14
  - docs/plans/my-spec/2026-04-22/design.md
observed: |
  dag.yaml line 14 defines epic id 'foo-bar'. design.md references only
  'foo-baz' throughout the Fan-out and Scope sections. No alias or rename
  note bridges the two.
why_it_matters: |
  arc-planning reads dag.yaml epic ids to wire up worktree paths. If the
  design doc and dag use different ids, a coordinator run will produce a
  worktree under the wrong name, silently diverging from the design.
resolutions:
  - label: "(Recommended) Rename dag epic"
    description: "Rename epic id in dag.yaml from 'foo-bar' to 'foo-baz' to match design.md"
    preview: |
      --- a/specs/my-spec/dag.yaml
      +++ b/specs/my-spec/dag.yaml
      @@ -13,7 +13,7 @@
      -  id: foo-bar
      +  id: foo-baz
  - label: "Rename design reference"
    description: "Rename all 'foo-baz' references in design.md to 'foo-bar'"
    preview: |
      --- a/docs/plans/my-spec/2026-04-22/design.md
      +++ b/docs/plans/my-spec/2026-04-22/design.md
      @@ -20,4 +20,4 @@
      -foo-baz
      +foo-bar
```
