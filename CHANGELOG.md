# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

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
