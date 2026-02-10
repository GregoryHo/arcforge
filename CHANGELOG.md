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
- **log-lightweight** hook entries for SubagentStop, SessionEnd, PermissionRequest events
- `package.json`: license, author, repository, bin, files fields for plugin distribution

### Removed

- **session-evaluator** hook (never implemented)

### Fixed

- README: Broken links to non-existent `docs/plans/` replaced with actual `docs/guide/` paths
- README: Command names now use full registration form (`/arcforge:arc-brainstorming` etc.)
- README: "diary" references changed to "journal" for consistency
- CHANGELOG: Skill count and hooks listing now match actual codebase
- hooks/README: Directory structure matches actual hooks, event tables cover all hook events
- docs/guide: Skill counts updated to 24, prefixes corrected to `arc-`
- docs/guide/workflow-overview: Added Learning Layer section

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
- session-evaluator: Threshold-based prompting
- compact-suggester: Context compaction timing
- quality-check: Code quality validation
- log-lightweight: Session logging with cost estimation

### Multi-Platform Support

- Claude Code (plugin marketplace)
- Codex CLI
- OpenCode
- Google Gemini CLI
