# Handoff: SDD v2 Pipeline Realignment — Implementation

**Purpose:** Brief a fresh session to execute the implementation changes that
bring arcforge's shipping surface (schemas, utils, skills, evals) into
alignment with the 2026-04-19 SDD v2 realignment decisions.

**Current branch:** `feature/spec-driven-refine`
**HEAD at handoff:** `db0da02` ("chore: clean up lint warnings and untrack contributor-only task list")
**Test state at handoff:** all 4 runners green (jest 808, test:node 6 suites, hooks passing, pytest 301)
**Lint state:** clean (biome clean)

---

## 1 · Why this work exists

On 2026-04-19 the author and an agent session walked through a 10-question
interview that surfaced a contradiction in the v2 SDD design and realigned
the three upstream layers (vault / design doc / spec) with the author's
actual intent. The key contradiction: v2 design said "DAG is ephemeral,
no state preservation" AND "archive old DAG" — irreconcilable. Tracing
showed "archive" was borrowed from OpenSpec's change-proposal workflow
(via `docs/research/iterable-sdd-pipeline.md`) and was never an authored
arcforge decision.

**Authoritative decision record:** `[[arcforge-decision-sdd-v2-pipeline-realignment]]`
in the Obsidian vault (path:
`/Users/gregho/Library/Mobile Documents/iCloud~md~obsidian/Documents/Greg's Vault/ArcForge/arcforge-decision-sdd-v2-pipeline-realignment.md`).
Read it first — it contains D1..D8, the 8 decisions this implementation
needs to enforce.

The three upper layers are already aligned:

| Layer | Artifact | Status |
|---|---|---|
| **Vault** | decision note + 4 updated source/synthesis notes + index + log | ✅ done in prior session |
| **Design doc** | `docs/plans/spec-driven-refine/2026-04-16-v2/design.md` | ✅ updated in prior session (300 → 344 lines) |
| **Spec** | `specs/spec-driven-refine/spec.xml` + 5 detail files | ✅ updated in prior session (1480 → 1608 lines) |

**What is NOT yet updated (your job):** shipping implementation surface —
`scripts/lib/sdd-schemas/*.md`, `scripts/lib/sdd-utils.js`, three SKILL.md
files, skill tests, eval scenarios, eval benchmarks.

---

## 2 · The 8 decisions (D1..D8) this implementation must enforce

Short summary. Full rationale + rejected alternatives live in the vault
decision note — read that first.

| ID | Decision | Primary impact |
|---|---|---|
| **D1** | DAG lifecycle: overwrite, never archive | Remove all archive mechanisms from arc-planning |
| **D2** | DAG completion gate lives in refiner, not planner | Delete gate from planner; add to refiner |
| **D3** | Spec accumulates `<delta>` elements wiki-style | sdd-utils multi-delta parser; schema allows N deltas |
| **D4** | All four `<delta>` children generate epics (added/modified/removed/renamed) | Planner scope logic covers all four |
| **D5** | No "modes" in the pipeline (no Path A/B/gamma/initial/iteration/replace) | Remove mode language from all skills + schemas |
| **D6** | R3 block behavior: terminal only, no `refiner-report.md` | Refiner skill prints + exits; no file writes on block |
| **D7** | No escape hatch from refiner gate | Skill doc explicit; no flag/status-override |
| **D8** | Pure-teardown sprints (only `<removed>`) are legal | Planner accepts; no shape-of-delta check |

---

## 3 · Pre-reqs — read these in order

1. **Vault decision note** (authoritative): `[[arcforge-decision-sdd-v2-pipeline-realignment]]`
2. **Design doc** (reflects decisions): `docs/plans/spec-driven-refine/2026-04-16-v2/design.md`
3. **Spec contract** (what implementation must satisfy):
   - `specs/spec-driven-refine/spec.xml` (v2 overview + delta)
   - `specs/spec-driven-refine/details/brainstorming.xml` (fr-bs-001..007)
   - `specs/spec-driven-refine/details/refiner.xml` (fr-rf-001, 003..005, 007..012 — note **fr-rf-002 was deleted** and **fr-rf-012 was added** on 2026-04-19)
   - `specs/spec-driven-refine/details/planner.xml` (fr-pl-001..006 — note **fr-pl-007 was deleted** on 2026-04-19; fr-pl-001 now has 6 AC covering D1/D4/D8)
   - `specs/spec-driven-refine/details/cross-cutting.xml` (fr-cc-if-001..005)
   - `specs/spec-driven-refine/details/sdd-schemas.xml` (fr-sd-001..009)
4. **Current shipping surface** (the things you'll be editing):
   - `scripts/lib/sdd-schemas/design.md`
   - `scripts/lib/sdd-schemas/spec.md`
   - `scripts/lib/sdd-utils.js` (+ its test `tests/scripts/sdd-utils.test.js`)
   - `skills/arc-brainstorming/SKILL.md` (+ test `tests/skills/test_skill_arc_brainstorming.py`)
   - `skills/arc-refining/SKILL.md` (+ test `tests/skills/test_skill_arc_refining.py`)
   - `skills/arc-planning/SKILL.md` (+ test `tests/skills/test_skill_arc_planning.py`)
   - Eval scenarios in `evals/scenarios/` (list below)

---

## 4 · Phased task plan

Phases are dependency-ordered. Do not start a phase until its predecessor
is green. Within a phase, tasks may run in parallel unless marked otherwise.

### Phase 1 — Schema Layer (foundation)

**Dependency:** none. These are documentation files consumed by skills + utils.

- **Task 1.1 — Update `scripts/lib/sdd-schemas/design.md`.** Remove
  `## Path A — Initial Design Doc` / `## Path B — Iteration Design Doc / Gamma Mode`
  headings. Replace with context-sensitive sections keyed on "prior spec
  exists" / "no prior spec exists". Update mode-detection language
  (fr-sd-001-ac2). Validation summary table: replace Path A / Path B
  columns with "No Prior Spec" / "Prior Spec Exists". (Note: this
  previously was applied in-session and reverted; expect the prior content
  to still match the pre-realignment state.) Acceptance per spec:
  `fr-sd-001`, `fr-sd-002`, `fr-sd-003`, `fr-sd-004` as updated in
  `specs/spec-driven-refine/details/sdd-schemas.xml`.

- **Task 1.2 — Update `scripts/lib/sdd-schemas/spec.md`.** Rewrite the
  `## Delta Element` section to `## Delta Elements` (plural). Allow
  multiple `<delta>` children of `<overview>`, ordered ascending by
  `version`. Add example with v2 + v3 deltas coexisting. Update validation
  table: replace single-delta rules with multi-delta rules (ordering,
  uniqueness, last-delta matches current spec_version). Explicit
  clarification that `<reason>`/`<migration>` in `<removed>` are used by
  implementer LLM (not just humans). Explicit clarification that
  `<renamed>` is body-unchanged only — semantic changes use
  `<removed>` + `<added>`. State that every delta child generates an epic
  (planner's rule). Acceptance per spec: `fr-rf-011` contract + `fr-sd-005`
  in sdd-schemas.xml.

### Phase 2 — sdd-utils.js (parser + validator)

**Dependency:** Phase 1 complete (schema doc is the ground truth for utils).

- **Task 2.1 — Multi-delta parser.** Refactor `parseSpecHeader` to return
  `{ ..., deltas: Array<Delta> }` instead of `{ ..., delta: Delta | null }`.
  Deltas sorted ascending by `version`. For backward compat with existing
  callers that read `.delta`, expose a derived `latest_delta` (last in
  array) and a getter `deltaForVersion(n)`. Update JSDoc.

- **Task 2.2 — Multi-delta validator.** In `validateSpecHeader`, replace
  single-delta rules with:
  - Deltas ordered ascending by version (ERROR if not)
  - Unique version per delta (ERROR if dup)
  - If any delta present, last delta's `version` equals current
    `spec_version` (ERROR if mismatch)
  - Last delta's `iteration` equals current `source/design_iteration`
    (ERROR if mismatch)
  - Earlier deltas (version < current spec_version) are NOT checked
    against current design_iteration — they are historical record.

- **Task 2.3 — Ensure delta children parse correctly.** Confirm
  `<added>`, `<modified>`, `<removed>` (with mandatory `<reason>`,
  optional `<migration>`), `<renamed>` (with `ref_old` / `ref_new`,
  optional `<reason>`) all parse. Do not change the per-child structure.

- **Task 2.4 — Add `checkDagStatus` helper** (if not already present in
  a usable shape) that returns `{ total, completed, incomplete,
  incompleteEpics: [{id, status}, ...] }` for the refiner's gate check.

- **Task 2.5 — Tests.** `tests/scripts/sdd-utils.test.js` must cover:
  v1 spec (zero deltas), v2 spec (one delta), v3+ spec (multiple
  accumulated deltas), mis-ordered deltas, duplicate version, mismatched
  last-delta version, each `<removed>` shape, `<renamed>` shape. Existing
  legacy format tests (self-closing `<removed/>` = ERROR; text-content
  form = parsed as reason) MUST continue to pass.

### Phase 3 — Skills (user-facing surface)

**Dependency:** Phase 2 complete. Skills call sdd-utils.

- **Task 3.1 — `skills/arc-brainstorming/SKILL.md`.**
  Remove all Path A / Path B / gamma mode references. Describe one
  behavior with context-sensitive output: "when no prior spec exists"
  (prose design doc) vs "when prior spec exists" (Context + Change
  Intent). fr-bs-005-ac4 forbids pre-authored structured delta sections
  in the design doc — skill must not produce them. Keep spec-id
  elicitation flow (fr-bs-001/002/006). Update
  `tests/skills/test_skill_arc_brainstorming.py` to assert the new
  language (or at least no longer assert Path A/B presence).

- **Task 3.2 — `skills/arc-refining/SKILL.md`.** Primary changes:
  - **Add Phase 0 (or similar early phase): DAG completion gate.** Per
    fr-rf-012. Check `specs/<spec-id>/dag.yaml` only when a prior
    `specs/<spec-id>/spec.xml` exists. Use `checkDagStatus` from
    sdd-utils. If any epic incomplete → print list of incomplete epics
    + message "Complete current sprint before iterating." → exit non-zero
    → no files written.
  - **R3 block behavior (fr-rf-001-ac3):** remove any instruction to
    write `refiner-report.md`. Terminal output + non-zero exit is the
    entire block behavior. Delete any skill section that describes
    `docs/plans/.../refiner-report.md` as an artifact.
  - **Delta accumulation (fr-rf-011-ac4):** when a prior spec exists,
    **append** the new `<delta>` to the prior spec's `<overview>`. MUST
    preserve all prior `<delta>` elements verbatim. The new delta is
    the last child of `<overview>`.
  - **No escape hatch (fr-rf-012-ac5):** document that there is no
    `--force` flag, no `abandoned` status, no CLI override. Only two
    paths: finish the sprint, or delete `specs/<spec-id>/`.
  - **Mode language:** remove "initial mode" / "iteration mode" /
    "Path A" / "Path B" / "γ mode" / "gamma mode" / "replace mode"
    throughout. Use "when prior spec exists" / "when no prior spec
    exists" framing.
  - Update `tests/skills/test_skill_arc_refining.py`.

- **Task 3.3 — `skills/arc-planning/SKILL.md`.** Primary changes:
  - **Delete Phase 2 (DAG Completion Gate) entirely.** Per fr-pl-001-ac6
    (planner holds no gate). Do not replace it with anything — planner
    skips straight from Phase 1 (input validation) to what is currently
    Phase 3 (scope determination), which becomes the new Phase 2.
  - **Delete archive command** (`mv ... dag.yaml.archive.$(date +%Y-%m-%d)`).
    Replace with explicit "overwrite" language. fr-pl-001-ac3 forbids any
    archive file creation.
  - **Scope determination (new Phase 2):** read the `<delta>` whose
    `version` equals current `spec_version`. Ignore earlier deltas.
    For v1 (no `<delta>`), plan all requirements in detail files.
  - **Epic generation (new rule):** every delta child produces an epic.
    Skill must have explicit guidance for:
    - `<added>` → implement epic, source_requirement = ref
    - `<modified>` → update epic, source_requirement = ref
    - `<removed ref="X">` → teardown epic that references X (X is no
      longer in detail files; implementer LLM greps for X). Include
      reason + migration from the delta in the epic.md.
    - `<renamed ref_old="X" ref_new="Y">` → mechanical refactor epic
      (grep + replace X → Y), source_requirement = Y.
  - **Pure-teardown sprint (fr-pl-001-ac5):** explicit guidance that a
    delta with only `<removed>` children is legal; planner emits only
    teardown epics and proceeds.
  - **Pure function language:** frame planner as `(spec + delta) → (dag.yaml + epics/)`
    with no side effects beyond output paths. No state preservation,
    no environment reads beyond the input files.
  - Update `tests/skills/test_skill_arc_planning.py`.

- **Task 3.4 — Cross-skill grep.** After 3.1/3.2/3.3, grep `skills/` for
  any residual `Path A`, `Path B`, `gamma`, `archive.*dag`,
  `dag.yaml.archive`, `DAG completion gate` (in planner context),
  `refiner-report`. Expect zero matches outside of explicitly-negated
  contexts (e.g., "MUST NOT write refiner-report.md" is legitimate).

### Phase 4 — Eval Scenarios

**Dependency:** Phase 3 complete. Evals verify skill behavior.

Scenarios that need update:

- **Task 4.1 — `evals/scenarios/arc-planning-delta-scoped-sprint.md`.**
  - Remove A1 (`[tool_called] Bash:dag.yaml.archive`) — archive no longer expected.
  - Remove A2 (archive file existence) — archive no longer expected.
  - Replace A1/A2 with a single assertion: "v1 `dag.yaml` was overwritten
    (new content ≠ old content); no `archive.*` file or `archive/`
    subdirectory was created."
  - Keep A3/A4/A5 (delta-scoped epic generation).
  - Add assertions for `<renamed>` and `<removed>` epic generation if
    the scenario's fixture supports it (may need fixture update).
  - Raise Max Turns appropriately (25 was set earlier — still fine).

- **Task 4.2 — `evals/scenarios/arc-refining-iteration-delta.md`.**
  - Update assertions to check **accumulating deltas** — after refining
    v3, the spec must still contain the v2 `<delta>`.
  - Keep Fix C (the "evaluation context with no human reviewer" prompt
    directive — it's working; 5/5 PASS last run).
  - Add assertion: refiner does NOT write `refiner-report.md` on success
    or block.

- **Task 4.3 — New scenario (optional, nice-to-have): `evals/scenarios/arc-refining-dag-completion-gate.md`.**
  Tests fr-rf-012. Setup: prior spec v1 + dag.yaml with one epic in
  "in_progress". Prompt: "iterate to v2 with a Change Intent to add X".
  Expected: refiner blocks, terminal output mentions incomplete epic,
  no spec files written, no refiner-report.md written. exit code
  non-zero.

- **Task 4.4 — Eval rerun.** Re-run all 7 SDD v2 scenarios with k=5.
  Record results in `evals/benchmarks/2026-MM-DD.json` (new date). Copy
  to `evals/benchmarks/latest.json`. Confirm improvements:
  - arc-planning-delta-scoped-sprint ≥ 0.9 pass_rate
  - arc-refining-iteration-delta ≥ 0.9 pass_rate (Fix C already got 5/5)
  - sdd-v2-arc-implementing-delegation ≥ 0.7 pass_rate (may still be
    flaky — this is a separate skill-adherence issue flagged in prior
    session; NOT a realignment issue)
  - Remaining 4 stay green.

### Phase 5 — Integration Tests (manual-only suite)

**Dependency:** Phase 3 complete. Can run parallel with Phase 4.

- **Task 5.1 — Fixture audit.** `tests/integration/sdd-v2-pipeline/fixture/`
  contains a snapshot spec (demo-spec). Check that its spec.xml still
  validates under the new multi-delta rules. If it uses single-delta
  format, update (adding a second historical delta is optional — v2-only
  specs with one delta are still valid).

- **Task 5.2 — Run all five integration tests** per
  `tests/integration/sdd-v2-pipeline/run-all.sh`. They are manual-only
  (not wired into `npm test`). Record results. Fix any regressions
  introduced by skill updates.

- **Task 5.3 — Regenerate fixture if needed.**
  `tests/integration/sdd-v2-pipeline/regenerate-fixture.sh --apply` to
  re-seed from current skill behavior. But **note the author's own caveat**:
  refiner may not be trustworthy yet — if regeneration produces garbage,
  fix the refiner skill first (back to Task 3.2).

### Phase 6 — CI, Lint, Final Verification

**Dependency:** all prior phases complete.

- **Task 6.1 — `npm test`:** all 4 runners green (jest, node, hooks, pytest).
- **Task 6.2 — `npm run lint`:** biome clean (0 errors; warnings
  acceptable if same-as-main).
- **Task 6.3 — Self-verification of the realignment.** Grep the whole repo
  (excluding this handoff and the vault / design / spec which intentionally
  document what was removed) for `Path A`, `Path B`, `gamma mode`,
  `dag.yaml.archive`, `archive.*dag` — expect zero matches in shipping
  surface.
- **Task 6.4 — PR description.** Update/write PR description covering:
  the contradiction that was found, the 8 decisions (point to vault),
  which files changed, eval before/after numbers, any deferred items.

---

## 5 · Files affected (cheat sheet)

| File | Change type |
|---|---|
| `scripts/lib/sdd-schemas/design.md` | Rewrite mode detection, headings, validation table |
| `scripts/lib/sdd-schemas/spec.md` | Delta Element → Delta Elements (plural), multi-delta rules |
| `scripts/lib/sdd-utils.js` | Multi-delta parser, validator, `checkDagStatus` |
| `tests/scripts/sdd-utils.test.js` | Add multi-delta cases, preserve legacy compat cases |
| `skills/arc-brainstorming/SKILL.md` | Remove modes, conditional-section framing |
| `skills/arc-refining/SKILL.md` | Add gate (Phase 0), remove refiner-report, delta append, no escape hatch |
| `skills/arc-planning/SKILL.md` | Delete Phase 2 gate, delete archive, 4 delta children epic rules |
| `tests/skills/test_skill_arc_brainstorming.py` | Update asserted sections/language |
| `tests/skills/test_skill_arc_refining.py` | Update asserted sections/language |
| `tests/skills/test_skill_arc_planning.py` | Update asserted sections/language |
| `evals/scenarios/arc-planning-delta-scoped-sprint.md` | Rework A1/A2, add teardown/rename coverage |
| `evals/scenarios/arc-refining-iteration-delta.md` | Accumulating delta assertions |
| `evals/scenarios/arc-refining-dag-completion-gate.md` | NEW (optional) |
| `evals/benchmarks/latest.json` | Regenerated after Phase 4 rerun |

---

## 6 · Risks & gotchas

- **R1 — sdd-utils refactor cascades.** Changing `parseSpecHeader` return
  shape (`delta` → `deltas`) breaks every caller. Inventory callers first
  (`grep -rn parseSpecHeader scripts/ skills/ tests/ hooks/`). Update
  them together.

- **R2 — Skill tests are content assertions.** Tests like
  `test_arc_planning_has_dag_completion_gate` (if it exists) will fail
  when Phase 2 is deleted. Don't hack the skill to keep the old string —
  fix the test.

- **R3 — Evals may still be flaky for non-realignment reasons.** The
  `sdd-v2-arc-implementing-delegation` scenario was flagged in prior
  session as a genuine skill-adherence issue (agent sometimes skips
  the orchestration chain even when skill says to delegate). That is
  **out of scope** for this handoff — do not try to fix it here. Note
  it in the PR description if results are still borderline.

- **R4 — Integration tests are manual.** They will not fail in CI. Do
  not assume `npm test` green means integration tests pass. Explicitly
  run `tests/integration/sdd-v2-pipeline/run-all.sh` once.

- **R5 — The refiner itself may still not produce correct output for
  this spec.** The author explicitly flagged this in prior session:
  refiner was trained / designed against the old single-delta +
  Path A/B model. After Phase 3, refiner should be correct — but
  **do not re-run refiner on `specs/spec-driven-refine/` as validation**.
  The spec there was hand-edited in prior session for a reason. Use
  the integration fixture (`tests/integration/sdd-v2-pipeline/fixture/`)
  or a throwaway demo spec to sanity-check refiner output.

- **R6 — Don't dogfood mid-stream.** Implementing these changes with
  `/arc-brainstorming`, `/arc-refining`, `/arc-planning` would be
  bootstrapping with broken tools. Use direct file edits until Phase 3
  is complete. Dogfood at Phase 6 sanity-check time only.

---

## 7 · Completion checklist

Before marking the realignment shipped, every box below must be ticked:

- [ ] `scripts/lib/sdd-schemas/design.md` has no "Path A" / "Path B" / "gamma" headings
- [ ] `scripts/lib/sdd-schemas/spec.md` documents multi-delta accumulation + 4 child types with epic semantics
- [ ] `scripts/lib/sdd-utils.js` returns `deltas: Array` and validates multi-delta ordering
- [ ] `tests/scripts/sdd-utils.test.js` covers 0/1/many delta cases + legacy compat
- [ ] `skills/arc-brainstorming/SKILL.md` uses "when prior spec exists" / "when no prior spec exists" framing
- [ ] `skills/arc-refining/SKILL.md` has refiner DAG completion gate as an early phase
- [ ] `skills/arc-refining/SKILL.md` never writes `refiner-report.md`
- [ ] `skills/arc-refining/SKILL.md` appends new `<delta>` (does not overwrite prior deltas)
- [ ] `skills/arc-refining/SKILL.md` documents "no escape hatch" explicitly
- [ ] `skills/arc-planning/SKILL.md` has no Phase 2 DAG Completion Gate
- [ ] `skills/arc-planning/SKILL.md` has no `dag.yaml.archive` command
- [ ] `skills/arc-planning/SKILL.md` documents 4 delta-child-to-epic mappings
- [ ] Each of 3 skill test files updated and passing
- [ ] `arc-planning-delta-scoped-sprint` eval A1/A2 updated; overall pass_rate ≥ 0.9 on k=5
- [ ] `arc-refining-iteration-delta` eval asserts accumulating deltas; pass_rate ≥ 0.9 on k=5
- [ ] Remaining 5 SDD v2 scenarios unchanged or improved
- [ ] `evals/benchmarks/latest.json` regenerated
- [ ] `tests/integration/sdd-v2-pipeline/run-all.sh` passes
- [ ] `npm test` green
- [ ] `npm run lint` clean
- [ ] Grep of shipping surface (excluding this doc + vault + design + spec) shows zero `Path A|Path B|gamma|dag.yaml.archive` matches
- [ ] PR description cites vault decision note and design doc

---

## 8 · Out of scope for this handoff

The following are real issues flagged in the session that produced this
realignment, but are NOT part of the realignment implementation:

- `sdd-v2-arc-implementing-delegation` pass rate is ~0.56 due to a
  genuine skill-adherence issue (agent sometimes skips orchestration
  chain for simple-looking tasks). Address separately.
- Untracked files at repo root (`uv.lock`, `evals/harness-eval-workspace/`,
  `skills/arc-diagramming-obsidian/references/uv.lock`, etc.). The author
  has chosen to ignore these; do not commit them.
- `sdd-v2-downstream-marker-sync-guard` trial 3 soft fail (0.83 — a
  model-graded flake). Not worth fixing unless it regresses further.
