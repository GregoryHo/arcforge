---
name: arc-auditing-spec
description: Use when the user explicitly runs the slash command `/arc-auditing-spec <spec-id>` to produce a read-only advisory audit of an arcforge SDD spec family (design.md, spec.xml, dag.yaml). Only triggered by direct user invocation; never auto-invoked from any pipeline skill (arc-brainstorming, arc-refining, arc-planning).
---

# Skill: arc-auditing-spec

## Iron Law

**READ-ONLY ADVISORY. NEVER MUTATE.**

Skill body and all three sub-agents MUST NOT Edit, Write, rename, delete, or run any mutating git / filesystem operation. Phase 5 prints a Decisions table and exits. Main session (or a subsequent skill) owns any actual edits — not this skill, never.

No `--apply` flag, no "while I'm here let me fix this typo" shortcut, no Phase 6 that starts applying decisions. Diagnostic role only.

## When to Use

- User types `/arc-auditing-spec <spec-id>` wanting cross-artifact alignment, internal consistency, and state-transition integrity checked across the spec family
- The spec has reached a state where at least `design.md` exists (spec.xml and dag.yaml optional; graceful degradation per fr-aa-004)

## When NOT to Use

- Source code review, PR review → use `/review` or `pr-review-toolkit`
- You want this skill to *apply* resolutions — it won't; it's diagnostic only
- You want an automatic check at the end of `arc-refining` or `arc-planning` — those skills do not and must not auto-invoke this one (fr-sc-001-ac3); invocation is always user-initiated

## Invocation Contract

```
/arc-auditing-spec <spec-id> [--save]
```

- `<spec-id>` — directory name under `specs/`. Exact match only; no fuzzy resolution.
- `--save` — optional. When present, writes the full Phase 2 report + Phase 5 Decisions table to `~/.arcforge/reviews/<project-hash>/<spec-id>/<YYYY-MM-DD-HHMM>.md` (hash from `scripts/lib/worktree-paths.js`). When absent, no file is written anywhere.

### Phase 0 — Precondition Check (MANDATORY)

Before Phase 1 fan-out, verify `specs/<spec-id>/` exists as a directory.

**If it exists:** proceed to Phase 1. No file is written at this point.

**If it does NOT exist:** STOP. Print:

```
Error: specs/<spec-id>/ does not exist.

Available spec-ids:
  - <id-1>
  - <id-2>
  ...
```

Then exit non-zero. Write nothing. Spawn no sub-agent. This is the only valid response — see Red Flags for the specific failure modes this rule forbids.

## Phase Structure

| Phase | What | Contract |
|---|---|---|
| 0 | Precondition check above | fr-sc-001-ac1, fr-sc-001-ac2 |
| 1 | Parallel fan-out to three read-only sub-agents via Task tool | `agents/arc-auditing-spec-*.md`; fr-aa-001 |
| 2 | Print Summary + Findings Overview + per-finding Detail markdown | `specs/arc-auditing-spec/details/output-and-interaction.xml` fr-oi-001 |
| 3 | Triage UX — AskUserQuestion multi-select over HIGH findings | fr-oi-002 |
| 4 | Resolution UX — batched per-finding AskUserQuestion with diff previews | fr-oi-003 |
| 5 | Print Decisions markdown table; skill exits | fr-oi-004 |

### Phase 1 — Parallel Fan-Out to Three Audit Axes

**You MUST dispatch all three audit agents in a SINGLE message using three
parallel Task tool uses.** Do NOT dispatch them one at a time. Sequential
dispatch is the baseline failure mode this rule exists to prevent — a stock
agent defaults to serial execution; this skill forbids it.

Dispatch these three agents concurrently, in a single message:
- `arc-auditing-spec-cross-artifact-alignment`
- `arc-auditing-spec-internal-consistency`
- `arc-auditing-spec-state-transition-integrity`

#### Phase 1 Prompt Template

Assemble the following prompt for each agent's Task invocation. Substitute
the bracketed values with actual resolved paths or the literal absence marker
`(absent — file does not exist)`:

```
spec-id: <spec-id>

Artifact paths (use absolute paths):
  design.md:      <absolute-path-to-design.md OR "(absent — file does not exist)">
  spec.xml:       <absolute-path-to-spec.xml OR "(absent — file does not exist)">
  details/*.xml:  <absolute-path-to-details/ OR "(absent — directory does not exist)">
  dag.yaml:       <absolute-path-to-dag.yaml OR "(absent — file does not exist)">

You are the <axis-name> audit axis. Follow your agent body exactly.
Return your findings conforming to skills/arc-auditing-spec/references/finding-schema.md.
```

Resolve paths before dispatching:
- `design.md`: newest file matching `docs/plans/<spec-id>/*/design.md` (glob for
  the most recent iteration directory)
- `spec.xml`: `specs/<spec-id>/spec.xml`
- `details/*.xml`: `specs/<spec-id>/details/` directory
- `dag.yaml`: `specs/<spec-id>/dag.yaml`

If a file or directory does not exist, use the absence marker string verbatim.

#### Partial Failure Contract (fr-aa-004-ac3)

When an axis agent returns an `error_flag` in its findings, that axis has
failed mid-audit. The main session MUST:

1. Surface the `error_flag` in the Phase 2 Summary table (as a warning row
   for that axis).
2. Continue rendering Phases 2–5 using findings from the axes that succeeded.
3. NOT halt the audit because one axis encountered an error.

One axis's `error_flag` does NOT stop the other two axes' findings from being
shown and triaged.

See `skills/arc-auditing-spec/references/report-templates.md` for full worked
examples with exact column headers. The summary below is the decision logic;
the reference file is the layout authority.

**REQUIRED BACKGROUND:** `skills/arc-auditing-spec/references/report-templates.md`

### Phase 2 — Markdown Report

Print three sections in order. No omissions regardless of severity.

**Section A — Summary table** (`axis | HIGH | MED | LOW | INFO | Total`).
One row per axis plus a Totals row. If an axis returned `error_flag`, replace
its counts with `ERR` and note the error below the table.

**Section B — Findings Overview table** (`ID | Sev | Axis | Title | Primary file`).
Every finding from all three axes MUST appear — MED, LOW, and INFO findings
appear in this table exactly as HIGH findings do. No omissions.

**Section C — Per-finding Detail blocks**. One block per finding, same order
as the Overview. Each block contains:
- Observed evidence as a markdown table (`location | evidence`).
- "Why it matters" — the ONLY section that may remain free prose.
- Suggested resolutions as a markdown table (`Resolution | Description |
  Side-effect / Cost`). When a resolution has a `preview` diff from the
  agent, append the diff block under the table row.

MED, LOW, and INFO findings MUST have full Detail blocks rendered here —
even though they will not enter triage in Phase 3. All findings require
visibility; the Phase 3 multi-select is not the only visibility mechanism.

### Phase 3 — Triage UX

**Goal**: let the reviewer select which HIGH findings to address in this
session. MED, LOW, INFO MUST NOT appear as options — only reachable via
the Other free-text channel (F-01, pinned).

**Step 1 — Determine HIGH finding list.**
Collect all HIGH-severity findings across all three axes. Sort: A1 before
A2 before A3; within each axis sort by NNN ascending.

**Step 2 — Batched multi-select loop.**
Present up to 4 HIGH findings per AskUserQuestion call. When more than 4
HIGH findings exist, make sequential calls batching up to 4 each time until
every HIGH finding has been presented exactly once.

Example AskUserQuestion invocation (key-value block):

```
AskUserQuestion:
  header: "Triage"
  multiSelect: true
  question: "Select HIGH findings to resolve in this session (batch 1 of N):"
  options:
    - label: "A1-001 — <title>"
    - label: "A1-002 — <title>"
    - label: "A3-001 — <title>"
    - label: "A3-002 — <title>"
```

**Step 3 — Parse Other free-text.**
The AskUserQuestion tool appends an auto-generated Other field. After each
call, scan the Other string for the regex pattern `A[1-3]-\d{3}`. Add each
matched finding ID to the Stage 2 resolution queue alongside any HIGH IDs
the user checked. This is the ONLY channel through which MED, LOW, and INFO
findings enter the queue.

### Phase 4 — Resolution UX

**Goal**: for each finding in the resolution queue, ask the reviewer which
resolution to apply. One resolution per finding (`multiSelect: false`).

**Batched loop**: present up to 4 findings per AskUserQuestion call.
Sequential calls until all N selected findings are asked exactly once.

Example AskUserQuestion invocation:

```
AskUserQuestion:
  header: "A1-001"
  multiSelect: false
  question: |
    A1-001 — <title>
    Observed: <compact one-line summary from observed evidence>
  options:
    - label: "(Recommended) <resolution label>"
      description: "<what this resolution does>"
      preview: |
        <diff content here when resolution modifies an editable artifact>
    - label: "<alternate resolution>"
      description: "<what this resolution does>"
```

Rules:
- `header` = finding ID (format `A<n>-<NNN>` is 6 chars — no truncation
  needed).
- When the agent marked a Recommended resolution (per finding-schema.md
  Recommended prefix rule), the first option's `label` MUST start with
  `"(Recommended)"`.
- Options whose resolution corresponds to an editable-artifact change MUST
  include a `preview` diff. Engine-fix-type options (e.g., "file a bug
  against coordinator.js") MAY omit `preview`.
- Other free-text is a valid decision — accept it, do not throw or drop it.
  Record it verbatim in the Phase 5 Decisions table User Note column.

### Phase 5 — Decisions Table (TERMINAL)

Print the Decisions table, then exit. This is the final deliverable.

```
| Finding ID | Chosen Resolution | User Note |
|---|---|---|
| A1-001 | (Recommended) Rename dag epic | |
| A3-001 | File engine bug | Check if coordinator.js validates on worktree add |
```

- `Finding ID`: the `A<n>-<NNN>` id.
- `Chosen Resolution`: label of the option the user selected, or
  "(Other)" when answered via free-text.
- `User Note`: when the user answered via Other, store that free-text
  **verbatim** — no paraphrasing, no summarizing. Empty when no Other
  text was provided.

**Phase 5 is TERMINAL.** After printing the Decisions table, the skill exits.
The main session MUST NOT apply any resolution via Edit, Write, or any
mutating tool based on user decisions — that action is explicitly out of
scope for this skill. If you find yourself about to call Edit or Write, or
about to invoke `/arc-refining` to apply changes, STOP — see Red Flags.

### --save Flag

When `--save` is present: after Phase 5, write the full Phase 2 report +
Decisions table to:

```
~/.arcforge/reviews/<project-hash>/<spec-id>/<YYYY-MM-DD-HHMM>.md
```

Filename uses 24-hour time (e.g., `2026-04-24-1435.md`).

Obtain `<project-hash>` via subprocess — do NOT reimplement the hash inline:

```bash
node -e "const { hashRepoPath } = require('./scripts/lib/worktree-paths.js'); console.log(hashRepoPath(process.cwd()));"
```

Run from the project root. The 6-char hex string printed is the hash.

Without `--save`: zero files are written anywhere. No file is written at
any point unless the `--save` flag is explicitly present.

## Hard Boundaries

- Skill body and all sub-agents MUST NOT invoke Edit, Write, or any state-mutating Bash command. This is enforced **structurally** via the `tools:` allowlist in each agent's frontmatter (`agents/arc-auditing-spec-*.md`) — not via prose in system prompts. See fr-sc-002-ac3.
- No git commit, branch creation, worktree creation, or file deletion — under any phase, at any point.
- Phase 5 is terminal. The skill does NOT loop back to "apply" after the user picks resolutions. The Decisions table is the deliverable; downstream action is main session's responsibility and explicitly out of scope (fr-oi-004-ac3).
- `--save` is the ONLY permitted write, and only to `~/.arcforge/reviews/` under the arcforge home directory — never into `specs/`, `docs/`, or any project-tracked path.

## Red Flags — STOP

If you find yourself doing any of these, STOP immediately:

| Rationalization | Why it's wrong | Do instead |
|---|---|---|
| "The user's spec-id doesn't exist, but this other one is clearly what they meant — I'll audit that and note the substitution at the top" | `fr-sc-001-ac2` forbids substitution. This is a baseline failure mode observed in RED testing — the rationalization "don't ask clarifying questions" does NOT justify picking a different spec. | Print available ids, exit. Let the user re-invoke with the right id. |
| "The user said `<id>` and `specs/<id>/` is missing, but `docs/plans/<id>/` has a design.md — I'll audit in pure-design mode since the design clearly exists" | Phase 0 requires `specs/<id>/` **specifically**. `docs/plans/<id>/` is not a fallback path — not for pure-design audits, not for partial, not for anything. A design doc without a spec directory is a pre-refining state; the audit skill does not operate on it. | Print available ids, exit. If the user wanted a design-only review, that's `/arc-brainstorming` or manual review territory, not this skill. |
| "I spotted an obvious typo while reading — fixing it saves a round trip" | Read-only is absolute. Even typos are reported as findings, never patched. | Add a finding (LOW severity) to the axis agent's output; let main session decide. |
| "The user picked resolution (a) for finding A1-003 in Phase 4 — I should Edit the spec now" / "Phase 5 ended — I'll invoke `/arc-refining` to apply" / "The user selected `(Recommended)` — applying saves a round-trip" | Phase 5 is terminal (fr-oi-004-ac3). No mutation, no auto-chain, no Edit — even for an obvious Recommended choice. This skill's scope ends at the Decisions table. | Print Decisions table, exit. Main session owns all subsequent action. |
| "I'll have arc-refining/arc-planning call this skill at the end of their flow for free quality gating" | `fr-sc-001-ac3` forbids pipeline auto-invocation. The skill must remain user-triggered. | Do not add any invocation from any pipeline SKILL.md body. |
| "Let me add a `--apply` flag so this is one-step for users" | Makes the skill a mutator, defeating its diagnostic-only contract. | Don't. The contract is the contract. |
| "This MED finding is clearly important so I'll add it to the triage options anyway" | F-01 is pinned: MED/LOW/INFO MUST NOT appear in Phase 3 triage `options`. The Overview table and Detail block already ensure visibility. | MED/LOW/INFO are only reachable via the Other free-text channel. Do not add them to options. |
| "The user might miss the MED finding if it's not in the triage options" | Phase 2 overview table and detail block ensure every finding is visible regardless of severity. The triage `options` array is for HIGH findings only — that is the structural boundary. | Trust the overview table. Other free-text is the channel for user-initiated MED/LOW/INFO selection. |
| "The `--save` path is pinned to `~/.arcforge/reviews/` but a symlink into `docs/reviews/` or `specs/` would be more discoverable" | `--save` is the ONE carve-out, and only to `~/.arcforge/reviews/` specifically. Any other path violates the Iron Law. | Write only to `~/.arcforge/reviews/<project-hash>/<spec-id>/<YYYY-MM-DD-HHMM>.md`. |
| "I'll reimplement the project hash inline — it's just sha256 of cwd" | fr-oi-005-ac3: the hash MUST come from `scripts/lib/worktree-paths.js` so a single project has one hash across worktree paths and review paths. Reimplementing risks drift. | Use the subprocess one-liner shown in the --save section. |
| "Without `--save`, I'll save the report anyway — it's harmless and the user will appreciate it" | fr-oi-005-ac1: without `--save`, ZERO files are written. Default is read-only. | Do not write any file unless `--save` is explicitly present. |

## Implementation Delegation

Per fr-sc-003, this skill's phase content, the three sub-agent system prompts, and the eval scenarios validating audit correctness were produced through `arc-writing-skills`' TDD (RED → GREEN → REFACTOR) with recorded baseline-without-skill scenarios. Evals live under `skills/arc-auditing-spec/evals/` and exercise each of the three audit axes (fr-sc-003-ac2); the suite MUST pass before shipping.

## Cross-References

- Agents: `agents/arc-auditing-spec-cross-artifact-alignment.md`, `agents/arc-auditing-spec-internal-consistency.md`, `agents/arc-auditing-spec-state-transition-integrity.md`
- Spec: `specs/arc-auditing-spec/spec.xml` + `specs/arc-auditing-spec/details/{skill-contract,audit-agents,output-and-interaction}.xml`
- Design: `docs/plans/arc-auditing-spec/2026-04-22/design.md`
- Eval scenarios: `skills/arc-auditing-spec/evals/`
