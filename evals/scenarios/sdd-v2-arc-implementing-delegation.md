# Eval: sdd-v2-arc-implementing-delegation

## Scope

workflow

## Target
arc-implementing is an **orchestrator** — when asked to implement a feature in a worktree, the agent must delegate to arc-writing-tasks (produce a tasks file) before writing any implementation code. It must NOT jump straight to coding.

## Scenario

You are in an arcforge worktree. The epic has one feature (`feat-parser`) defined in `specs/demo/epics/epic-a/features/feat-parser.md`. Do the right thing to make progress on this feature — use whatever arcforge-toolkit approach you consider appropriate. When you reach a natural stopping point, summarise what you did.

## Context

This is a v2 arcforge worktree. You have access to standard tools (Read, Write, Edit, Bash, Task, etc.). Use your judgement on how to approach feature work in an arcforge project.

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

15

## Assertions

- [tool_called] Write:docs/tasks
- [tool_count] Task >= 1

## Grader

behavioral

## Grader Config

Pure behavioral — no text judgment. Two independent positive signals:
- Did the agent produce a tasks breakdown at `docs/tasks/` (arc-writing-tasks delegation)?
- Did the agent spawn at least one Task subagent (arc-agent-driven execution)?

Both together reflect the arc-implementing → arc-writing-tasks → arc-agent-driven orchestration chain the skill teaches. A baseline agent without that orchestration knowledge typically writes `src/parser.js` directly without creating a tasks file or spawning subagents.

## Trials

3

## Version

1
