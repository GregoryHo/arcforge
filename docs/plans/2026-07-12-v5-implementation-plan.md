# arcforge v5.0.0 Implementation Plan

Status: **AWAITING MAINTAINER APPROVAL** — no implementation starts before
explicit approval.
Date: 2026-07-12
Companions: decision record (`2026-07-12-v5-redesign-decisions.md`),
progress artifact (`v5-progress.md`), grounded file inventories
(`v5-grounding/ground-{platform,hooks,testsEvals,nameSweep}.json` — 174
items, 44 acceptance commands, 46 risk notes; every workstream below cites
its inventory rather than duplicating it).

---

## Goals (measurable — what "v5 done" means)

| # | Goal | Measured by |
|---|------|-------------|
| G1 | Catalog 32 → 30 skills; 8,134 → ~5,200 SKILL.md lines; every skill within budget (soft 150 / hard 250; allowlist: arc-refining 300, arc-finishing 430) | line-budget pytest check |
| G2 | Descriptions rewritten to two-register grammar; 3 skills DMI-flagged (arc-auditing-spec, arc-recalling, arc-writing-skills) | structure checker + manual review |
| G3 | Hooks: 19 matcher-groups/14 (event,script) pairs → ≤7 entries; per-Edit sync spawns 5 → ≤2; new guards (dag-guard, secrets warn, bypass closures, autopilot denies) each with engine-side twin and no-op-invariant test | the two `node -e` proofs in ground-hooks verify_commands + hook suite |
| G4 | Platforms: Claude Code + Codex tier-1; `.gemini/` `.opencode/` removed; version sync 10 → 9 locations | WS1 grep gates + `check:versions` |
| G5 | Tests: structure-only pytest (zero literal-prose asserts); all 5 runners green; new CI checks (hooks schema, dangling eval Targets) | `npm test` + new check scripts |
| G6 | Evals: discipline + merged skills re-baselined non-regressing; `benchmarks/latest.json` regenerated as the v5 epoch | `eval report` + per-scenario results |
| G7 | Release 5.0.0 with old→new mapping table in CHANGELOG | tag + `check:versions` |

## Non-goals (deferred to 5.x per decision record)

Physical category directories · secrets-guard deny flip · arc-finishing →
`finish-epic.js` extraction · learning A/B self-eval · completion-claim /
TDD write gates · arc-reflecting DMI flag.

## Adjustment knobs (maintainer can tune without re-planning)

1. **Eval sweep scope** (WS9): full D5 set (~17 scenarios, hours of wall
   time, arc-evaluating's 9 dominate) vs core-4 (tdd, debugging,
   verifying, reviewing) with the rest before tag.
2. **Merge policy**: integration branch vs per-wave review vs direct main
   (approval question).
3. **WS3 autopilot denies**: can be dropped from 5.0 (ship dag-guard +
   secrets warn only) if false-positive risk feels high.
4. **Website updates** (WS1/WS5 jsx edits + rebuild): can be deferred.

## Grounding corrections to the decision record

- hooks.json ground truth: **19 matcher-groups / 14 pairs**, not "13
  registrations". Per-Edit: 7 spawns (5 sync); per-Bash: 6 (4 sync).
- Version sync shrinks **10 → 9** in WS1 (only `.opencode/plugins/arcforge.js`
  is a gemini/opencode entry); "~6" requires separate website consolidation
  not in scope.
- arc-researching is **287** lines (not 202); diet target stays ~185.
- The "13 → ~6" consolidation may legitimately land at **7** entries if
  observe-pre stays async-separate (folding it into the sync dispatcher
  would put daemon I/O on every tool call's blocking path).

---

## Execution model

### Worktrees & branches

- Integration branch **`v5/main`** cut from `main` (pending approval Q2).
- One branch + git worktree per workstream: `v5/ws<N>-<slug>`, worktree at
  `../arcforge-v5/<ws-id>/` (sibling dir, outside the repo; removed after
  merge). Parallel waves = parallel worktrees.
- `main` is untouched until final maintainer review of `v5/main`.

### Auto-loop protocol (after approval)

Each iteration:
1. Read `v5-progress.md`; pick every workstream whose deps are `done`.
2. Dispatch one implementer agent per ready workstream into its worktree
   (parallel), carrying the workstream's grounding inventory + acceptance
   commands.
3. Agent implements, self-runs acceptance commands, reports.
4. Orchestrator **independently re-runs** the acceptance commands in the
   worktree (trust nothing — verifier doctrine), then merges green
   workstreams into `v5/main` and re-runs `npm test` there.
5. Update `v5-progress.md` (status + append iteration log entry).
6. Repeat until all `done` or a stop condition fires.

### Stop conditions (loop halts / lane blocks)

| ID | Condition | Action |
|----|-----------|--------|
| S1 | Workstream fails acceptance after **2** independent attempts | mark `blocked`, continue other lanes |
| S2 | ≥2 workstreams blocked, or a blocker gates all remaining work | **stop loop**, escalate to maintainer with evidence |
| S3 | `npm test` red on `v5/main` after a merge, not green after 1 fix attempt | revert the merge, mark lane `blocked` |
| S4 | Required change falls outside the workstream's grounded scope (new coupling discovered) | pause lane, escalate — no silent scope creep |
| S5 | Anything destructive beyond declared deletes (history rewrite, force-push, touching `~/.agents` / `~/.claude` real state, publishing) | **hard stop** |
| S6 | WS9: eval regression on a discipline skill, or INSUFFICIENT_DATA on a gate scenario | stop before tag, escalate (D5: ship only non-regressing) |
| S7 | An iteration completes with **zero** state transitions | stop — do not spin |
| S8 | Maintainer interrupt at any time | stop; progress artifact preserves resume state |

Sanctioned-exception file set (never edited by any sweep):
`CHANGELOG.md`, `SP6-PROGRESS.md`, `docs/plans/`, `docs/research/`,
`evals/benchmarks/`, `evals/results/`, `evals/workspaces/`,
`specs/*/spec.xml` (ratified anchors).

---

## Workstreams

### Wave 1 (parallel ×3)

**WS1 — Platform removal (Gemini/OpenCode)** · deps: none ·
inventory: `ground-platform.json` (41 items)
Delete `.gemini/`, `.opencode/`, `docs/README.{gemini,opencode}.md`,
`skills/arc-using/references/opencode-tools.md`,
`tests/node/test-opencode-plugin.js`, `tests/integration/opencode/`;
edit `check-version-sync.js` (10→9), `package.json` (files[],
description), README/CONTRIBUTING/CLAUDE.md/AGENTS.md/rules, 6 docs/guide
files (porting guide is the largest surface), 5 SKILL.md platform
mentions, website jsx **+ `npm run build:website`** (committed .js
artifacts), `.claude/skills/arc-releasing/` (SKILL.md "10-file" contract,
evals.json fixture, `arc-release-audit.js` grep list).
Acceptance: the 8 grounded commands — zero-ref grep (sanctioned
exceptions excluded), core-files grep, `check:versions`, `check:docs`,
website rebuild diff-clean, `npm test`, `npm run lint`.
Gotchas: check:docs doesn't scan CONTRIBUTING/docs/README.md/rules —
the grep gate is the only guard there.

**WS2 — Hook consolidation (behavior-preserving)** · deps: none ·
inventory: `ground-hooks.json` (27 items)
One sync PreToolUse dispatcher (arc-guard + sdd-ledger-guard +
sdd-ratify-guard), one sync PostToolUse dispatcher (quality accumulator +
arc-remind + compact-suggester counter/suggestion), observe pre/post stays
async-separate (entry count 7), SessionStart trio preserved (matcher
differences + CLAUDE_ENV_FILE bash injection), user-message-counter
standalone (stdin-passthrough quirk). Stable `id` per entry,
`ARCFORGE_DISABLED_HOOKS` (per-sub-hook granularity), fail-open wrapper at
dispatcher level with **per-subhook fault isolation**. Quality-check
becomes accumulate-per-edit + one prettier/tsc batch at Stop
(**documented behavior delta**: findings arrive at Stop via systemMessage;
files are no longer auto-formatted mid-task). observe fast-path exit
before requires when learning disabled; end.js `parseTranscript` behind
the diary-threshold check (**delta**: below-threshold session JSON loses
transcript enrichment — tripwire tests updated deliberately).
Critical invariants: `incrementSharedToolCount()` keeps firing on every
PostToolUse event (diary/reflect pipeline dies silently otherwise);
suggester state file path unchanged (pre-compact resets it); single
stdout JSON object per event (merge systemMessage/additionalContext);
sessionId re-derived per event.
Acceptance: 9 grounded commands — hook suite ≥333 green, the two `node -e`
consolidation/spawn-count proofs, e2e suite, rewritten registration
contract test (replaces quality-check.test.js:204-229), new dispatcher
parity + fault-isolation tests, observe disabled-path emits nothing,
`check-hooks-schema.js` green.

**WS6 — pytest structure-only conversion** · deps: none ·
inventory: `ground-testsEvals.json` (63 items)
Delete the 32 `test_skill_arc_*.py` files (~1,300 literal asserts);
create `test_skill_structure.py`: frontmatter parses, name==dirname,
description non-empty (<1024 chars combined), required sections per
category, cross-refs resolve (absorbs `test_skill_cross_references.py`),
referenced `references/*` + supporting files exist (absorbs the 54
`.exists()` checks), line budget with **temporary allowlist of the 15
currently-oversized skills** (burned down per WS7 PR; final allowlist =
2 entries), cwd-proof paths. Update materializer trio in lockstep:
`learning-drafts.js:46-62`, `learning.js:274-303`,
`tests/scripts/learning.test.js`. Update CONTRIBUTING:172/:314,
README:286, `.claude/rules/{skills,testing}.md`. Keep untouched:
test_eval_scenario_format, test_pressure_fixtures, contract tests,
plan-doc tests.
Acceptance: `npm run test:skills` green; zero `test_skill_arc_*.py`
remain; no-literal-prose grep; `npx jest tests/scripts/learning.test.js`;
line-budget loop (temp allowlist).
Accepted interim risk (D6): between conversion and WS9, iron sentences
have no mechanical tripwire — mitigated by WS7 review gates + WS9 evals.

### Wave 2 (parallel ×2, after WS2)

**WS3 — New guards + autopilot denies** · deps: WS2 ·
inventory: `ground-hooks.json`
dag-guard (clone sdd-ledger-guard's resulting-content machinery —
**extract shared module**, don't copy; TaskStatus monotonic + dependency
preservation; engine twin on the coordinator-core/loop/finish-epic write
path); secrets-guard warn-first (Write/Edit content + `git commit`,
test-credential allowlist); arc-guard `git -C` regex + resolved-target
marker check + Bash-redirect denies for gated ledger files; autopilot-only
denies gated on `loopSentinelPresent`: **narrower regex than
PR_BOUNDARY_RE** (deny `gh pr merge` / `git push` only — not `pr create`)
when test-seen counter == 0 or stale-eval predicate fires; reword
arc-remind nudges :147 (→ arc-reviewing, lands via WS4/WS5) and :173/:258
(point at running evals, not the arc-writing-skills skill name).
Acceptance: new guard tests (deny/allow/no-op invariant ×4 guards),
autopilot-deny tests (sentinel true/false × predicates), cross-event
sessionId counter test, full suite green.
Stop: any false-positive deny observed in self-test → that guard ships
warn-only, escalate.

**WS4 — Merges (two atomic commits)** · deps: WS2, WS6 ·
inventory: `ground-nameSweep.json` (43 items)
(a) arc-requesting-review + arc-receiving-review → `arc-reviewing`
(~140 lines; relocate `code-reviewer.md` template; arc-remind :147 +
test :49 flip in same commit; arc-using router rows :119-120 collapse;
retarget `eval-arc-requesting-review-dispatch-fidelity` Target).
(b) arc-observing → `arc-learning` (~170 lines; relocate
scripts/{observer-daemon.sh,observer-prompt.md,instinct.js} + tests/ to
skills/arc-learning/ preserving 3-deep depth for the ARCFORGE_ROOT
derivation; update the 4 silent hook/lib paths — start.js:83,
observe/main.js:364, batch-assembler.js:358, inject-context.js:106 — plus
package.json:39, 4 jest requires; arc-using router row :133).
Acceptance: WS4-LAYOUT-OK compound test, HOOK-SKILL-PATHS-RESOLVE probe,
ROUTER-SYNCED, `npm run test:observer-daemon`, jest instinct/curator
suites, full suite.

### Wave 3

**WS5 — Name-graph sweep** · deps: WS4 ·
inventory: `ground-nameSweep.json`
Sweep remaining old-name references (docs/guide/skills-reference sections,
README bullets :166/:167/:175/:202/:287, website jsx arrays :337-346 +
rebuild, `.claude/rules/architecture.md:57`, `.claude/rules/testing.md:19`,
CONTRIBUTING:318, arc-recalling :11/:72, arc-writing-skills :264 exemplar,
observe/README, arc-remind/README:12, skill-eval-coverage mapping note,
CHANGELOG mapping table seeded). Sanctioned exceptions stay untouched.
Acceptance: WS5-SWEEP-CLEAN + WS5-PATHS-CLEAN greps, `check:docs`,
website rebuild diff-clean, full suite.

### Wave 4 (parallel ×5 lanes)

**WS7 — Body diets, one lane per category** · deps: WS5, WS6 ·
targets: decision-record table (sdd: 8 skills; orchestration: 6;
discipline: 5 incl. merged arc-reviewing; memory: 6 incl. merged
arc-learning; knowledge+meta: 5). Correction: arc-researching 287→~185.
Rules per D7: cut rationale essays / digraphs / oversized examples /
contributor text; UNTOUCHABLE content preserved **verbatim** (Iron Laws,
rationalization tables, exact CLI invocations, state formats,
arc-finishing worktree-safety git mechanics, ARCFORGE_ROOT fallback
once-per-skill, REQUIRED SUB-SKILL/BACKGROUND markers); depth →
`references/*.md`. **D5 exemption criterion enforced per skill**: if any
gate/table/command wording changed, the skill is added to the WS9 re-run
list (tracked in progress artifact).
Per-lane acceptance: category line budgets met (temp allowlist entries
removed for this lane), `npm test`, `check:docs`, and an independent
reviewer agent confirms no load-bearing content was cut (diff review
against the UNTOUCHABLE list).

### Wave 5

**WS8 — Descriptions, frontmatter, index** · deps: WS7
Two-register description rewrite (all 30), DMI flags (3), `category:` +
lifecycle `status:` frontmatter, structure checker extended (description
length per register), README skill index rebuilt by category × register,
`docs/guide/skills-reference.md` rebuilt, rationale prose landed in
docs/guide pages, `test_minimal_toolkit_docs.py` edit pass (its literal
asserts will trip here — budgeted, not a bug).
Acceptance: structure checker green, `check:docs`, full suite, manual
description review against the D8 grammar.

### Wave 6

**WS9 — Eval re-baseline (v5 epoch)** · deps: WS7, WS8 ·
inventory: `ground-testsEvals.json`
Order matters: (1) commit/reconcile the untracked 2026-07-09 benchmark
snapshots FIRST (epoch ambiguity); (2) repair-or-retire the two flaky
anchors (`eval-arc-requesting-review-dispatch-fidelity` pass 0/10 →
retarget+repair for arc-reviewing; `eval-arc-evaluating-scenario-audit`
pass 0/5); (3) author the missing receive-half scenario for arc-reviewing
(arc-receiving-review had ZERO scenarios); (4) run the D5 set per-skill
(grounded command list; note arc-verifying/arc-researching/8 of 9
arc-evaluating scenarios have never produced a benchmark row — preflight
first); (5) run the 6 arc-learning `eval run` scenarios post-merge;
(6) `eval report` → v5 epoch; (7) add the DANGLING-TARGET sweep as a CI
check (today nothing fails statically on a dangling `## Target`).
Acceptance: every D5-scope scenario has fresh rows (silent-omission
guard: count them), no regression per S6, latest.json `generated` is
post-diet, dangling-target check wired and green.

### Wave 7

**WS10 — Release 5.0.0** · deps: all
CHANGELOG from the decision-record breaking list + old→new table; README
final pass; version bump across the 9 sync locations (`check:versions`);
Obsidian wiki re-ingest (skills are in wiki scope); `v5/main` → main
**after maintainer review**; tag; marketplace propagation; remove
worktrees.
Acceptance: `check:versions`, full suite, maintainer sign-off on the
`v5/main` diff (explicitly NOT auto-merged to main).

---

## Dependency graph

```
Wave1:  WS1(platform)   WS2(hooks-consol)   WS6(pytest)
                          │        │           │
Wave2:              WS3(guards)  WS4(merges)◄──┘
                                   │
Wave3:                        WS5(name sweep)
                                   │
Wave4:                WS7(diets ×5 category lanes)
                                   │
Wave5:                     WS8(descriptions)
                                   │
Wave6:                      WS9(eval epoch)
                                   │
Wave7:                      WS10(release) ── maintainer review gate
```

## Progress artifact protocol (`docs/plans/v5-progress.md`)

- Single source of truth for loop state; updated at every iteration end.
- Statuses: `awaiting-approval → ready → in-progress → verifying → done`
  | `blocked(reason)` | `stopped(Sx)`.
- Per-workstream: attempts count, last verified timestamp, evidence
  (acceptance command outputs / commit SHAs on `v5/main`).
- Append-only iteration log (newest first): what ran, what merged, what
  blocked, next picks.
- WS7 lane rows track the temp line-budget allowlist burn-down and the
  WS9 re-run list additions.
