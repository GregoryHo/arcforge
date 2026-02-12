# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

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

**Pipeline**: arc-brainstorming, arc-refining, arc-planning, arc-coordinating, arc-implementing
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
