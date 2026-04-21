# SDD v2 Downstream Contract Gap — Investigation Report

Date: 2026-04-20
Source session: implementation of `arc-evaluating-v2` spec (8 epics, 28 features)
Investigator: Claude (Opus 4.7)

## What This Report Answers

During a full end-to-end run of the SDD v2 pipeline (brainstorming → refining → planning → downstream execution), several integration defects surfaced that no single-skill eval or integration test catches. The user asked two questions:

1. Do integration tests cover the full brainstorming → refining → planning → downstream chain?
2. Does eval infrastructure measure downstream-consumption quality of upstream artifacts?

This report consolidates evidence. It does **not** prescribe fixes — the user intends to decide direction separately.

---

## Finding 1 — SDD v2 Spec Does Not Cover Downstream Consumers

The SDD v2 meta-spec lives at `specs/spec-driven-refine/`. Its scope is **explicitly** limited to stages 1–3 (brainstorming, refiner, planner).

**Evidence:**

- `specs/spec-driven-refine/spec.xml:32`
  ```xml
  <reason>Downstream migration (Phase 2) — coordinator.js per-spec DAG support,
  CLI --spec parameter, loop.js multi-spec parallelism, skill path updates,
  worktree marker spec_id</reason>
  ```
  This is inside the `<scope><excludes>` block. Phase 2 is deferred.

- `specs/spec-driven-refine/details/planner.xml:68-74` (acceptance criterion `fr-pl-001-ac6`):
  > Planner MUST NOT implement any completion gate, archive mechanism, or
  > state-preservation logic. These responsibilities belong upstream (refiner,
  > per fr-rf-012). Planner is a pure function with no state beyond its output paths.

- `docs/plans/spec-driven-refine/2026-04-16/design.md:193`:
  > If the prior sprint is not done, nothing downstream moves. Spec stays at
  > v(N), DAG stays at v(N)'s execution state, user completes the work,
  > refiner runs cleanly next time.

  The design describes a "downstream stays on v(N)" expectation but **never defines which component owns DAG state transitions during execution** (epic→completed, feature→completed, worktree→null).

**Consequence:**

The downstream consumers — `scripts/lib/coordinator.js` (CLI `expand`/`merge`/`cleanup`/`status`/`sync`), `skills/arc-implementing/`, `skills/arc-agent-driven/`, `skills/arc-coordinating/` — each have informal, unspecified behaviors around DAG writes. Where they agree, things work. Where they diverge, DAG state drifts.

---

## Finding 2 — Transcript Defects Observed

The `arc-evaluating-v2` implementation cycle surfaced concrete integration defects. Each defect is reproducible and traceable to a commit or code location.

### 2.1 Cross-Requirement Inconsistency in Generated Spec

- `specs/arc-evaluating-v2/details/folder-structure.xml` `fr-fs-001-ac1` requires:
  > skills/arc-evaluating/agents/eval-grader.md, eval-analyzer.md, and
  > eval-blind-comparator.md MUST exist after migration.

- `specs/arc-evaluating-v2/details/agent-lifecycle.xml` `<consumes>` lists:
  > skills/arc-evaluating/agents/eval-comparator.md (prior prompt template,
  > post-migration from fr-fs-001)

These two statements are contradictory — `eval-comparator.md` cannot simultaneously "not exist" (per fs-001) and "exist as input to agent-lifecycle" (per agent-lifecycle `<consumes>`).

**Detection**: none. `scripts/lib/sdd-utils.js` validates each XML file against a per-file schema but performs no cross-requirement consistency check.

**Resolution during implementation**: I interpreted the acceptance criteria as authoritative over the `<consumes>` prose, and the implementer chose to (a) physically rename `eval-comparator.md` → `eval-analyzer.md` at the new path, (b) create a minimal stub at `eval-blind-comparator.md`. This was a judgment call during implementation, not validated by any automated check.

### 2.2 Coordinator Merge Does Not Commit `dag.yaml`

- `scripts/lib/coordinator.js:426-493` (`_mergeEpicsInBase`): mutates `epic.status = TaskStatus.COMPLETED` in-memory for each merged epic.
- `scripts/lib/coordinator.js:945-973` (`_dagTransaction`): wraps the mutation, writes the mutated DAG to disk via `fs.writeFileSync(this.dagPath, content)` at line 967.
- **No `git add` or `git commit` call exists** on the merge path. `grep -n "git add\|git commit" scripts/lib/coordinator.js` returns zero matches.

**Consequence**: After each `arcforge merge <epic>`, the base repo's working tree has an uncommitted `specs/<spec-id>/dag.yaml` with updated epic statuses. The merge commit (`feat: integrate <epic> epic`) happens *before* the in-memory mutation is serialized, so the commit does not include the status update.

**Transcript trail:**
```
$ git log --oneline specs/arc-evaluating-v2/dag.yaml
c791e47 chore(dag): finalize skill-body feature statuses
5faac1c chore(dag): reconcile DAG state pre-skill-body
97e1b76 chore(dag): reconcile DAG state with completed epics
5802b64 refactor(agents): complete eval-comparator → eval-analyzer rename (fr-ag-001)
55f7e65 docs: plan epics and features for arc-evaluating-v2
```
Only 4 commits touched `dag.yaml` — 2 of them (`97e1b76`, `5faac1c`) are **manual reconciliation commits** I had to write after noticing the drift. None of the 8 `feat: integrate <epic> epic` merge commits modified `dag.yaml`.

### 2.3 Feature-Level Status Not Propagated from Worktree

Even when an epic is marked `status: completed` by `_mergeEpicsInBase`, its child features are **not touched**. At the final state before manual fix:

```
skill-body:
  status: completed
  features:
    - sb-001 … sb-008: all status: pending  (8 inconsistencies)
```

**Root cause**: implementer agents (dispatched into worktrees during the epic cycle) never reported back feature-level completion. Nothing in `scripts/lib/coordinator.js` or the downstream skills writes feature status when features finish.

**Fix**: commit `c791e47` (manual sed-and-edit on base to mark sb-001..sb-008 completed).

### 2.4 Worktree Cleanup Gate Breaks When DAG State Drifts

- `scripts/lib/coordinator.js:521-527`:
  ```js
  for (const epic of epics) {
    if (!epic.worktree) continue;
    const worktreePath = this._resolveWorktreePath(epic.worktree);
    fs.rmSync(worktreePath, { recursive: true, force: true });
    removed.push(worktreePath);
    epic.worktree = null;
  }
  ```

Cleanup iterates **only** epics whose `worktree != null`. The coordinator's own `_mergeEpicsInBase` does **not** null the worktree field; nothing in the merge path does. Cleanup therefore depends on the dag.yaml retaining the `worktree: <name>` pointer after merge.

**Transcript impact**: my manual reconciliation (commit `97e1b76`) nulled `worktree` fields when marking status=completed (I applied both changes together via `Edit`, assuming they covariate). Subsequent `arcforge cleanup` returned `{"removed": 0, "paths": []}` despite 8 stale worktrees on disk.

**Final cleanup**: had to run `fs.rmSync` + `git worktree prune` manually (via a scratch Node script, since the shell `rm` was hook-restricted) to remove the 8 directories.

### 2.5 Rename Sweep Touched Structured Artifacts

The `agent-lifecycle` epic's rename pass (`eval-comparator` → `eval-analyzer`) swept text references across the repo. The final diff included edits to:

- `specs/arc-evaluating-v2/spec.xml` (prose)
- `specs/arc-evaluating-v2/details/agent-lifecycle.xml` (prose)
- `specs/arc-evaluating-v2/details/folder-structure.xml` (prose)
- `specs/arc-evaluating-v2/details/skill-body.xml` (prose)
- `specs/arc-evaluating-v2/dag.yaml` (2-line edit per `git show --stat b456de8`)

None of these edits is wrong in isolation, but the policy question — *"should a rename skill ever mutate dag.yaml or spec.xml as free text?"* — is unanswered. `dag.yaml` is coordinator-owned; `spec.xml` is refiner-owned. Allowing arbitrary skills to edit them bypasses both ownerships.

### 2.6 Rename Pass Can Produce Logically-Impossible Prose

The same rename sweep noted in §2.5 produced text of the form
"Rename `eval-analyzer` to `eval-analyzer`" and "renamed from eval-analyzer"
in three locations:

- `specs/arc-evaluating-v2/details/folder-structure.xml:19`
- `docs/plans/arc-evaluating-v2/2026-04-19/design.md:23`
- `docs/plans/arc-evaluating-v2/2026-04-19/design.md:29`

These are the result of a global `s/eval-comparator/eval-analyzer/g` applied
to docs after the rename, erasing the source→target distinction. The
rendered prose is logically impossible (a rename cannot have identical
endpoints) yet validates structurally — `validateDesignDoc` and
`validateSpecHeader` both accept it.

**Detection**: none. A focused lint rule is straightforward: any sentence
matching `/[Rr]ename(d)?\s+(from\s+)?\W?(\w+)\W?\s+(to|→|from)\s+\W?\3\W?/`
indicates source equals target.

**Fix in this cycle**: commit `c2aaf61` (manual edits restoring the source
name in three places). No automated guardrail exists to prevent
recurrence.

### 2.7 Validator Locks Design Doc Once Spec Exists

After refiner produces `specs/<spec-id>/spec.xml`, the same `design.md`
that was authored in new-topic prose format becomes invalid under
`validateDesignDoc` — the validator detects spec presence and switches
to iteration-mode expectations (requires `## Context` and
`## Change Intent` headings), but the original prose has neither.

**Reproduction:**

1. `arc-brainstorming` produces a v1 design (prose: problem / solution /
   requirements / scope, no Context/Change Intent headings).
2. `arc-refining` consumes it and emits `spec.xml`.
3. User amends the design doc to correct factual errors discovered
   during refining (e.g., `arc-evaluating-v2` had agent-mechanism
   misconceptions about `subagent_type` registration).
4. `validateDesignDoc` now returns 2 ERRORs:
   - "Iteration design doc missing required Context section"
   - "Iteration design doc missing required Change Intent section"

The amendment is semantically correct — implementation has not begun,
the spec was just refined from this same doc — but the validator
cannot distinguish "pre-implementation amendment" from "iteration on a
completed sprint". The user accepted the noise (commit `849fdfe`
landed despite ERROR), but the workflow is hostile to a legitimate
"oops, design had a fact wrong" pattern.

**Open question**: is the design doc immutable after refining? If yes,
amendment must take a new YYYY-MM-DD folder and trigger refiner re-run.
If no, the validator must distinguish pre-implementation amendment
(acceptable) from post-implementation iteration (must use iteration
format). Either way, the current behavior is a trap with no documented
escape route.

---

## Finding 3 — Integration Test Coverage Audit

### 3.1 What `tests/integration/sdd-v2-pipeline/` Covers

- 5 end-to-end tests, one per downstream skill: `arc-implementing`, `arc-agent-driven`, `arc-dispatching-parallel`, `arc-dispatching-teammates`, `arc-looping`.
- Each test spawns a real `claude -p` session against a pre-built fixture.
- Fixture is at `tests/integration/sdd-v2-pipeline/fixture/` — one spec (`demo-spec`), three epics in a diamond DAG.

### 3.2 What It Does Not Cover

- `tests/integration/sdd-v2-pipeline/README.md:30`:
  > Never re-runs arc-brainstorming (design.md is human-managed).

- Same file, line 83:
  > design.md — upstream design decisions are human-managed; downstream …

- `regenerate-fixture.sh` deliberately regenerates only `spec.xml` + `details/` + `dag.yaml` + `epics/` via refining + planning. The `design.md` seed is pinned.

**Gap**: no test exercises the full pipeline from a user requirement through brainstorming → refining → planning → downstream. Quality of brainstorming's output as input to refining, and refining's output as input to planning, and planning's output as input to downstream consumers — none of these "consumption quality" checks exist.

### 3.3 What `tests/skills/` Covers

Per-skill pytest validators (e.g., `tests/skills/test_skill_arc_brainstorming.py`) check frontmatter structure, required sections, cross-reference markers. They do not execute agents or validate pipeline behavior.

---

## Finding 4 — Eval Coverage Audit

Eval scenarios live under `evals/scenarios/`. Inventory (30 total) includes:

| Scenario | What it measures | Pipeline stage |
|---|---|---|
| `arc-brainstorming-gamma-mode-structure.md` | Design doc has `## Context` + `## Change Intent` sections when iterating | Brainstorming only |
| `arc-refining-iteration-reliability.md` | Spec version incremented, delta accumulated, supersedes set | Refining only |
| `arc-refining-iteration-delta.md` | Delta ADDED/MODIFIED/REMOVED lists are correct | Refining only |
| `arc-refining-dag-completion-gate.md` | Refiner blocks on incomplete prior DAG | Refining only |
| `arc-refining-calls-sdd-utils.md` | Refiner invokes validator | Refining only |
| `arc-planning-delta-scoped-sprint.md` | Planner generates one epic per delta child, overwrites DAG | Planning only |
| `sdd-v2-arc-*` (5 scenarios) | Each downstream skill in isolation | Downstream only |

**Each scenario is scoped to a single skill.** No scenario:
- Chains the output of one stage into the input of the next and measures terminal quality.
- Tests cross-requirement semantic consistency (would catch §2.1).
- Tests DAG state transitions post-merge (would catch §2.2, §2.3, §2.4).
- Tests policy around structured-artifact edits (would catch §2.5).

**Design intent acknowledged in prose, not tested**: `arc-brainstorming-gamma-mode-structure.md` target section says the `## Context` + `## Change Intent` structure is "load-bearing for arc-refining's downstream validation when a prior spec exists" — but no scenario verifies the load actually bears.

---

## Finding 5 — `scripts/lib/sdd-utils.js` Validator Scope

The validator invoked by refining/planning enforces:

- Required sections (regex-matched headings)
- Forbidden sections
- Deterministic file-level rules (e.g., "frontmatter must have exactly 2 fields")

It does **not** enforce:

- Cross-requirement consistency (e.g., a requirement's `<consumes>` naming an artifact that another requirement explicitly removes)
- Downstream-consumption validity (e.g., "every file path in an AC must be reachable in the produced DAG")
- Temporal ordering of feature completion vs epic completion

These are all "semantic" checks. The validator's scope is deliberately "structural" per design doc (`docs/plans/spec-driven-refine/2026-04-16/design.md`, section on validator architecture).

---

## Proposed Direction (for user decision, not acted upon)

The user has indicated preference for a **linter-style audit skill** (reports inconsistencies; does not autofix). The skill would sit alongside refining/planning, not inside them, and could be called manually or wired into a hook. Details deferred.

The user has also punted the larger question of **where the DAG-consumer contract should live**:

- Option A — new iteration of `specs/spec-driven-refine/` (v2) that formalizes Phase 2 downstream contracts.
- Option B — new separate spec (e.g., `sdd-downstream-contract`).
- Option C — treat existing SKILL.md files as de-facto spec, fix code and skill docs only.
- Option D — defer.

This report intentionally does not recommend an option.

---

## Appendix A — Key Commits from arc-evaluating-v2 Cycle

| SHA | Description | Relevance |
|---|---|---|
| `55f7e65` | initial plan/dag.yaml creation by `arc-planning` | Baseline DAG |
| `b456de8` | agent-lifecycle integration — rename sweep incidentally touched dag.yaml 2 lines | §2.5 |
| `97e1b76` | my manual DAG reconciliation after 3 epics merged | §2.2 evidence |
| `5faac1c` | second manual reconciliation pre-skill-body expand | §2.2 evidence |
| `c791e47` | feature-status finalization commit (sb-001..sb-008) | §2.3 evidence |
| `849fdfe` | post-refine design amendment landed despite `validateDesignDoc` ERROR | §2.7 evidence |
| `c2aaf61` | manual repair of 3 self-referential rename artifacts | §2.6 evidence |

## Appendix B — Files Cited

- `specs/spec-driven-refine/spec.xml:32` — Phase 2 exclusion
- `specs/spec-driven-refine/details/planner.xml:68-74` — planner AC6 (state-preservation forbidden)
- `docs/plans/spec-driven-refine/2026-04-16/design.md:180-200` — DAG completion gate rationale
- `scripts/lib/coordinator.js:426-493` — `_mergeEpicsInBase` (no git commit)
- `scripts/lib/coordinator.js:521-527` — cleanup gate `if (!epic.worktree) continue;`
- `scripts/lib/coordinator.js:945-973` — `_dagTransaction` (writes file, never commits)
- `tests/integration/sdd-v2-pipeline/README.md:30` — "Never re-runs arc-brainstorming"
- `evals/scenarios/*` — 30 scenarios, all single-skill scoped
- `specs/arc-evaluating-v2/details/folder-structure.xml` `fr-fs-001-ac1`
- `specs/arc-evaluating-v2/details/agent-lifecycle.xml` `<consumes>` block

## Appendix C — User Session Context

The investigation originated from a concrete user pain point at the end of the `arc-evaluating-v2` implementation: DAG state had drifted, 8 worktrees remained on disk after merge, and 8 features remained marked `pending` inside a `status: completed` epic. When the user asked "did you call `arc-finishing-epic`?", manual investigation revealed both the mechanical causes (§2.2–2.4) and the spec-level cause (§1).

Two prior exchanges in the session narrowed scope:

1. The user confirmed that the proposed audit skill should be a **linter**, not a fixer.
2. The user confirmed that "spec" in their question refers to **SDD v2 meta-spec** (`specs/spec-driven-refine/`), not the `arc-evaluating-v2` spec we had just implemented.

The user then elected to defer design decisions and requested this report instead.
