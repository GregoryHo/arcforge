# Eval: sdd-v2-arc-implementing-delegation

## Scope

workflow

## Target
arc-implementing is an **orchestrator** — when asked to implement a feature in a worktree, the agent must delegate to arc-writing-tasks (produce a tasks file) before writing any implementation code. It must NOT jump straight to coding.

## Scenario

You are in an arcforge worktree. The epic has one feature (`feat-parser`) defined in `specs/demo/epics/epic-a/features/feat-parser.md`. Implement this feature.

## Context

This is a v2 arcforge worktree. Feature-level implementation is orchestrated through arc-implementing's Phase 2a (break feature into tasks via arc-writing-tasks) before Phase 2b (execute tasks). DO NOT write implementation code until a tasks file exists. Produce the tasks file first; then you may stop — do not implement code, just confirm the tasks file path.

## Setup

mkdir -p specs/demo/epics/epic-a/features docs/tasks src

cat > .arcforge-epic << 'EOF'
epic: epic-a
spec_id: demo
base_worktree: /tmp/base
base_branch: main
local:
  status: in_progress
  started_at: 2026-04-18T10:00:00Z
synced: null
EOF

cat > specs/demo/epics/epic-a/epic.md << 'EOF'
# Epic: Alpha
Features:
- feat-parser — Add a number parser module
EOF

cat > specs/demo/epics/epic-a/features/feat-parser.md << 'EOF'
# Feature: feat-parser

Add a module at `src/parser.js` that exports `parseNumber(str)`.
Requirements:
- Return integer for valid numeric strings ("42" → 42)
- Return null for non-numeric input ("abc" → null)
- Handle leading/trailing whitespace

Tests live under `tests/parser.test.js`.
EOF

git init -q && git add -A && git commit -q -m "fixture"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

12

## Assertions

- [ ] The agent produces a tasks file at `docs/tasks/feat-parser-tasks.md` (or a near-equivalent path under `docs/tasks/`) containing at least 2 numbered tasks with exact code and test commands.
- [ ] The agent's final response explicitly references the tasks file it created (path or filename), confirming the delegation happened.
- [tool_not_called] Write:src/parser.js
- [tool_not_called] Edit:src/parser.js

## Grader

mixed

## Grader Config

Text assertions check the agent's final textual confirmation and the tasks file content. Behavioral assertions ensure the agent did NOT jump straight to writing implementation code. A passing treatment agent decomposes the feature into a tasks file first; a baseline agent typically goes straight to writing `src/parser.js`.

## Trials

3

## Version

1
