# Handoff: SDD v2 Downstream E2E Pipeline Tests

**Purpose:** Brief a fresh session to design and build end-to-end integration tests for the 5 SDD v2 downstream skills.

**Current branch:** `feature/spec-driven-refine`
**HEAD:** `0c4720a` (commit log in "Session history" below)
**Test state:** all 4 runners green (jest 807, test:node 6 suites, hooks 163, pytest 301)

---

## 1 · What this session is for

Design (and optionally build Phase A of) end-to-end tests that verify the five SDD v2 **downstream execution skills** correctly consume the **new per-spec upstream structure** and produce the expected **outputs**.

The 5 skills that need coverage:
- `arc-implementing` — in-worktree epic orchestrator (Phase 0 → 1 → 2 → 3)
- `arc-agent-driven` — task-list executor (spawns subagent per task)
- `arc-dispatching-parallel` — intra-worktree feature-level parallelism
- `arc-dispatching-teammates` — inter-worktree epic-level teammates dispatch
- `arc-looping` — autonomous cross-session unattended execution

---

## 2 · Why this work is needed (the gap)

### What already exists
| Layer | What it does |
|---|---|
| **Unit tests** (jest/node/hooks, 976 tests) | Verify Coordinator, CLI, worktree-paths handle per-spec layout correctly |
| **pytest skill-content** (301 tests) | Verify SKILL.md bodies mention `specs/<spec-id>/...` strings |
| **Evals** (8 SDD v2 scenarios, 4 with real delta) | Verify isolated agent **behaviors** per skill |

### What's missing
**Nothing runs the full pipeline `design → refine → plan → execute` end-to-end with the new structure.** Specifically, no test answers:

1. Does `arc-implementing` correctly consume `specs/<spec-id>/epics/<epic-id>/epic.md` + `features/*.md` and produce the expected outputs (Phase reports, tasks file, subagent dispatches, epic merge)?
2. Does `arc-agent-driven` correctly execute a task list and produce code that matches the spec?
3. Does `arc-dispatching-parallel` correctly identify parallel groups and execute them?
4. Does `arc-dispatching-teammates` correctly handle 2+ ready epics with single-spec gate + TeamCreate + final report?
5. Does `arc-looping` produce a valid `.arcforge-loop.json` state file and advance iterations against a per-spec DAG?

The existing `tests/integration/subagent-driven-dev/` tests `arc-agent-driven` with a pre-made flat `plan.md`, **bypassing the SDD v2 upstream pipeline entirely** — no brainstorming, no refining, no planning, no per-spec layout, no `.arcforge-epic` marker with `spec_id`.

---

## 3 · The proposed design: Option C

(A and B were rejected earlier in this conversation — see "Decisions already made" for rationale.)

### Architecture: shared upstream fixture + per-skill downstream tests

The 5 skills are **alternatives in the execution phase, not a chain**. They share upstream inputs but diverge in how they execute and what they output. So one test can't exercise all five, but they can all share the same upstream fixture.

```
tests/integration/sdd-v2-pipeline/
├── fixture/                              # Single shared fixture — snapshot, not live-generated
│   ├── docs/plans/demo-spec/2026-04-18/
│   │   └── design.md                     # gamma-mode design doc (iteration-style)
│   ├── specs/demo-spec/
│   │   ├── spec.xml                      # with identity header (spec_id, spec_version, supersedes, source, delta)
│   │   ├── details/
│   │   │   └── core.xml                  # requirements with fr-*-NNN ids + acceptance criteria
│   │   ├── dag.yaml                      # 2+ epics with dependency shape
│   │   └── epics/
│   │       ├── epic-a/
│   │       │   ├── epic.md
│   │       │   └── features/
│   │       │       ├── feat-a1.md
│   │       │       └── feat-a2.md
│   │       └── epic-b/
│   │           ├── epic.md
│   │           └── features/
│   │               └── feat-b1.md
│   ├── package.json                      # so install/test fixtures work
│   └── scaffold.sh                       # copy fixture → trial dir, git init
├── test-arc-implementing.sh              # enter worktree, invoke skill, assert Phase outputs
├── test-arc-agent-driven.sh              # from tasks file, assert code matches spec
├── test-arc-dispatching-parallel.sh      # worktree + features with deps, assert parallel group + execution
├── test-arc-dispatching-teammates.sh     # base session + 2 ready epics (single spec), assert TeamCreate + final report
├── test-arc-looping.sh                   # base session + multi-epic dag, assert loop CLI + state file + iteration
├── test-helpers.sh                       # shared: spawn_claude(), assert_file_exists(), assert_file_contains(), etc.
└── run-all.sh                            # run all 5 tests (in parallel where safe)
```

### Per-test shape (mirrors existing `tests/integration/subagent-driven-dev/run-test.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Copy fixture into isolated trial dir
TRIAL_DIR="$(mktemp -d)"
bash "$SCRIPT_DIR/fixture/scaffold.sh" "$TRIAL_DIR"

# 2. Enter trial dir (or worktree inside it for worktree-scoped skills)
cd "$TRIAL_DIR"

# 3. Spawn claude -p with the plugin loaded
claude -p "<skill-specific prompt>" \
  --plugin-dir "$ARCFORGE_ROOT" \
  --dangerously-skip-permissions \
  --output-format stream-json \
  > "$TRIAL_DIR/claude.log" 2>&1

# 4. Assertions
assert_file_exists "$TRIAL_DIR/docs/tasks/feat-a1-tasks.md"
assert_file_contains "$TRIAL_DIR/docs/tasks/feat-a1-tasks.md" "Task 1:"
assert_file_exists "$TRIAL_DIR/src/<expected-module>.js"
# skill-specific behavioral checks: parse claude.log for tool calls, etc.
```

### Why "snapshot, not live-generated" for the fixture

- **CI independence**: no Claude network dependency for the fixture
- **Fixture IS a contract**: any upstream schema change breaks downstream tests → forces schema docs/tests to stay in sync
- **Regeneration is explicit**: a separate `regenerate-fixture.sh` runs the upstream skills once, human reviews, commits. Not automated silent drift.

---

## 4 · Decisions already made (don't re-litigate)

| Decision | Answer | Rationale |
|---|---|---|
| Option A vs B vs C | **C** | A covers only arc-agent-driven; B is a monolithic single-path test that still misses the other 4 alternatives; C's per-skill split with shared fixture respects that the 5 skills are alternatives |
| Fixture: live-generated vs snapshot | **snapshot** | CI stability, explicit contract, no silent drift |
| Test language | **bash** | Matches existing `tests/integration/subagent-driven-dev/`, zero new tooling |
| Scope: all 5 skills | **yes, all 5** | User explicitly wants "那些 skill 都要被驗證到" |
| Single fixture or per-skill fixtures | **single shared** | Enforces contract; divergent fixtures would let upstream schema drift |
| Phase split (A: build 2; B: add 3; C: regen mechanism) | **yes** | User wants to see pattern work before full commitment |

---

## 5 · Phase A — the immediate next move

**Scope**: build shared fixture + `test-arc-implementing.sh` + `test-arc-looping.sh`.

Why these two skills first:
- **arc-implementing** and **arc-looping** are the **most different** shapes (single-epic worktree orchestration vs multi-epic cross-session autonomy). If the pattern works for both, it'll work for the other 3.
- Both already have the **strongest eval deltas** from this session (`+0.67` and `+0.33` respectively), so the behavioral signal is known — e2e just verifies the output artifacts.

**Cost**: ~1-2 hours. Can abort mid-way.

### Step-by-step for Phase A

1. **Create the directory structure** under `tests/integration/sdd-v2-pipeline/`
2. **Build the fixture by running real upstream skills once** on a trivial spec (e.g., "add a number parser with 2 epics"):
   - arc-brainstorming (Path B gamma mode) → `docs/plans/demo-spec/<date>/design.md`
   - arc-refining → `specs/demo-spec/spec.xml` + `details/*.xml` (with `<delta>` for iteration mode)
   - arc-planning → `specs/demo-spec/dag.yaml` + `epics/*/epic.md` + `features/*.md`
3. **Commit the fixture** — it's now the contract
4. **Write `scaffold.sh`** — copies fixture into a temp dir, runs `git init`, `arcforge expand` for the appropriate epic (to create the `.arcforge-epic` marker with `spec_id`)
5. **Write `test-helpers.sh`** — `assert_file_exists`, `assert_file_contains`, `extract_tool_calls_from_claude_log`, `spawn_claude_with_plugin`
6. **Write `test-arc-implementing.sh`** — prompt: "you're in a worktree, implement this epic"; assertions: `docs/tasks/feat-*-tasks.md` exists, `src/<expected>.js` exists with expected exports, test command passes
7. **Write `test-arc-looping.sh`** — prompt: "you have a DAG and want to run unattended with max-runs=2"; assertions: `arcforge loop` command was invoked with `--max-runs 2`, `.arcforge-loop.json` has `iteration: 2` and `status: max_runs`
8. **Run both tests once manually, iterate until green**
9. **Commit, report to user**

### What's out of scope for Phase A

- Other 3 skills (Phase B)
- Fixture regeneration script (Phase C)
- Integration with CI (Phase D)

---

## 6 · Key reference files in the repo

### Upstream skills (read to understand what fixture needs to look like)
- `skills/arc-brainstorming/SKILL.md` — Path A / Path B gamma mode output
- `skills/arc-refining/SKILL.md` — spec.xml identity header, `<delta>` element schema, iteration mode
- `skills/arc-planning/SKILL.md` — sprint model, `<delta>`-scoped planning, DAG rebuild

### Downstream skills being tested
- `skills/arc-implementing/SKILL.md` — Phase 0→1→2→3, delegation to arc-writing-tasks + arc-agent-driven
- `skills/arc-agent-driven/SKILL.md` — subagent-per-task, spec-reviewer + quality-reviewer after
- `skills/arc-dispatching-parallel/SKILL.md` — Step 1 reads `specs/<spec-id>/dag.yaml`, Step 5 prompt uses per-spec feature path
- `skills/arc-dispatching-teammates/SKILL.md` — single-spec gate (Precondition 2), TeamCreate → expand → Agent × N, spec-reviewer + verifier per completion
- `skills/arc-looping/SKILL.md` — sequential / DAG patterns, `.arcforge-loop.json` state, stall detection

### Spec identity header schema
- `specs/spec-driven-refine/spec.xml` — example of a v2 spec with `spec_version`, `supersedes`, `source/design_iteration`, and `<delta>` element

### Existing integration test pattern to mirror
- `tests/integration/subagent-driven-dev/run-test.sh` — current runner shape (scaffold → claude -p → check outputs)
- `tests/integration/subagent-driven-dev/go-fractals/` — example fixture + plan.md
- `tests/integration/claude-code/test-helpers.sh` — shared bash helpers (`assert_contains`, `require_output`)

### CLI commands the tests will exercise
- `arcforge status --spec-id <id> --json` — aggregate or single-spec DAG status
- `arcforge expand --spec-id <id> --epic <epic-id>` — create worktree with v2 marker (spec_id field)
- `arcforge loop --pattern sequential --max-runs N` — autonomous loop
- `arcforge merge <epic-id> --spec-id <id>` — merge worktree back
- `arcforge backfill-markers` — migration tool (not tested by integration tests, but exists)

### Session evidence for what "correct behavior" looks like per skill
- `evals/results/sdd-v2-arc-implementing-delegation/` — treatment trials show full orchestration chain
- `evals/results/sdd-v2-arc-looping-cli-invocation/` — treatment trials show correct CLI invocation with `--max-runs`
- `evals/results/sdd-v2-arc-dispatching-teammates-single-spec/` — treatment trials show blocked report for cross-spec

---

## 7 · Session history — what was accomplished before this handoff

### 13 commits on `feature/spec-driven-refine` (baseline `91a59e8`)

```
0c4720a fix(evals): correct null-result scenarios — grader + tool name
dcb7895 test(evals): downgrade marker-sync-guard to agent-scope regression guard
1fb53b6 test(evals): tighten SDD v2 downstream scenarios from pilot findings
05a159e test(evals): add 5 workflow scenarios for downstream SDD v2 skills
53258e7 fix(eval): stop stripping [tool_called] prefix in scenario parser
404a04b refactor(cli): simplify review — fix backfill crash + share marker read + index build
48a75eb test(skills): assert per-spec paths in 7 downstream skill tests
3af6203 docs(skills): arc-finishing-epic per-spec sync guard + arc-writing-tasks handoff
84dd51e docs(skills): per-spec paths + single-spec dispatch gate in 4 downstream skills
239bbc8 docs(skills): update routing layer for per-spec layout
def958f test(cli): migrate fixtures to per-spec layout + add multi-spec coverage
b20ea10 feat(cli): multi-spec UX for 9 commands + backfill-markers migration
46fdc35 feat(cli): per-spec Coordinator with lazy dagPath resolution
```

### Three major tranches
1. **Phase 1-5 of the original migration plan** (`~/.claude/plans/buzzing-munching-treasure.md`): Coordinator lazy dagPath + marker spec_id + module-level syncAllSpecs/rebootAllSpecs + worktree-path hash includes specId + CLI multi-spec UX + backfill-markers CLI + per-spec test fixtures + 7 skill content updates + 5 skill test assertions. All 1277 existing tests green.
2. **Simplify pass**: fixed `backfillMarkers` crash (stringifyDagYaml vs objectToYaml), shared `readArcforgeMarker` helper, `buildEpicSpecIndex` reverse index, `isAmbiguousSpec` helper.
3. **Eval coverage for the 5 downstream skills**: 8 scenarios total, 1 harness parser bug fixed along the way, 4 real deltas + 4 regression guards.

### Eval results table (final, after all fixes)

| Scenario | Scope | Delta | Role |
|---|---|---|---|
| `sdd-v2-arc-implementing-delegation` | workflow | +0.67 | Strongest real signal |
| `sdd-v2-arc-dispatching-teammates-single-spec` | workflow | +0.50 | Real signal after leakage fix |
| `sdd-v2-arc-looping-cli-invocation` | workflow | +0.33, CI [0.33, 0.33] | Most reliable (k=5, zero variance) |
| `sdd-v2-downstream-multi-spec-cli` | workflow | +0.17 | Solid signal |
| `sdd-v2-downstream-per-spec-paths` | agent | — | Regression guard |
| `sdd-v2-arc-dispatching-parallel-independence` | agent | — | Regression guard (baseline competence) |
| `sdd-v2-downstream-marker-sync-guard` | agent | — | Regression guard (v2 self-describing) |
| `sdd-v2-arc-agent-driven-subagent-per-task` | agent | — | Regression guard (baseline parallelism) |

### Harness bug fix (side-effect win)
`scripts/lib/eval.js:parseScenario` was stripping `[tool_called]` / `[tool_not_called]` / etc. prefixes along with markdown checkboxes because the regex used `[ x\w_]*`. All behavioral assertions in all existing scenarios were silently routed to the model grader. Fixed + regression test committed in `53258e7`.

---

## 8 · Open question left for the new session

**The fixture design is the critical unresolved detail.** Specifically:

> How substantive should the fixture's spec be?

Two end points:
- **Minimal**: 1 spec, 1 epic, 1 feature. Easy to write, but 4 of the 5 skills (dispatching-parallel, dispatching-teammates, looping) need multi-epic or multi-feature shape to exercise their characteristic behavior.
- **Realistic**: 1 spec, 2-3 epics, 2-3 features per epic, with a dependency graph so parallel-independence and teammates-single-spec both have something to exercise.

**Recommended: realistic.** Design a fixture with:
- 1 spec (`demo-spec`)
- 3 epics: `epic-a` (independent), `epic-b` (independent), `epic-c` (depends on a+b)
- Each epic has 2 features, at least one feature in `epic-a` depends on another → parallel-independence has something to test
- Spec.xml has a `<delta>` element to exercise arc-planning's v2 path

This is ~20-30 small files. Not huge, but substantial enough to cover the 5 skills' distinct needs.

---

## 9 · First move in the new session

Paste this prompt:

> 我要繼續 SDD v2 downstream 的 e2e pipeline tests。請先讀 `docs/plans/spec-driven-refine/handoff-e2e-pipeline-tests.md`，那裡有完整的 context、設計決策和下一步。讀完後先提一個建議給我：Phase A 的 fixture 應該是哪種形狀（minimal vs realistic，具體幾 epic / 幾 feature / 什麼依賴結構）？

After the fresh agent reads this file and proposes a fixture shape, approve/modify, then let it execute Phase A.

---

## 9.6 · Upstream eval state after new scenarios (Task 1/2/3 this session)

Two new upstream scenarios added to close the zero-coverage gap on
arc-brainstorming and arc-planning, and the iteration-reliability rerun
was extended.

| Scenario | Scope | Verdict | Detail |
|---|---|---|---|
| `arc-brainstorming-gamma-mode-structure` (new) | workflow | regression guard | Baseline 3/3, treatment 3/3 — bare agents produce `## Context` + `## Change Intent` structure from fixture path cues alone. Keep as a guard: if this drops below 100%, gamma mode is no longer inferable. |
| `arc-planning-delta-scoped-sprint` (new) | workflow | **NEEDS WORK** (delta −0.07, partial skill effect) | A1+A2 (archive old DAG): baseline 2/3, treatment 3/3 — skill reliably teaches archive discipline. A3+A4 (include delta refs) + A5 (exclude non-delta refs): baseline 3/3, treatment 1/3 — **treatment sometimes archives correctly then writes wrong DAG content**, ignoring delta scope or missing new refs. Skill's sprint-model teaching is partial — investigate why treatment's content quality degrades. |
| `arc-refining-iteration-reliability` rerun | agent | recent 5/5 PASS, pooled 21/23 = 91% NEEDS WORK | Trajectory is up; pool is dragged by pre-parser-fix history. To reach SHIP threshold of ~95%+ pooled, need either ~20 more consecutive PASS trials or a benchmark-archival step. |

### Task 3 outcome: iteration-delta catastrophic outlier is not a regression

The iteration-delta treatment trial that failed all 7 assertions had the
agent asking a clarifying question ("Should `oauth_provider` be a separate
requirement or folded into the OAuth Login requirement?") instead of
producing the spec. This is arc-refining's own discipline (SKILL.md line 24:
"iterative refinement — ask 2-3 clarifying questions per iteration") firing
correctly in a headless environment where no human can answer. The agent
waits until max_turns and produces no output.

**Implication**: iteration-delta scenario is **headless-incompatible** with
arc-refining's skill design. Either:
- Modify scenario Context to "no clarifying questions — make reasonable
  assumptions", which forces the agent past the skill's discipline (but
  masks real skill behaviour)
- Accept this scenario as "runs only in interactive mode" and not count
  its verdict against SHIP-readiness
- Rewrite arc-refining to detect headless context and skip clarifying
  questions (biggest skill change, probably too far)

Leaving unchanged for now; documented here so the pattern isn't
rediscovered.

## 9.5 · Upstream eval state after parser-fix rerun

All three upstream evals were rerun after the parser bug fix. Verdicts
did NOT improve in aggregate — the fix made grading more honest, not
more passing.

| Eval | Verdict | Latest k=3 trials | Interpretation |
|---|---|---|---|
| `arc-refining-calls-sdd-utils` | **SHIP** | baseline 3/3, treatment 3/3 | Non-discriminative — both conditions at ceiling. Treat as regression guard, not skill signal. |
| `arc-refining-iteration-delta` | **BLOCKED** | baseline 3/3, treatment 2/3 (1 catastrophic: A1-A7 all ✗) | Real regression outlier in treatment. Investigate the failed trial's transcript; may need scenario redesign or k=10 to tell noise from signal. |
| `arc-refining-iteration-reliability` | **NEEDS WORK** (89% over 18 pooled trials) | latest 3/3 PASS | Trajectory is up. A few more k=3 reruns should push the pooled pass rate past SHIP threshold without scenario changes. |

**arc-brainstorming eval coverage: zero.**
**arc-planning direct eval coverage: zero** (only indirectly via arc-refining's sdd-utils call).

These two upstream gaps are the biggest "bug could ship and hit a user"
risks right now.

## 9.7 · Phase A completion — both e2e tests PASS (this session)

Phase A ran both integration tests end-to-end. Results:

| Test | Assertions | Result | Commit |
|---|---|---|---|
| `test-arc-implementing.sh` | 9/9 PASS | ✓ | `5d4a447` |
| `test-arc-looping.sh` | 5/5 PASS | ✓ | `5d4a447` |

**arc-looping detail** (background task `bds9pt2xe`, exit code 0):

```
[PASS] loop state file created at project root
[PASS] loop state records pattern=dag
[PASS] loop advanced at least one iteration
[PASS] loop status is a known value
[PASS] arcforge loop CLI invoked with --pattern dag
=== arc-looping test: 0 failure(s) ===
```

The session hit rate limit (HTTP 429) at the exact moment the arc-looping
notification arrived — result was never processed interactively. Recorded here
retroactively by the next session from the background task output file at
`/private/tmp/claude-501/.../tasks/bds9pt2xe.output`.

**Phase A is complete.** Next step is Phase B: add tests for
`arc-agent-driven`, `arc-dispatching-parallel`, and `arc-dispatching-teammates`.

---

## 10 · If the new session wants to change course

These are the questions worth reconsidering with a fresh mind:
- Is bash really the right language, or should these be Node.js scripts invoking the eval harness's trial mechanism?
- Should the fixture live in-repo or be generated by a `regenerate-fixture.sh` that's run on-demand?
- Is it worth teaching the eval harness to parse `claude -p` stream-json directly, so we don't need a separate bash integration runner?

These were considered and set aside this session, but a fresh session might reach different conclusions — that's fine.

---

## 11 · Phase C completion record

**Branch:** `claude/elegant-mcnulty-f143a9` (cherry-picked Phase B from
`claude/brave-maxwell-1cb5a8`, then added Phase C on top)

**Commits added this session:**
```
a6b3719 test(integration): add fixture regeneration script (Phase C)
c3c3a95 test(integration): add SDD v2 downstream e2e pipeline tests (Phase B)   [cherry-pick]
7f9d202 docs(plans): record Phase A completion — arc-looping 5/5 PASS             [cherry-pick]
```

### Phase C — regenerate-fixture.sh

`tests/integration/sdd-v2-pipeline/regenerate-fixture.sh` implements the
fixture regeneration mechanism with a clear layering principle:

```
design.md           ← human-managed seed (never regenerated)
spec.xml / details/ ← arc-refining output  (regenerable)
dag.yaml / epics/   ← arc-planning output  (regenerable)
```

Key implementation decisions:
- **No arc-brainstorming re-run** — design.md is the fixed seed.
- **scripts/ symlink** — work dir symlinks `$ARCFORGE_ROOT/scripts` so
  arc-refining's `require('./scripts/lib/sdd-utils')` resolves correctly.
- **Headless-safe prompts** — both refining and planning prompts say
  "headless regeneration run — do NOT ask questions; make assumptions"
  to bypass the clarifying-question discipline (known headless-incompatible
  pattern documented in section 9.6).
- **--apply flag** — copies result back to fixture/; default is diff-only
  so human can review before applying. Never auto-commits.
- **Timeout env vars** — `SDD_REGEN_REFINE_TIMEOUT` + `SDD_REGEN_PLAN_TIMEOUT`
  (default 600s each).

### All phases complete

Phase A, B, and C are all done. The integration test suite covers all 5
downstream skills plus has a regeneration path. Next steps if any:
- Merge `claude/elegant-mcnulty-f143a9` → `feature/spec-driven-refine`
- Run Phase A/B tests manually on the current fixture to confirm green
- Run `regenerate-fixture.sh --apply` after any upstream skill schema change
