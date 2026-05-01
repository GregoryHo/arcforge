# arc-auditing-spec — v2 Design Doc (iteration 2)

Date: 2026-04-24
Spec-id: arc-auditing-spec
Iteration: 2026-04-24-iterate2
Author: Gregory Ho

## Context

v1 of `arc-auditing-spec` shipped on `feature/sdd-enhance` on 2026-04-22:
a read-only, advisory-only audit skill that fans out three parallel
sub-agents (`cross-artifact-alignment`, `internal-consistency`,
`state-transition-integrity`) over an arcforge SDD spec family
(design.md, spec.xml + details/*.xml, dag.yaml), presents findings
through a U3 two-stage AskUserQuestion UX (Phase 3 triage over HIGH
findings, Phase 4 per-finding resolution with diff previews), and
surrenders final decisions to the main session. The v1 artefacts are
all committed on `feature/sdd-enhance`:

- design: `docs/plans/arc-auditing-spec/2026-04-22/design.md`
- spec: `specs/arc-auditing-spec/spec.xml` plus three detail files
  (`skill-contract`, `audit-agents`, `output-and-interaction`)
- dag.yaml: three epics, twelve features; all features `status=pending`
  per the revert-after-merge convention described in
  `docs/research/sdd-v2-downstream-contract-gap.md` §6.5 — completion
  truth lives in the `feat: integrate <epic> epic` commits in git log,
  not in dag.yaml state
- shipped runtime: `skills/arc-auditing-spec/SKILL.md`,
  `skills/arc-auditing-spec/references/`, `skills/arc-auditing-spec/evals/`,
  `agents/arc-auditing-spec-*.md`, `commands/arc-auditing-spec.md`
- CI: 980 Jest + 387 pytest + 6 hooks + 6 Node tests all green

On 2026-04-24 the skill was dog-fooded against itself
(`/arc-auditing-spec arc-auditing-spec`). The session surfaced two
genuine defects that v1's contract does not handle. The A1
(cross-artifact-alignment) agent returned zero findings — the spec
family is well aligned. The A3 (state-transition-integrity) agent also
returned zero findings: under the revert-after-merge convention, all
features showing `status=pending` with no worktrees on disk and no
`.arcforge-epic` markers is a coherent state, and A3's spec-refined
scope is files-only (no git log inspection), so the §6.5 "false
positive" predicted by the gap report did not fire — A3 correctly
judged the state as consistent. The two real defects came from A2
(internal-consistency) and from behaviour missing at the skill-body
layer itself:

**Defect 1 — Phase 3/4 ceremony gap (new behaviour, not captured by any
v1 requirement).** The AskUserQuestion tool enforces `options.minItems:
2`. v1's Phase 3 always constructs a `multiSelect:true` call over HIGH
findings; Phase 4 always asks per-finding questions over the reviewer's
resolutions. Neither phase's v1 prose addresses what happens when:

- Phase 3 faces `N_HIGH < 2` (can't form a legal multiSelect call —
  one HIGH is a minItems violation, zero HIGH has no content at all)
- Phase 4 faces a finding whose reviewer-provided resolutions count
  is `< 2`

The dog-food run hit `N_HIGH == 0` (the one finding was MED). v1's
SKILL.md has no documented exit path for that branch, so the skill was
at risk of either constructing an invalid AskUserQuestion call or
silently doing nothing at the stage where the user expects the next
move. This is a new behavioural requirement, not a modification of an
existing one — v1 simply did not contemplate the below-minimum-ceremony
branches.

**Defect 2 — design.md internal contradiction (A2-001, severity MED).**
v1's design doc contains two statements about the Phase 2 output
format that disagree:

- `docs/plans/arc-auditing-spec/2026-04-22/design.md:32` (Architecture
  section summarising Phase 2) says "Observed、Why it matters、Suggested
  Resolutions 全部用 markdown table 排版" — all three subsections are
  tables.
- Same doc line 54 (Requirements section describing output format) says
  "Observed 與 Suggested Resolutions 用 markdown table;Prose 僅保留給
  why it matters" — Why-it-matters is prose; only two subsections are
  tables.

The implementation (`references/report-templates.md`, eval scenarios,
and SKILL.md Phase 2 prose) correctly follows line 54. The refined
`spec.xml` also follows line 54. Line 32 is the outdated text that
never got updated when the Phase 2 format was decided. This is a
design-artifact correction with no implementation consequence, but it
must be recorded so the v2 design doc does not inherit the wrong
summary when future iterations read back the design history.

## Change Intent

### Change 1 — Ceremony threshold as a cross-cutting principle

Introduce a new cross-cutting principle to the skill's operating
contract: **AskUserQuestion-driven ceremony (Phase 3 triage + Phase 4
resolution) fires only when it adds value that the Phase 2 report does
not already carry on its own**. This is a generalisation of the same
graceful-degradation stance v1 already took for missing `spec.xml` /
`dag.yaml` inputs (A1 and A3 downgrade to INFO findings rather than
crashing). Here the principle applies to *output volume* rather than
*input availability*: when there aren't enough HIGH findings to batch,
or not enough resolutions to choose between, the Phase 2 Detail blocks
(which already carry the full LLM advisory — Observed table, Why it
matters prose, Suggested Resolutions table, and any diff previews) are
themselves the deliverable, and the interactive ceremony is skipped.

Concretely this translates into two new conditional behaviours that
v1 does not contemplate:

**Phase 3 only fires when `N_HIGH >= 2`.** For `N_HIGH == 0`, the skill
prints the Phase 2 report (which still surfaces every MED / LOW / INFO
finding in the Overview and Detail sections), prints a concluding
recommendation line, and exits. No Phase 3 call, no Phase 4, no Phase 5
Decisions table — because there is no decision-gathering work to do.
For `N_HIGH == 1`, the skill likewise skips Phase 3's multiSelect call
(which would violate `minItems: 2`), but the lone HIGH must still be
**visually emphasised** inside the Phase 2 Findings Overview row (e.g.,
bold Title + a `⚠️` prefix, or a leading `HIGH →` marker) so the user's
eye catches it without the triage step. The skill then either (a)
proceeds directly to a single Phase 4 question for that one HIGH
finding if its resolutions count is sufficient, or (b) follows the
Change-1 rule below and skips Phase 4 as well. The exact single-HIGH
flow — whether Phase 3 is simply bypassed with direct entry to Phase 4,
or whether both are bypassed with the Phase 2 Detail serving as the
deliverable — is a design decision the refiner needs to pin down when
it rewrites the affected requirements.

**Phase 4 per-finding question only fires when that finding has `>= 2`
suggested resolutions.** A finding with zero or one resolution cannot
form a legal AskUserQuestion options list (minItems: 2), and even if
the schema allowed it, asking the user to pick among a single option is
pure ceremony. For such findings the Phase 2 Detail block's
Suggested Resolutions table *is* the deliverable — the user reads it
and decides what to do in the main session, the same way they would
for a MED / LOW / INFO finding they chose not to pull into triage. A
finding skipped this way must still appear in the final Phase 5
Decisions table (when Phase 5 runs at all) with its `Chosen Resolution`
cell recorded as `(no ceremony — see Detail)` or equivalent, so the
decisions record stays complete.

These changes primarily affect the four `fr-oi-*` requirements in
`details/output-and-interaction.xml`:

- **fr-oi-001 (Phase 2 report)** gains a new acceptance criterion
  covering the visual emphasis treatment of a single HIGH finding in
  the Overview row. Phase 2's structure is otherwise unchanged — all
  tables, all prose, all severity levels still appear.
- **fr-oi-002 (Triage UX)** is the biggest surface: it grows a
  conditional-firing precondition (`N_HIGH >= 2`) and documents the
  two below-threshold branches (`== 0` exits cleanly after Phase 2,
  `== 1` either skips to direct Phase 4 or short-circuits per the
  refiner's decision).
- **fr-oi-003 (Resolution UX)** grows a parallel conditional-firing
  precondition at the per-finding layer: skip the question for any
  finding with fewer than two resolutions, and rely on the Phase 2
  Detail block as the deliverable.
- **fr-oi-004 (Decisions table)** gains a conditional existence rule:
  the Decisions table is printed only when Phase 3 or Phase 4 actually
  ran; when both were skipped (the `N_HIGH == 0` path), there are no
  decisions to record and the skill ends after the Phase 2 report +
  concluding recommendation line. When some findings are auto-skipped
  at Phase 4 but others ran the full ceremony, the skipped ones still
  appear in the Decisions table with a sentinel `Chosen Resolution`
  value so the record remains complete.

The refiner derives from this narrative which requirement IDs actually
change, which acceptance criteria are added vs. modified vs. removed,
and records the result in the v2 `<delta version="2">` block. No
pre-authored diff list belongs in this design doc.

### Change 2 — Correct the v1 design doc's internal contradiction

v1's design doc line 32 (the Phase 2 summary in the Architecture
section) must be brought into line with line 54 (the Requirements
section's normative statement on output format), which the implementation
already honours:

- OLD: "Observed、Why it matters、Suggested Resolutions 全部用 markdown
  table 排版"
- NEW: "Observed 與 Suggested Resolutions 用 markdown table;Why it
  matters 保留為 prose"

This correction goes into this new v2 iteration design doc as a
documented fact of the v1-era error, not as an overwrite of the v1
design.md (which stays frozen as the history of what was actually
refined at the time). No downstream spec.xml or SKILL.md change is
needed — they already match line 54. The purpose of recording this
change here is so the refiner, when it reads the design evolution
history on future iterations, sees the corrected statement rather than
inheriting the stale one.

## Architecture Impact

Change 1 lands inside the skill body (`skills/arc-auditing-spec/SKILL.md`
Phase 3 and Phase 4 prose) and in the report templates
(`references/report-templates.md` needs the single-HIGH visual emphasis
treatment). None of the three sub-agents change: they still produce
the same finding schema with the same severity levels; the ceremony
threshold is a main-session concern, not an agent concern. The hard
read-only tool grants on all three agents stay as they were — Change 1
does not touch the agent contracts at all.

Change 1 is coherent with v1's existing graceful-degradation precedent
(the INFO-finding pattern for missing inputs). Both address the same
architectural question — "what does the skill do when it has less
than it expected?" — with the same answer: downgrade gracefully, keep
the Phase 2 report as the always-present deliverable, don't force
ceremony that adds no value. This alignment is the principled
justification for not introducing the ceremony-threshold rule as a
one-off exception; it's the general form of a pattern the skill
already uses at the input layer, now extended to the output layer.

New eval scenarios need to cover:

1. `N_HIGH == 0` exit path — skill prints Phase 2 and the concluding
   recommendation line, does not call AskUserQuestion, does not print
   a Decisions table.
2. `N_HIGH == 1` visual emphasis — Phase 2 Overview row for the lone
   HIGH carries the agreed emphasis marker; Phase 3 multiSelect call
   does not fire.
3. Single-resolution finding at Phase 4 — the question is skipped,
   the Phase 2 Detail block's Suggested Resolutions table is relied
   on as the deliverable, and (when Phase 5 runs) the finding appears
   in the Decisions table with the sentinel value.

These scenarios should be added to
`skills/arc-auditing-spec/evals/scenarios/` using the same scenario
structure as the existing audit scenarios — the scenario harness does
not change.

No changes to `scripts/lib/coordinator.js`, to any other SDD pipeline
skill, or to dag.yaml schema. The four upstream pipeline skills
(`arc-brainstorming` / `arc-refining` / `arc-planning` / `arc-using`)
and all their Iron Laws remain untouched, as with v1.

## Out of Scope

Two items from the 2026-04-24 dog-food session and the surrounding
gap-report research are explicitly deferred and must NOT be folded
into this iteration:

- **The §6.5 downstream-contract gap** (dag.yaml auto-commit on epic
  merge vs. the current revert-after-merge convention). This is a
  coordinator.js / SDD-pipeline engineering concern, tracked in
  `docs/research/sdd-v2-downstream-contract-gap.md`, and belongs in a
  separate spec (working title `sdd-downstream-contract` or similar).
  No patch to coordinator.js, no change to dag.yaml lifecycle, no
  introduction of auto-commit in this iteration.
- **Finding 2.5 — rename sweeps touching structured artifacts.** This
  is a cross-skill policy question about which skills may treat
  dag.yaml / spec.xml as free-text editable; it is already parked
  under the working name `arc-structured-artifact-policy` per v1's
  Out of Scope. Deferred again in v2.
