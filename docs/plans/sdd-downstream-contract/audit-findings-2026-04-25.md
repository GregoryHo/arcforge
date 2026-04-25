# sdd-downstream-contract — Pending Audit Findings (2026-04-25)

**Spec target**: `specs/sdd-downstream-contract/` (v1, committed at `75bf0dc`)
**Status**: pending — will be addressed in a future v2 iteration via `/arc-brainstorming sdd-downstream-contract`
**Source**: `arc-auditing-spec` runs on 2026-04-25 (morning real-spec audit + Tier 3 stability re-run)
**Eval workspace**: `skills/arc-auditing-spec-workspace/iteration-1/` (gitignored — full audit JSONs persisted there)

This file is a non-design-doc tracking artifact. It does NOT itself conform
to the `arc-brainstorming` design schema and MUST NOT be passed into refine
as a Change Intent doc directly. When ready to fix, run
`/arc-brainstorming sdd-downstream-contract`, summarize these findings as
Change Intent in the new design doc, and let refine derive the `<delta>`.

---

## Summary

| # | Finding | Severity | Caught by | Fix layer |
|---|---|---|---|---|
| 1 | `worktree=null` in same save — spec mandates, design silent | MED | both runs | `design.md` R1.1 |
| 2 | R1.3 `dag.yaml` drift — design tolerates, detail forbids (post-Q1=c gap) | MED | Tier 3 only | `design.md` R1.3 |
| 3 | `fr-cf-003` description vs `ac3` contradiction on `--if-last` guard order | MED | both runs | `details/cli-finish.xml` fr-cf-003 + fr-cf-004 |
| 4 | `coordinator-commits.xml` `<consumes>` omits `scripts/cli.js` | LOW | morning only | `details/coordinator-commits.xml` |

Stability note: 3 of 4 findings are MED (high-confidence catches). The
LOW (#4) was only emitted on the morning run; eval suggests LOW findings
are sample-not-census across runs, so #4 may or may not reappear if
re-audited. Treat as real until proven false-positive.

---

## Finding 1 — `worktree=null` mutation absent from design

**Where**:
- Spec: `specs/sdd-downstream-contract/details/coordinator-commits.xml` `fr-cc-001-ac1`
  > "the in-memory dag mutation MUST set both `epic.status = COMPLETED` and `epic.worktree = null` in the same save operation."
- Design: `docs/plans/sdd-downstream-contract/2026-04-24/design.md` R1.1
  > only mentions `git add specs/<id>/dag.yaml`; says nothing about the `worktree=null` half of the mutation.

**Why it matters**: The Q1=c brainstorming decision (worktree=null co-mutation) made it into spec but never got back-propagated to design. Implementer reading design alone will miss the requirement; re-readers cross-checking spec against design will be confused about authority.

**Suggested fix**: Add one sentence to design.md R1.1:
> "The save MUST cover both `status=completed` and `worktree=null` (matching `fr-cc-001-ac1`)."

---

## Finding 2 — R1.3 `dag.yaml` drift: design vs detail directly contradict

**Where**:
- Design: `docs/plans/sdd-downstream-contract/2026-04-24/design.md` R1.3
  > "working tree 除 `specs/<id>/dag.yaml` drift 外乾淨" — explicitly tolerates dag.yaml drift in finish guard.
- Spec: `specs/sdd-downstream-contract/details/cli-finish.xml` `fr-cf-001-ac4`
  > "the working tree has any uncommitted modification (**including** to specs/<spec-id>/dag.yaml) ... MUST exit non-zero" — explicitly forbids any drift, dag.yaml included.
- The detail's `<trace>` says "tightened per Q1=c" — refine intentionally tightened the guard during the Q1=c discussion, but design was not updated.

**Why it matters**: A direct contradiction. Two implementers reading the same spec family will reach opposite conclusions on whether dag.yaml drift is tolerable at finish time. Tier 3 audit caught this; morning audit missed it — confirming "rerun for completeness" pattern.

**Suggested fix**: Tighten design.md R1.3 to match the detail. Replace the carve-out wording with:
> "working tree 完全乾淨（包含 `specs/<id>/dag.yaml`）— Q1=c 決議後 coordinator 應已自動 commit dag.yaml，drift 不應存在。"

---

## Finding 3 — `fr-cf-003` description vs `ac3` contradiction on `--if-last`

**Where**: `specs/sdd-downstream-contract/details/cli-finish.xml`
- `fr-cf-003` description (lines ~123-131):
  > "MUST first consult allEpicsCompleted(dag). If the predicate returns false ... MUST NOT perform any guard check or mutation."
- `fr-cf-003-ac1`: "NO guard failure messages MUST appear (the guards are not evaluated in this path)."
- `fr-cf-003-ac3`: "subsequent invocations MUST fail cleanly at the dag.yaml-missing guard (fr-cf-001-ac1)."

After the first finish runs, `dag.yaml` is `git rm`-ed. So either:
- (a) `fr-cf-001-ac1` IS evaluated on the `--if-last` path (contradicting "no guard check"), or
- (b) the command silently no-ops on missing dag (contradicting `ac3` which demands a guard failure).

**Why it matters**: Sibling AC clauses produce contradictory unit tests. TDD cycle collapses — implementer cannot satisfy both. `fr-sh-001-ac3` (skill-level idempotence) depends on well-defined `--if-last` behavior, so the ambiguity propagates upward.

**Suggested fix — IMPORTANT, do not blindly trust audit's Recommended option**:

The audit emitted three resolution options and marked option (a) as `(Recommended)`. **Eval evidence shows audit's resolution ranking is unreliable (~50% accuracy). Read all three before picking.**

| Option | Description | Assessment |
|---|---|---|
| (a) "Recommended" by audit — sequence dag-existence guard before predicate | Make `fr-cf-001-ac1` fire first; predicate runs only if dag exists | Works, but BREAKS the "skill calls finish unconditionally" idempotence promise — skills now have to know "if I've called finish before in this sprint, the next call will fail loudly" |
| (b) Relax `ac3` to silent no-op | Subsequent post-completion `--if-last` calls exit 0 silently | Preserves "no guard check" but loses error surfacing for genuine missing-dag issues |
| (c) **Best — extend `allEpicsCompleted` contract** | Define `allEpicsCompleted(null) === false` so missing dag → predicate false → silent exit 0 | Skill caller stays no-brain unconditional. Missing-dag at finish-time is semantically "sprint already done = not last epic = no-op". `--if-last` keeps its "no guard check" promise. fr-cf-003-ac3 needs to be rewritten to match this — drop the "MUST fail cleanly at dag.yaml-missing guard" claim. |

**Recommendation: pick (c).** It's the only option that keeps the skill-caller contract clean and gives `allEpicsCompleted` a single, complete definition. Implementation requires rewriting `fr-cf-004` to define the null/missing-dag case AND rewriting `fr-cf-003-ac3` to align (subsequent --if-last exits 0 silently, no guard failure).

---

## Finding 4 — `coordinator-commits.xml` `<consumes>` omits `scripts/cli.js`

**Where**: `specs/sdd-downstream-contract/details/coordinator-commits.xml`
- `<consumes>` lists only `scripts/lib/coordinator.js` and `scripts/lib/models.js`
- `<produces>` includes "Modified `scripts/cli.js` with `--epic` flag on the cleanup subcommand"
- `fr-cc-004` specifies CLI changes (--epic flag, help banner, mutual-exclusion parsing) — these all touch `scripts/cli.js`

**Why it matters**: Internal asymmetry. Tooling/reviewers reading `<consumes>` to compute "files this detail depends on" will miss `scripts/cli.js`. Implementers may conclude `cli.js` changes belong to `cli-finish.xml` (whose `<consumes>` does list cli.js), creating ownership confusion.

**Suggested fix**: Add to `<consumes>`:
> `<artifact>scripts/cli.js (cleanup subcommand parser — --epic flag wiring and help banner)</artifact>`

---

## Converting to v2 Change Intent

When ready to fix, the natural v2 sprint shape:

1. `/arc-brainstorming sdd-downstream-contract` — confirms iteration, loads v1 spec
2. Provide Change Intent that summarizes:
   - **Change 1**: Resolve design↔spec drift on `worktree=null` (Finding 1) and dag.yaml drift tolerance (Finding 2) — both are design-side updates.
   - **Change 2**: Resolve `fr-cf-003` / `fr-cf-004` `--if-last` ambiguity by extending `allEpicsCompleted` contract per Finding 3 option (c).
   - **Change 3**: Add `scripts/cli.js` to `coordinator-commits.xml` `<consumes>` (Finding 4).
3. `/arc-refining` derives the structured `<delta version="2">` with `<modified>` refs for fr-cc-001, fr-cf-003, fr-cf-004 and `<modified>` ref for coordinator-commits's `<consumes>` (or whatever the refiner judges appropriate).
4. `/arc-planning` regenerates `dag.yaml` + `epics/` for the v2 sprint.
5. Implement → merge → finish.

Do NOT pre-author the delta in the design doc — refiner derives it (per `arc-brainstorming` Iron Law).

---

## Cross-References

- Spec v1 commit: `75bf0dc`
- v1 design doc: `docs/plans/sdd-downstream-contract/2026-04-24/design.md`
- Audit eval workspace (full findings JSONs, gitignored): `skills/arc-auditing-spec-workspace/iteration-1/eval-tier3-real-sdd-downstream-contract/with_skill/audit_outputs/`
- Eval benchmark report: `skills/arc-auditing-spec-workspace/iteration-1/benchmark-tier3.md`
