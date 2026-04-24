# Report Templates — arc-auditing-spec

Worked examples for Phases 2–5 output. The main skill body (SKILL.md) cites
this file; these templates are the authoritative layout the main session MUST
follow exactly.

---

## Phase 2 — Summary Table

Print this table first. One row per axis plus a Totals row. If an axis
returned an `error_flag`, replace its counts with `ERR` and add a warning
note below the table.

```markdown
## Audit Summary

| Axis                         | HIGH | MED | LOW | INFO | Total |
|------------------------------|------|-----|-----|------|-------|
| cross-artifact-alignment     |    2 |   1 |   0 |    0 |     3 |
| internal-consistency         |    0 |   2 |   1 |    0 |     3 |
| state-transition-integrity   |    1 |   0 |   0 |    1 |     2 |
| **Totals**                   |  **3** | **3** | **1** | **1** | **8** |
```

---

## Phase 2 — Findings Overview Table

Print immediately after the Summary table. Every finding from all three
axes MUST appear — no omissions regardless of severity (HIGH, MED, LOW,
INFO all appear).

**Baseline rendering (N_HIGH == 0 or N_HIGH >= 2):** all rows render with
plain Title text — no emphasis prefix.

```markdown
## Findings Overview

| ID     | Sev  | Axis                       | Title                                       | Primary file             |
|--------|------|----------------------------|---------------------------------------------|--------------------------|
| A1-001 | HIGH | cross-artifact-alignment   | dag.yaml epic id 'foo-bar' not in design.md | specs/my-spec/dag.yaml   |
| A1-002 | HIGH | cross-artifact-alignment   | AC id mismatch between spec.xml and dag     | specs/my-spec/spec.xml   |
| A1-003 | MED  | cross-artifact-alignment   | Feature title drift across artifacts        | docs/plans/my-spec/...   |
| A2-001 | MED  | internal-consistency       | Dangling depends_on reference in dag.yaml   | specs/my-spec/dag.yaml   |
| A2-002 | MED  | internal-consistency       | Conflicting consumes/produces in spec.xml   | specs/my-spec/spec.xml   |
| A2-003 | LOW  | internal-consistency       | Epic description missing in dag.yaml        | specs/my-spec/dag.yaml   |
| A3-001 | HIGH | state-transition-integrity | Worktree dir present but epic status=pending| .arcforge-epic           |
| A3-002 | INFO | state-transition-integrity | DAG not yet planned — state integrity N/A   | (none)                   |
```

**Single-HIGH rendering (N_HIGH == 1):** when exactly one HIGH-severity
finding exists across the full finding set, its Title cell MUST start with
`⚠️` and the title text MUST be wrapped in markdown bold. Example:

```markdown
## Findings Overview

| ID     | Sev  | Axis                       | Title                                                         | Primary file             |
|--------|------|----------------------------|---------------------------------------------------------------|--------------------------|
| A2-001 | HIGH | internal-consistency       | ⚠️ **Design doc contradicts spec on Phase 2 output format**   | docs/plans/my-spec/...   |
| A2-002 | MED  | internal-consistency       | Dangling depends_on reference in dag.yaml                     | specs/my-spec/dag.yaml   |
| A3-001 | INFO | state-transition-integrity | DAG not yet planned — state integrity N/A                     | (none)                   |
```

The `⚠️` prefix and bold Title apply ONLY to the Overview row. The Detail
block header for that same finding renders WITHOUT the emphasis (plain
`### A2-001 — HIGH — Design doc contradicts spec on Phase 2 output format`).

---

## Phase 2 — Per-Finding Detail Block

Print one Detail block per finding, in the same order as the Overview table.

Structure:
1. **Heading**: `### <ID> — <Sev> — <Title>`
2. **Observed evidence**: markdown table with `location` and `evidence` columns
3. **Why it matters**: free prose paragraph (ONLY section that may be prose)
4. **Suggested resolutions**: markdown table with `Resolution` and `Description`
   columns; add a `Side-effect / Cost` column when applicable

```markdown
### A1-001 — HIGH — dag.yaml epic id 'foo-bar' not in design.md

**Observed evidence**

| Location                       | Evidence                                              |
|--------------------------------|-------------------------------------------------------|
| specs/my-spec/dag.yaml:14      | Epic id defined as `foo-bar`                          |
| docs/plans/my-spec/.../design.md | All references use `foo-baz`; no alias note present |

**Why it matters**

arc-planning reads dag.yaml epic ids to wire up worktree paths. If the
design doc and dag use different ids, a coordinator run will produce a
worktree under the wrong name, silently diverging from the design intent.

**Suggested resolutions**

| Resolution                          | Description                                              | Side-effect / Cost                       |
|-------------------------------------|----------------------------------------------------------|------------------------------------------|
| (Recommended) Rename dag epic       | Rename epic id in dag.yaml from `foo-bar` to `foo-baz`  | Existing worktrees must be re-created    |
| Rename design references            | Replace `foo-baz` with `foo-bar` throughout design.md    | All design prose and diagrams need sweep |
```

When a resolution has a `preview` diff from the agent, append it under the
resolution row as a fenced diff block.

---

## Concluding Recommendation Line (N_HIGH == 0 path)

When N_HIGH == 0, print this line after the Phase 2 Detail blocks. The skill
then exits cleanly — no Phase 3, no Phase 4, no Phase 5 Decisions table.

```markdown
_No HIGH findings to triage. See the Phase 2 Detail blocks above for any MED/LOW/INFO follow-up. Skill exiting._
```

This line MUST:
- Reference the Phase 2 Detail blocks explicitly so the user knows where to
  find any MED, LOW, or INFO follow-up.
- Make clear that the skill is done (exiting / no further interaction).
- NOT promise any further interaction or Phase 5 output.

The exact wording may vary; the above is a canonical example. The Phase 2
Detail blocks are the complete deliverable for the N_HIGH == 0 path.

---

## Phase 3 — Triage AskUserQuestion Template

```
AskUserQuestion:
  header: "Triage"
  multiSelect: true
  question: "Select HIGH findings to resolve in this session (batch 1 of N):"
  options:
    - label: "A1-001 — dag.yaml epic id 'foo-bar' not in design.md"
    - label: "A1-002 — AC id mismatch between spec.xml and dag"
    - label: "A3-001 — Worktree dir present but epic status=pending"
    - label: "A2-001 — (additional HIGH if available)"
```

- Ordering: earliest HIGH by axis (A1 before A2 before A3), then by NNN
  within axis.
- Max 4 options per call. If more than 4 HIGH findings exist, use sequential
  calls batching up to 4 each time until all HIGH findings are presented
  exactly once.
- MED, LOW, INFO MUST NOT appear as options. Only reachable via the
  auto-appended Other free-text field.

**Parsing Other free-text**: after each AskUserQuestion call, scan the Other
string for the pattern `A[1-3]-\d{3}`. Add each matched ID to the Stage 2
resolution queue, alongside the HIGH IDs the user checked.

---

## Phase 4 — Resolution AskUserQuestion Template

```
AskUserQuestion:
  header: "A1-001"
  multiSelect: false
  question: |
    A1-001 — dag.yaml epic id 'foo-bar' not in design.md
    Observed: dag.yaml:14 defines 'foo-bar'; design.md uses 'foo-baz' throughout.
  options:
    - label: "(Recommended) Rename dag epic"
      description: "Rename epic id in dag.yaml from 'foo-bar' to 'foo-baz'"
      preview: |
        --- a/specs/my-spec/dag.yaml
        +++ b/specs/my-spec/dag.yaml
        @@ -13,7 +13,7 @@
        -  id: foo-bar
        +  id: foo-baz
    - label: "Rename design references"
      description: "Replace 'foo-baz' with 'foo-bar' throughout design.md"
      preview: |
        --- a/docs/plans/my-spec/2026-04-22/design.md
        +++ b/docs/plans/my-spec/2026-04-22/design.md
        @@ -20,4 +20,4 @@
        -foo-baz
        +foo-bar
    - label: "File engine bug"
      description: "Open issue against coordinator.js to validate epic id alignment"
```

Notes:
- `header` = finding ID (6 chars: `A<n>-<NNN>`). Never truncated.
- `multiSelect: false` — one resolution per finding.
- `(Recommended)` prefix on first option label when agent flagged a preferred
  resolution; absent otherwise.
- Options with editable-artifact changes MUST include `preview` diff.
  Engine-fix options (no file diff) MAY omit `preview`.
- Other free-text is a valid answer — accept it, do not throw or drop it.
  Record verbatim in the Decisions table User Note column.
- Batch at most 4 findings per AskUserQuestion call; loop sequentially
  until all N selected findings are asked exactly once.

---

## Phase 5 — Decisions Table

**Rendering condition (fr-oi-004-ac1/ac4):** The Decisions table is rendered
only when Phase 3 or Phase 4 actually fired during the invocation (i.e.,
`ceremony_fired` flag is `true`). When both Phase 3 and Phase 4 were skipped
because N_HIGH == 0 (per fr-oi-002-ac5), the Decisions table is NOT printed
and Phase 5 produces no output. The concluding recommendation line from the
Phase 3 threshold check is the skill's terminal output on that path. Do NOT
print a stub "No decisions" row or any placeholder.

```markdown
## Decisions

| Finding ID | Chosen Resolution             | User Note                                         |
|------------|-------------------------------|---------------------------------------------------|
| A1-001     | (Recommended) Rename dag epic |                                                   |
| A1-002     | Rename design references      |                                                   |
| A3-001     | File engine bug               | Check if coordinator.js validates on worktree add |
```

- `User Note` is empty when user chose a listed option with no Other text.
- `User Note` contains the Other free-text verbatim when user answered via
  the Other channel. No paraphrasing.
- This table is the final output. Skill exits after printing it.
- Phase 5 is TERMINAL. Do NOT apply any resolution via Edit, Write, or any
  other mutating tool. Main session owns all subsequent action.

**Phase 4 auto-skip row format (fr-oi-003-ac6):** When a Stage-2 finding
had fewer than 2 suggested resolutions and was auto-skipped at Phase 4,
its Decisions table row MUST use the sentinel string
`(no ceremony — see Detail)` in the Chosen Resolution column and leave
User Note empty:

```markdown
| Finding ID | Chosen Resolution             | User Note |
|------------|-------------------------------|-----------|
| A2-003     | (no ceremony — see Detail)    |           |
```

The sentinel string is exactly `(no ceremony — see Detail)` — em-dash
(`—`), not a hyphen (`-`). Exact punctuation matters.

