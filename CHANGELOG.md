# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

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
