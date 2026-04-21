# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [2.1.0] - 2026-04-21

**arc-evaluating v2 redesign.** A 47-commit, 7-epic minor release that rebuilds arcforge's measurement discipline from the inside out. v1's eval surface had six interlocking weaknesses (physical scattering, prose-only preflight, comparator with verdict authority, statistical cliff at k=3, grader limited to predefined assertions, divergent dashboard philosophies) — v2 fixes all six while preserving the canonical-source rule that keeps engine code at `scripts/lib/`. Each of the seven epics merged independently but ships together because the changes interlock: the verdict-authority strip and the INSUFFICIENT_DATA gate must land together, otherwise the analyzer agent could keep emitting shipping recommendations on data the harness flagged as insufficient. Validation methodology was `arc-writing-skills`' pressure-scenario RED/GREEN/REFACTOR — the existing `pytest` validators (`tests/skills/test_skill_arc_evaluating.py`, `tests/skills/test_eval_agents_contract.py`) stayed green throughout.

### Fixed

- **3 stale agent-path references in shipped surface.** `docs/guide/eval-system.md`, `skills/arc-evaluating/references/cli-and-metrics.md`, and `skills/arc-evaluating/references/grading-and-execution.md` still pointed at `agents/eval-grader.md` after the v2 folder consolidation. The implementation in `scripts/lib/eval-graders.js` was already loading from the correct `skills/arc-evaluating/agents/eval-grader.md` path — only the docs had drifted. Caught by the release-time outdated-docs audit; this is exactly the partial-migration class the audit step was designed to surface.
- **Dashboard: duration delta unit + condition toggle** (commit `e8ce209`). Duration delta was rendering in milliseconds where the surrounding chart used seconds; the condition toggle wasn't propagating the active-condition state to the chart re-render. Both fixes ride along with the v2 dashboard relocation rather than waiting for a separate dashboard-only release.
- **`arc eval lint` falsely rejecting valid `[tool_called]` behavioral assertions.** The lint parser stripped both `[ ]`/`[x]` markdown checkboxes AND `[tool_called]` behavioral markers when capturing assertion text, then `ASSERTION_ID_RE` rejected the bare remainder as missing an ID prefix. 10+ shipping scenarios in `evals/scenarios/` use `[tool_called]` assertions and would all have been rejected by `arc eval lint` despite running fine under `arc eval run`. Fix: distinguish behavioral brackets (group 1 matches `tool_\w+`) from checkboxes; preserve the bracket prefix on behavioral assertions. Caught by Codex pre-merge review.
- **`arc eval preflight` and the `eval ab` gate falsely blocking renamed scenarios.** Both `runPreflight` and `checkPreflightGate` hardcoded the lookup as `evals/scenarios/${name}.md`, while the rest of the eval CLI resolves scenarios by parsed `# Eval:` header via `findScenario`. Any scenario whose filename ≠ `# Eval:` value (e.g. after a file rename) would pass `arc eval run` but fail preflight with "scenario not found." Fix: preflight now uses the same iteration-by-parsed-name lookup, with literal-filename fallback preserved for legacy callers. Caught by Codex pre-merge review.
- **Blind comparator crash on skill names with regex metacharacters.** The sanitizer constructed `new RegExp(word, 'gi')` over each forbidden token; if `--skill-file` produced a name containing `+`, `(`, `[`, `\`, or other metachars, `arc eval ab` would crash inside `runBlindAutoTrigger` after trials had completed. Fix: escape regex metachars before constructing the RegExp. Caught by Codex pre-merge review (P1).
- **Blind comparator silently mapping unknown winner labels to B.** The mapping treated any value that wasn't `'tie'` or `'A'` as B-wins, so malformed comparator output (lowercase `'b'`, `'baseline'`, whitespace-padded `'B '`, etc.) was silently converted into a concrete baseline/treatment outcome — biasing the supplementary preference signal instead of surfacing the failure. Fix: explicit `winner === 'B'` branch; return null for any unrecognized value. Caught by Codex pre-merge review.
- **Blind comparator failures inflating tie counts.** When a blind comparison call failed, the autotrigger recorded `winner_original_label: null`. The preference-rate counter caught any non-`treatment`/`baseline` label as a tie, so failures were silently folded into the tie count and inflated the denominator. Fix: introduce an explicit `errors` field; only count actual `'tie'` labels as ties. The CLI now reports `errors: N/total (comparator failures, not folded into ties)` when nonzero. Caught by Codex pre-merge review.
- **Grading path divergence from run-JSONL path for non-alphanumeric scenario names.** `getGradingPath` derived the scenario directory via an ad-hoc `.replace(/[^a-zA-Z0-9-]/g, '-')`, while `parseEvalName` used `sanitizeFilename` (which preserves `_` and other characters). For a scenario named `my_scenario`, grading.json would land under `evals/results/my-scenario/...` while the run JSONL was at `evals/results/my_scenario/...` — splitting artifacts and breaking downstream audit/reporting. No current scenario triggers this (all use kebab-case), but the fix removes the latent divergence: `getGradingPath` now uses `sanitizeFilename` exactly like `parseEvalName`. Caught by Codex pre-merge review.
- **Preflight gate accepting unknown verdict values.** The gate only rejected `verdict === 'BLOCK'` and fell through to "cleared" for anything else. A corrupted or hand-edited preflight file with `verdict: "BLOCKED"` (typo), `"MAYBE"`, or a missing field would silently bypass the gate. Defense-in-depth fix: explicit `verdict === 'PASS'` requirement; everything else returns an error message. Caught by Codex pre-merge review.
- **Preflight failing open when baseline trials error out.** `runPreflight` computed `pass_rate` from `r.passed` only — so trials that failed with `infraError` (env setup, missing plugin dir) or `gradeError` (grader crash) silently counted as "ordinary failed trials." A scenario whose baseline trials all infra-errored produced `pass_rate=0%`, which is below the 80% ceiling, which yielded a false **PASS** verdict — letting `arc eval ab` proceed even though the scenario was never actually exercised. Fix: any errored trial in the preflight batch now produces an immediate `BLOCK` with an "errored trials, no signal" reason and `pass_rate: null`. Fail-closed semantics, matching the gate's intent. Caught by Codex pre-merge review (P1).
- **Path traversal in `/api/transcript` via sibling-directory prefix.** The dashboard's traversal guard used `resolved.startsWith(resultsDir)`, which matches not only paths inside `resultsDir` but also any sibling whose directory name *starts with* the resultsDir basename — e.g. `evals/results2/secret.txt` shares the `evals/results` string prefix and would have bypassed the check. Fix: require a real path-segment boundary (`resolved === resultsDir || resolved.startsWith(resultsDir + path.sep)`). Now `../results2/secret.txt`, `../results.bak/foo`, etc. all return 403. Caught by Codex pre-merge review (P1).

### Changed

- **`eval-comparator` renamed to `eval-analyzer` and stripped of verdict authority.** v1's `eval-comparator` emitted SHIP / RUN_MORE_TRIALS / INVESTIGATE recommendations on top of quantitative data the harness already had confidence intervals for — re-judging deterministic numbers via LLM, contradicting arcforge's own stored feedback that the harness owns verdicts. v2 splits the role cleanly: the harness keeps verdict authority (programmatic, see `references/verdict-policy.md`); the new `eval-analyzer` does post-hoc qualitative analysis only (explain the delta, identify non-discriminative assertions, assess variance). The CLI no longer parses verdict strings from this agent.
- **arc-evaluating SKILL.md body rewritten for v2.** The v1 body was 2082 words (Meta tier), and v2 adds preflight, verdict-policy, claim-extraction, and blind-comparator concepts on top. Per `arc-writing-skills`' Discipline-skill word budget, the v2 body had to fit under the Comprehensive tier (1800 words). The rewrite extracts detail into the three new reference files (see Added) and keeps SKILL.md focused on routing, the Rationalization Table for v2-specific excuses, and the Red Flags list for v2 failure modes. The frontmatter description stays triggering-only — never a workflow summary, since that shortcut is the discovery anti-pattern `arc-writing-skills` explicitly warns against.
- **arc-evaluating registered in `arc-using` Discipline Skills routing table.** Trigger condition: "About to ship, merge, or mark complete a skill, agent, or workflow". Iron Law: "No shipping claim without an eval run that does not return INSUFFICIENT_DATA". This makes the evaluation gate actively routed through the 1% rule rather than manually remembered — closing the v1 failure mode where contributors knew they should run an eval but routinely skipped it under time pressure.
- **Eval surface co-located in `skills/arc-evaluating/`.** Agent prompt templates migrated from project-root `agents/eval-grader.md` and `agents/eval-comparator.md` into `skills/arc-evaluating/agents/`. The dashboard moved from `scripts/eval-dashboard.js` + `scripts/eval-dashboard-ui.html` into `skills/arc-evaluating/dashboard/`. The harness uses `loadAgentDef()` prompt-template loading rather than `subagent_type` registration, so this was a physical move + path update — no `.claude-plugin/plugin.json` changes required. Engine code (`scripts/lib/eval*.js`) deliberately stays in canonical-source position per `.claude/rules/architecture.md`; relocating engine code was rejected as a cosmetic encapsulation win at the cost of a documented architectural invariant.
- **Dashboard rewrite.** Single UI at the new skill-folder location. Retained the SSE+file-watcher real-time monitoring channel (which was strong in v1 for in-flight trials and which skill-creator's static viewer can't do). Adopted skill-creator's two-tab layout (Outputs / Benchmark), auto-saving per-eval feedback textboxes, arrow-key trial navigation, and condition-toggle for A/B comparisons.

### Added

- **`INSUFFICIENT_DATA` verdict — hard gate when k < 5.** A 95% confidence interval requires enough data points for the t-distribution to produce a meaningful interval; below k = 5 the interval is too wide to distinguish a real improvement from sampling noise. v1's harness emitted SHIP from k=3 trials where no CI was ever computed (default for code-graded runs was k=3, but `eval-stats.js` only built CI95 when k≥5 — statistical rigor present in form, missing in fact). v2 makes INSUFFICIENT_DATA a hard gate for IMPROVED / REGRESSED / NO_CHANGE verdicts: shipping under INSUFFICIENT_DATA is shipping without statistical evidence, and the harness will not paper over that. Code-graded single runs are exempt (pass rate is deterministic, no interval to compute).
- **`arc eval preflight <scenario>` subcommand.** Runs 2–3 baseline pilot trials, computes pass rate, and blocks `arc eval ab` on the same scenario when baseline ≥ 0.8 (ceiling effect — no discriminative signal possible). Scenario hash (SHA-256 of raw file contents) is tracked so iteration is fast: bumping the Version field changes the hash and invalidates old preflight cache. Cache lives at `evals/preflight/<scenario_hash>.json` (gitignored). Brand-new scenarios pass automatically on first run since there's no baseline history to check. Also runs automatically as the first step of `arc eval run` and `arc eval ab`.
- **`arc eval lint <scenario>` subcommand.** Validates a scenario file against a JSON Schema covering required sections, Setup reproducibility, and Grader Config shape. Structural-only — does not run trials. Use this for early structural validation before baseline history exists, before the ceiling check is meaningful.
- **`arc eval audit` subcommand.** Aggregates `discovered_claims[]` and `weak_assertions[]` across the benchmark history and surfaces promotion candidates (claims passing in 3+ trials across 2+ scenarios with no contradictions) and retirement candidates (claims appearing in `weak_assertions` patterns or contradicted by the corpus). Promotion and retirement are deliberately **human-arbitrated** — automated promotion would create a feedback loop where the skill trains the eval which then expands the skill, drifting the canonical knowledge base without judgment. The audit output is a review document, not an action.
- **Grader extensions: `discovered_claims[]` and `weak_assertions[]`.** The model grader now extracts implicit claims from outputs ("the file has 12 fields", "query was parameterized") and verifies them independently, and critiques the predefined assertions it just evaluated. Both fields land in `grading.json` per trial. Neither affects the pass rate or the verdict — they feed `arc eval audit` for downstream human arbitration. This closes a v1 blind spot: skill-creator's grader did this and arcforge's didn't.
- **Per-trial metrics: `duration_ms`, `input_tokens`, `output_tokens`.** Recorded for every trial and persisted to the trial result file. The benchmark-report output exposes these as delta columns alongside the pass-rate delta in `arc eval compare` and `arc eval report`. Lets contributors see "this skill made the agent 2x slower for the same pass rate" or "tokens dropped 30% with no behavioral regression" — signals invisible in v1.
- **`eval-blind-comparator` agent.** Receives two anonymized outputs (Output A / Output B) and the original task prompt, derives a 3–5 criterion task-based rubric, scores each output independently on a 0.0–1.0 scale, and returns a winner ("A", "B", or "tie"). Critical constraint: the agent never knows which output came from which experimental condition, and must not use the words "baseline", "treatment", "with_skill", "without_skill", or any specific skill name in its reasoning. Auto-invoked after model-graded A/B runs as a supplementary signal alongside the main comparator; benchmark report shows assertion delta and blind preference rate side-by-side. Divergence between the two signals is itself a signal — investigate before shipping.
- **Three new reference files in `skills/arc-evaluating/references/`.** `preflight.md` (ceiling threshold 0.8, scenario hash mechanics, PASS/BLOCK semantics, exemption from INSUFFICIENT_DATA), `verdict-policy.md` (full verdict enum, asymmetric delta thresholds, INSUFFICIENT_DATA semantics, verdict-authority rules), `audit-workflow.md` (promotion/retirement arbitration steps, why human-arbitrated, relationship to grader output). Plus `grading-and-execution.md` extended with the `discovered_claims[]` and `weak_assertions[]` schemas, and `common-mistakes-catalog.md` for the full 23-entry mistake catalog (top mistakes stay inline in SKILL.md). This split was driven by the Discipline-skill word budget — keeping SKILL.md under 1800 words while making the full v2 surface knowable on demand.
- **Auto-trigger blind comparator for all-model A/B runs** (`fr-gr-005`). When `arc eval ab` runs with a model-graded scenario, the blind comparator runs automatically after the main comparison. No CLI flag required.
- **Dashboard: two-tab layout, auto-saving feedback, keyboard navigation, retained SSE** (`fr-dash-001` through `fr-dash-004`). Two tabs (Outputs / Benchmark) with URL-fragment state preservation, per-eval feedback textboxes that save on edit (no Save button), arrow-key navigation between trials, and the SSE real-time monitoring channel preserved through the refactor.
- **Obsidian vault knowledge: 1 Decision note + 5 wiki Source notes.** `Decision-ArcEvaluating-V2-Redesign` captures the rationale for the single-coherent-release approach (Option B) and why the canonical-source rule kept engine code at `scripts/lib/`. New Source notes for the three reference files and the two new agents (`eval-analyzer`, `eval-blind-comparator`). `MOC-ArcForge-Eval` refreshed with the v2 surface and a topic-map Mermaid diagram showing pre-trial gates / post-trial gates / audit flow. The renamed agent's Source note is preserved with a "renamed in v2.1.0" banner pointing readers to `eval-analyzer` — historical link graph stays intact rather than silently breaking backlinks.

## [2.0.0] - 2026-04-19

**Breaking release.** Spec-Driven Development (SDD) pipeline v2 redesign. No backward-compatibility shim and no in-tree migration tooling — v2 is a clean break for new specs. The new surface is intentionally stricter: the three upstream skills (brainstorming, refining, planning) now carry Iron Laws enforced by a deterministic validator in `scripts/lib/sdd-utils.js`, so malformed specs and drifting designs fail closed instead of silently producing inconsistent pipeline state.

### Changed

- **Per-spec directory layout (BREAKING).** `dag.yaml` moves from the repo root to `specs/<spec-id>/dag.yaml`. Each spec now owns its own `spec.xml`, `details/`, `dag.yaml`, and `epics/`. Worktree `.arcforge-epic` markers gained a `spec_id` field so the coordinator can update the correct per-spec DAG on sync. This is the minimum viable concurrency primitive — a security teardown sprint has no reason to share a DAG with an unrelated feature sprint. No migration tooling ships with v2 — the expectation is that v2 is adopted for new specs, not retrofitted onto live v1 layouts.
- **`scripts/lib/coordinator.js` became per-spec with lazy `dagPath` resolution.** No constructor eagerly computes a DAG path; each command resolves its own spec context. Multi-spec UX: `status` always aggregates across specs; `next` / `parallel` / `expand` / `loop` require `--spec-id <id>` when multiple specs exist (auto-detect otherwise); `merge` / `cleanup` accept positional epic ids; `sync` / `block` / `reboot` derive context from `.arcforge-epic` when run inside a worktree. Single-spec projects keep zero-flag ergonomics.
- **`arc-brainstorming` Iron Law: "NO DESIGN WITHOUT EXPLORATION FIRST".** New Phase 0 Scan and Route — the skill lists existing `specs/<spec-id>/` directories, asks the user to explicitly confirm "new topic" vs. "iterating on spec-id X", and writes one kind of design doc with conditional sections driven by filesystem state. Design doc output path changes to `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`. New rationalization explicitly forbidden: *"I'll pre-author the delta to save the refiner work"* — refiner is the delta authority, period.
- **`arc-refining` Iron Law: "SPEC IS THE WIKI — PRESERVE EVERY PRIOR DELTA. NEVER WRITE ON BLOCK".** Refiner is now the DAG completion gate keeper (blocks when any epic in `specs/<spec-id>/dag.yaml` is not `completed`), the delta authority (appends new `<delta>` to `<overview>` without overwriting prior deltas — wiki-style accumulation), and uses a Two-Pass Write pattern (build in memory → validate → atomic write only if zero ERRORs). Block behavior is terminal-only with zero filesystem state: no `refiner-report.md` artifact, no `--force` escape hatch, no partial writes. Clean retry semantics — fix the design doc, re-run.
- **`arc-planning` Iron Law: "PLANNER IS A PURE FUNCTION. DAG IS DISPOSABLE".** Signature: `(spec + latest_delta) → (specs/<spec-id>/dag.yaml + specs/<spec-id>/epics/)`. Planner MUST NOT read the design doc (three-layer separation enforced), MUST NOT write any gate (the gate lives in refiner), and overwrites `dag.yaml` every sprint with no archive sibling file. Previous epic statuses do NOT carry over — every epic starts `pending`. Git history is the only retroactive trace.
- **No "modes" in the pipeline.** Removed Path A / Path B / gamma mode / γ mode / initial / iteration / replace terminology from the three upstream skills. The refiner has one behavior that fills in version-dependent fields based on filesystem state; the design doc has one structure with conditional Context + Change Intent sections (when iterating) vs. prose (when new). These are not two modes — they are one behavior with context-sensitive content.
- **9 CLI commands updated for multi-spec UX.** `status`, `next`, `parallel`, `expand`, `merge`, `cleanup`, `sync`, `block`, `loop` all now honor per-spec semantics with the flag/auto-detect rules above.
- **Downstream skills gained per-spec path awareness.** `arc-coordinating`, `arc-using-worktrees`, `arc-finishing-epic`, and `arc-writing-tasks` read/write paths from `specs/<spec-id>/` and include single-spec dispatch gates where aggregation isn't possible.
- **`docs/guide/skills-reference.md` refreshed** to reflect new paths and the SDD v2 workflow (Two-Pass Write, DAG completion gate, latest-delta scope extraction, four delta operations). Removed stale `REFINER_INPUT section` references that no longer exist in the schema.

### Added

- **`scripts/lib/sdd-utils.js`** — deterministic validation layer and single source of truth for spec/design-doc schema. Exports: `DESIGN_DOC_RULES` + `parseDesignDoc` + `validateDesignDoc` for design docs; `SPEC_HEADER_RULES` + `parseSpecHeader` + `validateSpecHeader` for `spec.xml` identity header and `<overview>` structure; `checkDagStatus(dagPath)` for the refiner's gate. Rules live as constants in the module — skills reference them via `print-schema.js`, never embed. When skill text and validator disagree, the validator wins. This separates authoring (non-deterministic LLM) from validation (deterministic code), which was the prerequisite for trust.
- **`scripts/lib/print-schema.js`** — CLI that prints the canonical schema from `sdd-utils.js`'s rule constants. Usage: `node scripts/lib/print-schema.js design` or `... spec`. Stable user-facing contract for schema introspection; skills call this at REQUIRED BACKGROUND time to load the current schema verbatim.
- **Four-operation delta schema.** Added `<renamed ref_old="X" ref_new="Y">` as a first-class delta child type alongside `<added>`, `<modified>`, `<removed>`. Semantics: **body-unchanged only** — mechanical ref rename (grep + replace). `<renamed>` requires `ref_old` and `ref_new`; optional `<reason>`. Semantic changes must use `<removed>` + `<added>`, never `<renamed>` + `<modified>` (the validator enforces this). Emerged from the SDD v2 refactor itself needing mechanical renames that didn't fit the three-operation model.
- **Reason required in `<removed>` delta entries.** `<removed>` now MUST include a `<reason>` child; `<migration>` is optional. Both are read by the implementer LLM as teardown guidance — not archive commentary for humans. Write them with that reader in mind.
- **RFC 2119 language requirement + BDD criterion convention.** Every acceptance criterion MUST use MUST / SHOULD / MAY / MUST NOT, structured as Given/When/Then. No "should probably", "tries to", "usually" — validator produces warnings that block the Quality Checklist. Industry-standard way to write testable requirements; closes the LLM's tendency to produce soft, unverifiable language.
- **`specs/spec-driven-refine/`** — arcforge's own SDD v2 spec, formalized and iterated on-branch. This is the spec that drove the v2 redesign; it serves as both the historical record of the decisions and the canonical example of the new schema.
- **SDD v2 integration tests and eval scenarios.** `tests/integration/sdd-v2-pipeline/` exercises the full design → refine → plan → implement pipeline end-to-end with fixture regeneration. `evals/scenarios/arc-{brainstorming,refining,planning}-*` tighten the contract — any skill drift produces a failing eval before users see it. `tests/skills/` migrated to per-spec fixture layout with added multi-spec coverage.
- **Obsidian vault Decision notes** documenting the v2 shifts: `arcforge-decision-per-spec-layout`, `arcforge-decision-sdd-v2-skills-contracts`, `arcforge-decision-multi-spec-coordinator`, `arcforge-decision-spec-schema-formalization`. These complement the existing `arcforge-decision-sdd-v2-pipeline-realignment` (D1-D8 design decisions) with ship-level decisions (breaking changes, new CLI surface).

### Removed

- **Three-operation delta model.** Superseded by the four-operation schema (see Added). Pre-v2 specs continue to parse — the validator treats missing `<renamed>` entries as a non-error (empty array).
- **`REFINER_INPUT` section requirement** in design docs. Replaced by the unified schema: prose for new-spec formalization, Context + Change Intent for iteration. No separate required section; `parseDesignDoc` validates against `DESIGN_DOC_RULES`.
- **Mode vocabulary in pipeline skills.** Path A / Path B / gamma / γ / initial / iteration / replace terminology removed from `arc-brainstorming`, `arc-refining`, and `arc-planning`. Filesystem state is the source of truth for which fields apply.
- **`refiner-report.md` artifact.** Never written — refiner block behavior is now terminal-only (print errors + exit non-zero + zero filesystem state). Clean retry semantics; no stale state across invocations.
- **`arcforge backfill-markers` CLI command** (removed before the 2.0.0 release shipped). A pre-release iteration shipped this as a v1→v2 migration shim; it was pulled after confirming zero legacy users and that the shim itself had consistency holes (root `dag.yaml` fallback missing, legacy bare-epic branches not renamed). Clean-break contract stands on its own — no partial migration path.

## [1.4.1] - 2026-04-15

### Fixed

- **Diary enricher silently failing for ~30 days**: the Stop-hook background enricher (`spawnDiaryEnricher`) could not write to `~/.claude/sessions/...` because Claude Code v2.1.78+ added protection on nested Write tool calls inside `~/.claude/`. The error was invisible because the subprocess's stderr was piped to `'ignore'` and `--max-turns 2` exhausted the agent's budget before it could emit a Write. Result: 91 of 109 diary drafts sat as unenriched stubs. Fix: raise `--max-turns`, stop swallowing stderr, and move diary state to `~/.arcforge/` (see Changed)
- **Observer daemon split-brain after initial state move**: `observer-daemon.sh` still pointed at `~/.claude/instincts/` and `~/.claude/observations/` while the JS side had moved to `~/.arcforge/`. Daemon wrote lock/log to one tree, the hook read from another; SIGUSR1 coordination was broken and the daemon could not see new observations. Fix: rename `CLAUDE_DIR` → `ARCFORGE_DIR` in the bash daemon and repoint to `~/.arcforge/`
- **Leaky observer paths in `hooks/observe/main.js`**: the hook was reaching into `getInstinctsRoot()` to rebuild `.last_signal` and `.observer.lock/pid` paths inline — magic strings in hook code waiting to drift. Fix: add `getObserverSignalFile()` and `getObserverPidFile()` to `session-utils.js`; hook now uses the helpers, structural assumption lives in one place

### Changed

- **Consolidated all arcforge-owned state under `~/.arcforge/`**: sessions, diaries, instincts, diaryed, observations, and evolved directories moved from `~/.claude/` in a 3-commit sequence. Introduced `getArcforgeHome()` returning `~/.arcforge/`; deleted the `CLAUDE_DIR` constant entirely. After this, `~/.claude/` no longer holds any arcforge-owned state — Claude Code owns `~/.claude/`, arcforge owns `~/.arcforge/`, with no overlap. Existing user data migrated in place via `mv` (verified: 8 instincts still load from the new location post-migration)
- Path helpers in `scripts/lib/session-utils.js` now compose on `getArcforgeHome()`: `getProcessedLogPath`, `getObservationsPath`, `getInstinctsDir`, `getInstinctsArchivedDir`, `getGlobalInstinctsDir`, `getInstinctsGlobalIndex`, `getEvolvedLogPath`, and new `getInstinctsRoot` for the daemon coordination dir. `getInstinctsArchivedDir` composes on `getInstinctsDir` (one less repeat of the `<root>/<project>/` structural assumption)
- `scripts/lib/utils.js` `getDiaryedDir` repoints to `~/.arcforge/diaryed/`; `getSessionsDir` and diary path helpers repoint to `~/.arcforge/sessions/` and `~/.arcforge/diaries/`
- `scripts/lib/global-index.js` inner loop uses `getInstinctsDir(projName)` instead of reconstructing `path.join(instinctsBase, projName, ...)` — matches the canonical helper pattern
- `hooks/pre-compact/README.md`, `hooks/session-tracker/README.md`, `hooks/session-tracker/end.js`, `scripts/cli.js`, `scripts/lib/coordinator.js`, `scripts/lib/pending-actions.js`, `scripts/lib/worktree-paths.js`: path references updated to `~/.arcforge/`
- Skill SKILL.md files updated to reference `~/.arcforge/` paths: `arc-journaling`, `arc-learning`, `arc-managing-sessions`, `arc-observing`, `arc-reflecting`, `arc-using`, `arc-using-worktrees`; plus `arc-dispatching-teammates` baseline/green test fixtures
- `arc-journaling/scripts/auto-diary.js` and `diary.js`: emit paths under `~/.arcforge/sessions/`
- `arc-managing-sessions/scripts/sessions.js`: session list/save/load paths repointed
- `.claude/rules/architecture.md`: Worktree Isolation / `.arcforge-epic` marker section aligned with helper-based path derivation
- `docs/guide/skills-reference.md`, `docs/guide/worktree-workflow.md`: path references updated
- Test fixtures under `tests/skills/pressure/`: `arc-finishing-epic-completion-format.md`, `arc-using-path-reconstruction.md`, `arc-using-worktrees-cli-failure.md` use the current path format
- Minor: `tests/scripts/coordinator-marker-exclude.test.js` — fixed a stale comment referencing the pre-migration `~/.arcforge-worktrees/` path (and a "slinged" typo → "linked")

### Added

- `hooks/session-tracker/inject-context.js` (65 lines): injects session context at session start — part of the diary enricher's unblock (pre-creating the target path so the enricher Write becomes Edit)
- Diary enricher test coverage: `hooks/__tests__/diary-enricher.test.js` (128 lines, unit) and `hooks/__tests__/diary-enricher-e2e.test.js` (139 lines, E2E). The E2E suite prevents a future silent-failure regression — unit tests would have missed the original bug because the enricher's "failure" was Claude Code's subprocess exiting normally with no Write performed

## [1.4.0] - 2026-04-12

### Added

- **arc-dispatching-teammates** skill: Lead-present multi-epic parallel execution via Claude Code agent teammates. Fills the gap between `arc-coordinating` (single-epic interactive) and `arc-looping` (multi-epic unattended) — the discriminator is **attendance, not risk**. Caps at 5 teammates per Anthropic best practice; continuous dispatch as slots free; each teammate runs its own `/arc-implementing` → `arc-finishing-epic`
- **Obsidian bilingual notes**: All wiki-layer notes now dual-language (EN/ZH) using `[!multi-lang-{code}]` callouts. Includes `publish.js` + `publish.css` for runtime language switching on Obsidian Publish (with `MutationObserver` for SPA navigation and CSS fallback), plus `.obsidian/snippets/multi-lang.css` for local app toggling
- **Paper variant** for arc-maintaining-obsidian Source template: academic paper extraction with `reading_status` (queued/skimmed/deep-read/extracted), `methodology`, `venue`, `year`, `cites`, `cited_by`, structured Claims section (evidence + basis + status), and citation-aware propagation that auto-resolves `cites:`/`cited_by:` cross-references on ingest
- **QMD hybrid search** integration in arc-maintaining-obsidian: prefers QMD (keyword + semantic + reranking) over `obsidian-cli search` for vault discovery; includes Index Sync step (`qmd update && qmd embed`, ~3s incremental) after each ingest or audit cycle to keep new notes searchable
- **Visuals decision framework** in arc-maintaining-obsidian ingest pipeline: 4-question decision tree (image embed → entity count → relational test → spatial complexity) with Embed/Mermaid/Canvas/Excalidraw tiers. Mermaid is the default output when content is relational; Canvas and Excalidraw require user approval
- **Index pipeline step** in arc-maintaining-obsidian: ingest now writes `Classify → Confirm → Create → Visuals → Index → Propagate → Log` — `index.md` gets incremental one-line additions per new note, keeping the catalog current between full audit rebuilds
- `scripts/lib/worktree-paths.js`: Canonical path helper (`getWorktreePath`, `parseWorktreePath`, `hashRepoPath`, `getWorktreeRoot`) computing `~/.arcforge-worktrees/<project>-<hash>-<epic>/` from the absolute project root. Replaces hardcoded `.worktrees/` paths throughout the engine
- `expand --epic <id> --project-setup` CLI mode: single-epic worktree expansion with auto-detected dependency install (npm/pnpm/yarn/bun via `detectPackageManager()`, pip via `pyproject.toml` or `requirements.txt`, cargo, go). `package-manager.js` adds `getDefaultInstallCommand()` routing to the project's actual package manager — no more hardcoded `npm install`
- `docs/guide/worktree-workflow.md`: Authoritative bilingual (EN/ZH) human guide covering path derivation rules, `.arcforge-epic` marker schema, cleanup semantics, sync flow, and troubleshooting. All skills and rules defer to this doc for the full story
- `.claude/rules/dev-context.md`: Contributor-facing rule separating dev-environment facts (project-level plugin disablement, `--plugin-dir .` workflow, Ships/No-ship audience table) from shipped surface. Introduces the audience-separation principle: contributor-only concerns never belong in skills, hooks, commands, agents, templates, engine, or user docs
- `tests/skills/pressure/`: New pressure test fixture format for discipline skills (`arc-using-path-reconstruction`, `arc-using-worktrees-cli-failure`, `arc-finishing-epic-completion-format`) plus `test_pressure_fixtures.py` runner and `README.md` documenting the format
- `tests/scripts/worktree-paths.test.js`: 150+ line Jest suite covering hashing, path derivation, parsing edge cases, and sanitization
- Skill test: `tests/skills/test_skill_arc_dispatching_teammates.py` (163 lines, frontmatter + structure validation)
- Design docs: `docs/plans/2026-04-09-obsidian-bilingual-notes-design.md`, `docs/plans/2026-04-10-arc-dispatching-teammates-design.md`
- Task list: `docs/tasks/bilingual-notes-tasks.md`
- arc-maintaining-obsidian evals: 2 new scenarios (`synthesis-with-relationships-should-mermaid`, `simple-source-should-skip-visuals`) to discriminate the Visuals decision framework
- `assets/arcforge-overview.png` (README diagram — referenced from the Skills Connect section)
- `normalizeStatus()` in `scripts/lib/dag-schema.js`: maps agent-written status aliases (`done`/`finished`/`complete` → `completed`) and rejects unknown values, providing defense-in-depth for status values that bypass the `TaskStatus` enum
- `_dagTransaction()` helper in `scripts/lib/coordinator.js`: serializes read-modify-write access to `dag.yaml` under file lock — fresh read under lock, mutation, conditional write — preventing concurrent teammate processes from clobbering each other's status updates
- `_ensureArcforgeExcluded()` in `scripts/lib/coordinator.js`: adds `.arcforge-epic` to the main repo's `.git/info/exclude` at expand time, preventing teammates' `git add -A` patterns from staging the worktree marker. Uses `git rev-parse --git-common-dir` because linked worktrees share exclude config with the main repo
- `arc-dispatching-teammates` reference docs: `references/acceptance-and-retry.md` (subagent-gated acceptance, retry loop mechanics, spec-defect override protocol), `references/spawn-prompt-template.md` (full authority grant template with retry feedback section), `references/tmux-timing-race.md` (GH #40168 parallel dispatch fallback), `references/wrap-up-sequence.md` (three-action teardown: report → cleanup → TeamDelete)
- Race condition test suite: `tests/scripts/coordinator-merge-race.test.js`, `coordinator-expand-race.test.js`, `coordinator-marker-exclude.test.js`, and shared `coordinator-test-helpers.js`
- Design doc: `docs/plans/2026-04-11-coordinator-dag-transaction-sweep.md` (deferred cold-path transaction sweep for `completeTask`, `blockTask`, `cleanupWorktrees`)
- Task list: `docs/tasks/sync-status-validation-tasks.md` (7-task TDD plan for status validation)

### Changed

- **arc-diagramming-obsidian — full rewrite as hybrid EA+Playwright render-validate pipeline with HARD/SOFT layer structure and subagent delegation.** Restructured SKILL.md into two explicit layers: **HARD** (physical/mechanical invariants the tools can verify — theme detection, view-PNG-every-iteration, save verification, EA reset / id / anchor rules) and **SOFT** (concept judgments — what to add, scale reflects real importance, isomorphism self-check as heuristic not gate, Painter's Toolkit as vocabulary not menu). Pipeline reframed from 3 phases to 4: `DESIGN → BUILD → VALIDATE → SAVE`, with DESIGN now explicit (Think First, pattern + brushes, Layout Trap Audit before any EA code). Introduces three subagents that let the lead keep context clean on complex diagrams — `diagram-builder` (executes EA code from a design spec), `diagram-validator` (runs the 3-iteration render-fix loop), `diagram-saver` (persists via `ea.create()` and runs `verify_saved_diagram.py`). Added four reference docs: `depth-enhancements.md` (Research Mandate, Multi-Zoom, Evidence Artifacts for comprehensive-technical depth), `layout-heuristics.md` (Part 1 grid planning + Part 2 fix strategies), `painters-toolkit.md` (shape variety, subtitles, zone labels, containers, accents, separators, footers, size suggestions), `save-format.md` (byte-exact `.excalidraw.md` canonical template for the manual-fallback save path). New Python helpers under `references/`: `plan_layout.py` (automatic coordinate computation for 20+ elements), `check_overlaps.py` (bounding-box overlaps, arrow-text crossings, text collisions), `render_excalidraw.py` (Playwright headless render producing diagram-only PNGs without Obsidian chrome), `verify_saved_diagram.py` (post-save format-marker check + optional re-render and size-compare to catch JSON corruption); `render_template.html` + `pyproject.toml` round out the toolkit. Preferred save path is now `ea.create()` via `obsidian eval` (uses the documented `ea.elementsDict` public property) with the manual byte-exact write as fallback. Codifies the **Layout Trap Audit** — four recurring arrow-path collisions (converging-arrow corridors, back-edge horizontal routes, decision-diamond yes/no labels, back-edge label X-coordinates) that are cheaper to prevent at design time via mental trace than to fix at rendered-pixel level. Reverts the short-lived ExcalidrawAutomate-only approach (15512c6) in favor of the hybrid pipeline. Effect: higher-quality diagrams with fewer layout traps, verifiable saved output, and a clean separation between mechanical rules the tooling enforces and concept judgments the author must exercise.
- **Worktree location migration**: moved from in-repo `.worktrees/<epic>/` to home-based `~/.arcforge-worktrees/<project>-<hash>-<epic>/`. The 6-char sha256 prefix of the absolute project path prevents collisions between multiple clones of the same repo. All skills, rules, tests, and agent output stop hardcoding worktree paths — the path is derived at runtime via `scripts/lib/worktree-paths.js` and surfaced through `arcforge status --json`
- **`arc-using` Worktree Rule** now enforces **four** norms (previously three): no hardcoded paths, no manual `git worktree add`, enter via `arcforge status --json`, and — new — **direct file-editing tools are restricted to the session owning `.arcforge-epic`**. A session "owns" the side whose cwd contains the marker; to modify worktree code from base, start a fresh agent session in the worktree path instead of reaching across. This sidesteps out-of-cwd permission issues most agent platforms enforce
- **Cleanup semantics**: `coordinator.cleanup` now removes directories via `fs.rmSync` then runs a single `git worktree prune` pass. Replaces the per-epic `git worktree remove --force` with fallback — cheaper (O(1) git invocations instead of N) and works around git's refusal to remove worktrees that contain the untracked `.arcforge-epic` marker
- **Subprocess I/O**: install and test subprocesses (`_runSubprocess`) now use `stdio: 'inherit'` — streams output directly to the parent terminal. Avoids `execFileSync`'s 1 MB `maxBuffer` which long-running `npm install` / `cargo build` / `pip install` could exceed and incorrectly report as ENOBUFS
- **`arc-using-worktrees`**: simplified to a thin wrapper around `node "${SKILL_ROOT}/scripts/coordinator.js" expand --epic <id> --project-setup`. All path derivation, marker writing, and dependency install delegated to `scripts/lib/coordinator.js` — the skill is now ~180 lines down from ~400
- **`arc-finishing-epic`**: completion format now reports absolute worktree paths sourced from `arcforge status --json` (or `(removed)` when cleaned up), never reconstructed from pattern knowledge. Added explicit Step 4.6 "Look Up the Worktree Path"
- **`arc-coordinating`** Merge From Worktree: base detection now uses `parseWorktreePath()` to recognize which `git worktree list` entries are arcforge-managed — no more string-matching `.worktrees`
- **`arc-maintaining-obsidian`** Mode Entry Gate: each mode (ingest/query/audit) now reads its reference file before executing. Skipping the gate causes cascading errors (improvised schemas, missed pipeline steps, wrong extraction methods)
- **`arc-maintaining-obsidian`** raw-first ingest: Raw Source ingest always saves the immutable original to `Raw/` before creating the wiki Source note. Conflating "what the source said" with "what I understood" would lose re-extraction ability
- **`arc-maintaining-obsidian`** vault-only answers extend to surrounding commentary — query mode never fills gaps with general knowledge in framing, insights, or comparisons around vault results; surfaces gaps as GROW suggestions instead
- **`arc-maintaining-obsidian`** broken wikilink resolution strategy: choose based on Raw Source backing + reference count (3+ refs → flag for user, 1-2 refs → convert to plain text). Never create stub entity notes without source backing
- **`arc-maintaining-obsidian`** LINT verify-before-fix: findings are hypotheses, not facts — read the actual file before acting on reported issues (fixes common false positive with YAML multi-line `tags:` lists)
- **`arc-maintaining-obsidian`** LINT correctly skips Excalidraw `.md` drawings (`excalidraw-plugin: parsed` frontmatter) during audit
- **`docs/guide/skills-reference.md`**: added `arc-dispatching-teammates` entry with platform marker; platform-only markers added to `arc-looping`, `arc-evaluating`, `arc-observing`, `arc-managing-sessions` flagging them as Claude Code only
- **`README.md`**: `arc-dispatching-teammates` added to Execution Layer skill list; version badge bumped
- **`.claude/rules/architecture.md`**: Worktree Isolation section rewritten to describe home-based canonical path + `worktree-paths.js`
- **`hooks/hooks.json`** loader now supports the sync fix (see Fixed)
- **`arc-dispatching-teammates`**: reworked with subagent-gated acceptance check (dispatch `arcforge:spec-reviewer` + `arcforge:verifier` per teammate completion — lead reads reports and decides, does not run checks inline), retry loop (up to 3 retries per epic with cumulative feedback in spawn prompt), wrap-up sequence (emit Final Report with per-epic subagent evidence → cleanup accepted worktrees → shut down teammates → `TeamDelete`), per-completion teammate shutdown to prevent tmux pane accumulation, spec-defect override protocol (distinguish spec defects from impl defects via independent grep evidence), and TaskUpdate visibility warning (TaskUpdate is not a notification channel — completion must go through SendMessage). Spawn prompt template extracted to `references/spawn-prompt-template.md` with explicit `## Your Authority` section that prevents mid-phase stalling
- **`arc-finishing-epic`**: added Step 4.1 Merge Conflict Handling — multi-teammate merge conflicts escalate to lead via SendMessage using a structured `Merge Conflict (Multi-Teammate)` blocked format (conflict files, hunks verbatim, proposed resolution, risk assessment); solo-epic conflicts present to user for resolution guidance. Never auto-resolve by taking ours/theirs/guessed union
- **Coordinator DAG mutations**: `_mergeEpicsInBase` now updates `.arcforge-epic` marker to `completed` after merge (prevents sync from overwriting DAG's correct `completed` back to stale `in_progress`); `expandWorktrees`, `_syncWorktree`, `_syncBase`, and `syncEpicStatusesFromBase` wrapped in `_dagTransaction` to prevent concurrent teammate race conditions; both sync paths validate `local.status` via `normalizeStatus()` before propagating to DAG

### Fixed

- **`inject-skills` hook race condition**: the hook was registered with `"async": true`, so its output (the arc-using routing layer) arrived *after* the first assistant turn for spawned teammate subagents. The race was invisible for interactive user sessions because humans type slowly, but fatal for teammate spawns where the first prompt is delivered immediately. Removed `async: true` — the hook now fires synchronously on `SessionStart` (~829ms) and teammates reliably receive routing discipline. Root cause identified during arc-dispatching-teammates PoC (3 rounds of behavioral verification — LLM self-introspection about system prompt contents proved unreliable, so verification had to use exact-string behavioral tests)
- **`--project-setup` package manager selection**: previously hardcoded `npm install`. Now routes through `detectPackageManager()` so pnpm/yarn/bun projects use their own installer instead of corrupting the lockfile with the wrong tool
- **`git worktree remove` failures on `.arcforge-epic` marker**: git refused to remove worktrees containing the untracked marker file. Replaced with direct `fs.rmSync` + one `git worktree prune`
- **ENOBUFS on long installs**: `npm install`/`cargo build`/`pip install` no longer risk ENOBUFS thanks to streamed stdio (`_runSubprocess` with `stdio: 'inherit'`)
- **Retracted: false `claude -p` subprocess bug**: a prior debugging note claimed `arc-looping`'s `claude -p` subprocesses did not fire arcforge hooks. Controlled re-test from a neutral directory (`/tmp/loop-hook-test/`) proved this was contamination from running tests inside arcforge's dev repo, where `.claude/settings.json` deliberately disables the arcforge plugin at project level. All past eval results remain valid; the root fact has been moved to `.claude/rules/dev-context.md` per the audience-separation principle (contributor concerns never belong in shipped surface)
- **`marketplace.json` version drift**: `.claude-plugin/marketplace.json` was stuck at 1.2.0 (last manually updated two versions ago) while `plugin.json` and `package.json` had moved on. Synced all three version sources to 1.4.0 as part of this release
- **DAG read-modify-write race condition**: concurrent teammate processes (merge, expand, sync) could load stale `dag.yaml` snapshots, mutate independently, and the second save would clobber the first — leaving an epic stuck at `in_progress` despite its branch being merged successfully. `_dagTransaction()` serializes all hot-path mutation paths under a single file lock with fresh-read-before-mutate semantics
- **`done` vs `completed` status bug**: agent-written `.arcforge-epic` marker values (`done`, `finished`, `complete`) bypassed the `TaskStatus` enum, breaking `_getBlockedBy()` dependency resolution — downstream epics remained blocked despite their dependencies being complete. `normalizeStatus()` maps known aliases to canonical values and throws on unknown
- **`.arcforge-epic` marker stale after merge**: `_mergeEpicsInBase` set `epic.status = TaskStatus.COMPLETED` in the DAG but never updated the worktree marker, which retained `in_progress` from expand time. Subsequent sync would overwrite the DAG's correct value with the stale marker value, un-completing the epic
- **`.arcforge-epic` leaking into git commits**: teammates' blanket `git add -A` / `git add .` patterns staged the worktree marker file, which appeared in commit history after merge. `_ensureArcforgeExcluded()` writes the marker to `.git/info/exclude` (linked worktrees share this via `commondir`)
- **Teammate pane accumulation**: completed teammates were not shut down between dispatches during continuous dispatch, causing tmux panes to accumulate and eventually hitting pane limits. Per-completion shutdown in Step 6/7 keeps active pane count ≤5

### Removed

- `.worktrees/` in-repo worktree directory (and its `.gitignore` entries) — superseded by the home-based canonical location
- `_ensureWorktreesIgnored()` helper — orphaned after the migration
- `_runTestCommand()` internal — replaced by the generic `_runSubprocess()` used by both test verify and project setup
- `skills/arc-using-worktrees/baseline-test.md` — consolidated into the new `tests/skills/pressure/` fixture format

## [1.3.1] - 2026-04-08

### Fixed

- **arc-maintaining-obsidian**: Added Mode Entry Gate — each mode (ingest/query/audit) must read its reference file before executing, preventing improvised schemas and missed pipeline steps
- **arc-maintaining-obsidian**: Raw Source ingest now enforces "raw first, wiki second" — saves immutable original to `Raw/` before creating the wiki Source note, preserving the ability to re-extract and verify
- **arc-maintaining-obsidian**: URL extraction defaults to Defuddle over WebFetch — WebFetch returns AI-interpreted HTML while Defuddle renders in a real browser and extracts clean markdown faithful to the original
- **arc-maintaining-obsidian**: Vault-only answers now extend to surrounding commentary — no general knowledge backfill in framing, insights, or comparisons around vault results
- **arc-maintaining-obsidian**: LINT now requires verify-before-fix — findings are hypotheses, not facts; must read the actual file before acting on reported issues
- **arc-maintaining-obsidian**: LINT warns about YAML multi-line list false positives — `tags:` with no inline value is not empty if followed by indented `  -` items
- **arc-maintaining-obsidian**: Added broken wikilink resolution strategy — checks Raw Source backing, reference count, and offers plain text conversion instead of creating unsourced stub entities
- **arc-maintaining-obsidian**: Excalidraw `.md` drawings (with `excalidraw-plugin: parsed` frontmatter) now correctly skipped during LINT audit
- **arc-maintaining-obsidian**: Raw Source frontmatter template added (`source_url`, `source_author`, `fetched`) for traceability of immutable originals

## [1.3.0] - 2026-04-08

### Added

- **arc-maintaining-obsidian** skill: Unified Obsidian vault skill — merged arc-writing-obsidian, arc-querying-obsidian, and arc-auditing-obsidian into one skill with three modes (ingest, query, audit). Implements Karpathy's LLM Wiki pattern with PROPAGATE (cross-page update on ingest), EVOLVE checks, and outward GROW.
- **arc-diagramming-obsidian** skill: Excalidraw diagram generation with JSON direct write, render-validate loop, and cool minimal color palette
- **arc-querying-obsidian** skill: Vault-only query with inline citations and file-back capability (later merged into arc-maintaining-obsidian)
- **Obsidian knowledge base**: 83 wiki notes (62 Source + 11 Entity + 5 Synthesis + 5 MOC) published at https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge — covers all skills, rules, agents, templates, guides, designs, and research
- `.claude/rules/obsidian-wiki.md`: Scope definition for what project artifacts belong in the wiki
- `.claude/rules/eval.md`: Evaluation framework rules (extracted from inline guidance)
- `.md` extraction method in `page-templates.md` for ingesting plain markdown files from `Raw/`
- `docs/guide/eval-system.md`: Core eval mechanism guide (A/B testing, discriminative scenarios, grader types)
- arc-researching refinements: Strategy selection, trial management, external research integration

### Changed

- **arc-researching** skill: Trimmed to 1776 words (under 1800 budget), added strategy/trials/external research sections
- Obsidian skills: Added obsidian-cli pipe safety warning (never pipe `obsidian read` through head/tail), path safety guidance (`file=` vs `path=`), progressive disclosure in token efficiency section
- Eval harness: Added `--no-isolate`, `--plugin-dir`, `--max-turns` flags; behavioral assertions with deterministic grading; mixed grader support; action log display in dashboard
- `docs/` folder: Removed 263KB of auto-generated reference dumps and superseded design docs — wiki knowledge base is now the authoritative documentation source

### Fixed

- **obsidian-cli pipe safety**: `obsidian read` hangs on SIGPIPE when piped through `head`/`tail` — documented workaround (read full output or use Read tool)
- **eval option resolution**: Simplified eval settings consolidation, fixed double maxTurns resolution and maxBuffer bug
- **YAML flow array parsing**: Fixed parsing of inline YAML arrays in DAG state sync
- **arc-verifying invocation**: Removed self-contradicting "don't invoke me" prohibition from a routing-table-registered skill
- **loop epic scoping**: Simplified loop epic detection after code review feedback

### Removed

- **arc-writing-obsidian**, **arc-querying-obsidian**, **arc-auditing-obsidian**: Merged into arc-maintaining-obsidian (one skill, three modes)
- `docs/guide/architecture-overview.txt` (47KB), `cli-reference.txt` (96KB), `skills-workflow.txt` (56KB), `skill-loading-platforms.txt` (54KB), `workflow-overview.txt` (9.5KB): Auto-generated reference dumps replaced by Obsidian wiki knowledge base
- `docs/plans/2026-04-07-obsidian-skills-design.md`, `obsidian-skills-improvements-design.md`: Superseded by arc-maintaining-obsidian merge design
- `docs/research/gemini-cli-skills.md`: Stale stub (12 lines, 3 months old)

## [1.2.0] - 2026-03-31

### Added

- **arc-compacting** skill: Strategic manual compaction timing at workflow phase boundaries
- **arc-evaluating** skill: Measure whether skills, agents, or workflows change AI agent behavior — with progressive-loading references (`cli-and-metrics.md`, `common-mistakes-catalog.md`, `grading-and-execution.md`)
- **arc-looping** skill: Autonomous loop execution with cross-session DAG task coordination
- **arc-managing-sessions** skill: Session save/resume with alias support and cooperative auto-memory coexistence
- **arc-researching** skill: Autonomous hypothesis-driven experimentation for metric optimization ("fixed judge + free player" pattern)
- 9 scoped rule files in `.claude/rules/` — extracted from monolithic CLAUDE.md for context-aware loading: architecture, coding-standards, git-workflow, hooks, plugin, security, skills, templates-commands-agents, testing
- 9 new agent definitions in `agents/`: debugger, eval-comparator, eval-grader, implementer, loop-operator, planner, quality-reviewer, spec-reviewer, verifier
- `AGENTS.md`: Agent catalog for Codex platform discovery
- Eval infrastructure: per-assertion code grading engine (`eval-graders.js`), statistics aggregation (`eval-stats.js`), core eval engine (`eval.js`), transcript parser (`transcript.js`)
- Eval dashboard: `eval-dashboard.js` + `eval-dashboard-ui.html` — web UI with collapsible artifacts panel and audit trail
- Eval scenarios: 11 new scenarios (debug-investigate-first, debug-stop-at-three, diary-quality, eval-grader-selection, eval-scenario-splitting, eval-trap-design, hook-inject-skills, instinct-adherence, reflect-pattern-detection, tdd-compliance) + eval skill-files for instinct testing
- Eval benchmarks: JSON snapshots for 2026-03-19, 2026-03-20, 2026-03-23
- Research dashboard: `research-dashboard.js` + `research-dashboard.html` — live monitoring with SSE and inline SVG charts
- Loop execution engine: `scripts/loop.js` for autonomous cross-session execution
- Session management: `session-aliases.js` for alias-based session tracking, `session-utils.js` expanded with new helpers
- `commands/sessions.md`: Thin delegation wrapper for session management
- `docs/guide/hooks-system.md`: Comprehensive hooks I/O visibility rules and contributor guide
- `hooks/log_lightweight/`: Refactored Python logging into 6-module package (config, dispatcher, io_writer, state, tokens, tools)
- `hooks/run-hook.cmd`: Windows-compatible hook dispatcher
- `arc-writing-skills/agents/`: 4 eval subagent definitions (description-tester, skill-analyzer, skill-comparator, skill-grader) + `references/eval-schemas.md` and `testing-skills-with-subagents.md`
- Tests: `e2e-hooks.test.js` (36 behavioral tests with real Claude Code fixtures), `observe.test.js`, `pre-compact.test.js`, `quality-check.test.js`, `coordinator.test.js`, `eval-dashboard.test.js`, `eval-integration.test.js`, `eval-stats.test.js`, `eval.test.js`, `locking.test.js`, `loop.test.js`, `package-manager.test.js`, `research-dashboard.test.js`, `session-aliases.test.js`, `session-listing.test.js`, `transcript.test.js`, `utils.test.js`, `test-models.js`, `test-yaml-parser.js`, `test_eval_agents_contract.py`, `test_eval_scenario_format.py`, `test_skill_arc_evaluating.py`

### Changed

- `CLAUDE.md`: Slimmed from 69 to 28 lines — bulk content extracted to `.claude/rules/` for scoped loading
- `arc-evaluating/SKILL.md`: 8 targeted improvements from research loop — restructured for token budget with progressive-loading references; added "competence proxy" and "skill formalizes existing behavior" to Common Mistakes
- `arc-agent-driven/SKILL.md`: Enhanced with eval-aware subagent dispatching
- `arc-writing-skills/SKILL.md`: Updated to reference new eval agents and testing-with-subagents guide
- `arc-brainstorming/SKILL.md`, `arc-observing/SKILL.md`, `arc-planning/SKILL.md`, `arc-refining/SKILL.md`, `arc-using/SKILL.md`: Minor refinements (cross-references, SKILL_ROOT, eval hooks)
- Hooks output visibility: user-facing messages switched from stderr (invisible in Claude Code) to `systemMessage` JSON format across observe, pre-compact, quality-check, and compact-suggester hooks
- `hooks/compact-suggester/main.js`: Refactored to unified `{ tools, reads, writes }` JSON state; separated compact counter from diary counter
- `hooks/session-tracker/inject-context.js`: Major refactoring for session alias support and cooperative auto-memory
- `hooks/session-tracker/end.js`: Enhanced session finalization with alias tracking
- `hooks/log-lightweight.py`: Refactored from monolithic 887-line file into 6-module package under `hooks/log_lightweight/`
- `scripts/cli.js`: Added `arc eval dashboard`, `arc research dashboard`, loop commands, and session management subcommands
- `scripts/lib/coordinator.js`: Enhanced DAG coordination with new status helpers
- `scripts/lib/models.js`: Added TaskStatus export from dag-schema
- `scripts/lib/dag-schema.js`: Added TaskStatus enum export
- `scripts/lib/utils.js`: Added new utility functions for eval and session support
- `README.md`: Updated skill descriptions and documentation links
- `CONTRIBUTING.md`: Updated hook architecture section

### Fixed

- **Hook stdin crash**: `log-lightweight` dispatcher crashed on empty stdin — now handles gracefully
- **Hook field name**: SessionStart event sends `source` field, not `trigger` — fixed across all hooks that read session start reason
- **Hook output invisible**: stderr output not visible to users in Claude Code — switched to `systemMessage` JSON protocol
- **Counter collision**: compact-suggester and diary hooks shared a counter, causing incorrect compaction timing — separated into independent counters
- `hooks/compact-suggester/README.md`: Corrected storage path documentation (`arcforge-tool-count` → `arcforge-compact-state`)
- `skills/arc-managing-sessions/SKILL.md`: Fixed command name references (`/sessions` → `/arc-managing-sessions`)
- `skills/arc-journaling/SKILL.md`: Fixed cross-reference to session commands

### Removed

- `.serena/memories/`: 4 legacy memory files (code_style_and_conventions, project_overview, suggested_commands, task_completion_checklist) — replaced by `.claude/rules/`
- `hooks/lib/package-manager.js`, `hooks/lib/thresholds.js`, `hooks/lib/utils.js`: Removed hook-local re-exports — hooks now import directly from `scripts/lib/`

## [1.1.2] - 2026-02-14

### Added

- `scripts/lib/evolve.js`: Three-type evolution engine — classifies instinct clusters into skills, commands, or agents via domain+confidence rules with keyword tiebreaker
- `learn.js generate` command: Creates skill, command, or agent scaffolds from clustered instincts (`--type`, `--name`, `--dry-run`)
- `learn.js list` command: Shows previously evolved artifacts from JSONL tracking log
- `session-utils.js`: `getEvolvedLogPath()` helper for `~/.claude/evolved/evolved.jsonl`
- Resistance-based confidence: `MANUAL_CONTRADICT_DELTA`, `MANUAL_DECAY_PER_WEEK`, `RESISTANT_SOURCES` for source-aware scoring
- Tests: `evolve.test.js` (358 lines), `confidence.test.js` additions (118 lines), `learn.test.js` (135 lines)

### Changed

- `confidence.js`: `applyContradiction()` accepts optional `source` — manual/reflection instincts receive half-strength contradiction (-0.05 vs -0.10)
- `confidence.js`: `runDecayCycle()` applies source-aware decay — resistant sources decay at 50% rate
- `instinct.js`: passes `frontmatter.source` to `applyContradiction()` for resistance-based scoring
- `learn.js`: Extracted helpers, removed duplication, derived constants from centralized modules

### Fixed

- `learn.js generate`: Refuses to overwrite existing artifacts — exits with error instead of silently clobbering
- `learn.js generate`: `--name` sanitized to prevent path traversal (`/`, `\`, `..`)
- `learn.js generate`: `--type` validated against allowed values (skill, command, agent)
- `learn.js generate`: Empty slug fallback uses domain name instead of broken paths
- `learn.js`: Evolution deduplication scoped to project to prevent cross-project false positives

## [1.1.1] - 2026-02-13

### Added

- `docs/guide/skills-reference.md`: Complete skill catalog (701 lines) with decision trees, workflow comparisons, and iron laws
- `skills/arc-observing/scripts/observer-system-prompt.md`: Separated system prompt from task prompt for observer daemon
- 9 new pytest test files: all 24 skills now have dedicated test coverage (111 tests total)
- `tests/skills/test_skill_cross_references.py`: Cross-reference validation for REQUIRED SUB-SKILL and REQUIRED BACKGROUND
- SKILL_ROOT initialization added to `arc-learning`, `arc-planning`, `arc-recalling`

### Changed

- **Learning subsystem refactored** (PR #3): sync context injection, merged stop hooks, unified bubble-up logic
- Word count policy: replaced hard 500-word assertion with 4-tier soft guidance (Lean <500w, Standard <1000w, Comprehensive <1800w, Meta <2500w)
- `arc-dispatching-parallel`: restructured dual numbering, added conflict detection fallback
- `arc-agent-driven`: added max review cycle guard (3 cycles per reviewer)
- `arc-implementing`: added explicit retry limits (2 refinement cycles)
- `arc-using-worktrees`: auto-detect test command instead of hardcoded pytest
- `observer-daemon.sh`: atomic mkdir-based locks with mv-based stale reclaim, circuit breaker (3 failures), max age TTL (2h)
- `hooks/observe/main.js`: file-based signal cooldown (30s) to prevent duplicate processing
- `hooks/session-tracker/start.js`: split into sync + async for reliable context delivery
- Branding: all remaining "Agentic-Core" references renamed to "arcforge" in INSTALL files and platform READMEs

### Removed

- Unused functions from `scripts/lib/locking.js` (`_withLockAsync`, `_isLocked`, `_forceClearLock`)
- Unused `require('node:path')` in `scripts/cli.js`
- Placeholder test assertions replaced by substantive content checks

### Fixed

- `arc-finishing-epic`: removed redundant sync step; moved DAG block + sync before worktree removal in discard option
- `arc-journaling`: corrected `/learn` command references to `/reflect` (3 occurrences)
- `arc-finishing`: resolved contradictory cleanup instructions (Step 5 now applies to Options 1 and 4 only)
- `arc-executing-tasks`: fixed duplicate step numbering
- `arc-debugging`: corrected heading capitalization
- `arc-finishing` and `arc-agent-driven`: cleaned up description text (removed workflow summaries)
- Workflow docs: `.agentic-epic` references corrected to `.arcforge-epic`

## [1.1.0] - 2026-02-10

### Added

- **arc-observing** skill: Tool call observation for behavioral pattern detection
- **arc-recalling** skill: Manual instinct creation from session insights
- **observe** hook: Tool call observation on PreToolUse and PostToolUse events
- **user-message-counter** hook: User prompt counting on UserPromptSubmit
- **pre-compact** hook: Pre-compaction state marking on PreCompact
- **session-tracker/inject-context.js** hook: Context injection at session start (diary + instincts)
- **log-lightweight** hook entries for SubagentStop, SessionEnd, PermissionRequest events
- `package.json`: license, author, repository, bin, files fields for plugin distribution
- `scripts/lib/confidence.js`: Unified confidence scoring for instincts (create → confirm → decay → archive)
- `scripts/lib/fingerprint.js`: Trigger fingerprinting with Jaccard similarity for deduplication
- `scripts/lib/global-index.js`: Cross-project instinct bubble-up tracking
- `scripts/lib/instinct-writer.js`: Instinct file creation with YAML frontmatter
- `scripts/lib/pending-actions.js`: Deferred action queue for post-session tasks
- `skills/arc-journaling/scripts/auto-diary.js`: Automatic diary generation from session data
- `skills/arc-learning/scripts/learn.js`: Pattern extraction with scan, preview, and cluster commands
- `skills/arc-observing/scripts/instinct.js`: Instinct management CLI (list, confirm, contradict)
- `skills/arc-observing/scripts/observer-daemon.sh`: Background observation daemon
- `skills/arc-recalling/scripts/recall.js`: Manual instinct save (delegates to instinct-writer)
- `commands/instinct-status.md`: Command wrapper for instinct status viewing

### Changed

- **arc-learning** skill: Major restructuring — unified instincts and learned skills into single system
- `plugin.json` and `marketplace.json`: Version bumped to 1.1.0
- `hooks/observe/main.js`: Deduplicated code, imports from canonical utils and session-utils

### Removed

- **session-evaluator** hook (never implemented)
- Dead files: `hooks/session-tracker/main.js`, `hooks/run-hook.js`, `uv.lock`, stale baseline test files, empty `docs/designs/`
- Unused exports from `utils.js` (`getPluginRoot`, `getScriptsDir`, `getHooksDir`, `readStdin`, `outputHookResponse`, `logWarning`)
- Unused exports from `locking.js` (all except `withLock`)
- Unused `getObservationsArchivePath` from `session-utils.js`
- Unused `getNewlyAvailable()` method from `coordinator.js`

### Fixed

- `hooks/quality-check/main.js`: `.catch()` on sync function replaced with `try/catch`
- `scripts/lib/confidence.js`: CRLF line endings now normalized before frontmatter parsing
- `scripts/lib/dag-schema.js`: Backslash escaping in YAML `formatValue` (escape `\` before `"`)
- `scripts/lib/dag-schema.js`: `depends_on` cross-reference validation in `validate()`
- `scripts/lib/dag-schema.js`: Removed unused `isArrayItem` parameter from `objectToYaml`
- `scripts/lib/coordinator.js`: `completeTask` now promotes parent epic from PENDING to IN_PROGRESS
- `scripts/lib/locking.js`: Lock file renamed from `.agentic-lock` to `.arcforge-lock`
- Stale `session-evaluator` references removed from user-message-counter hook and README
- Template filename corrected in architecture overview (`quality-reviewer-prompt.md`)
- README: Development section now references `npm test` (all 4 runners) instead of just `pytest`
- CONTRIBUTING.md: Added Gemini CLI to platform list, fixed stale `run-hook.js` reference
- hooks/README: Updated tree (removed deleted files, added session templates), fixed deprecated utility references
- Architecture overview: Added all `scripts/lib/` modules, fixed test runner description, updated docs tree

## [1.0.0] - 2026-02-08

### Skills (22 arc-* skills)

**Workflow**: arc-brainstorming, arc-refining, arc-planning, arc-coordinating, arc-implementing
**Execution**: arc-tdd, arc-writing-tasks, arc-executing-tasks, arc-agent-driven, arc-dispatching-parallel
**Support**: arc-debugging, arc-verifying, arc-using-worktrees, arc-finishing, arc-finishing-epic, arc-requesting-review, arc-receiving-review
**Learning**: arc-journaling, arc-reflecting, arc-learning
**Meta**: arc-using, arc-writing-skills

### CLI Engine

- DAG-based task management (`status`, `next`, `complete`, `block`)
- Git worktree orchestration (`expand`, `merge`, `cleanup`)
- Bidirectional sync between worktrees and base DAG
- File-based locking for concurrent access safety

### Hooks

- inject-skills: Session context injection
- session-tracker: Event tracking with counters
- compact-suggester: Context compaction timing
- quality-check: Code quality validation
- log-lightweight: Session logging with cost estimation

### Multi-Platform Support

- Claude Code (plugin marketplace)
- Codex CLI
- OpenCode
- Google Gemini CLI
