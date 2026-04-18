# Eval: sdd-v2-arc-agent-driven-subagent-per-task

## Scope

workflow

## Target
arc-agent-driven executes a task list by spawning a **fresh subagent per task** (isolated context prevents cross-task pollution). The agent must invoke the Task / Agent tool per task, not inline the work in its own turn stream.

## Scenario

Execute the tasks defined in `docs/tasks/three-utilities-tasks.md`. There are 3 tasks. Each task is independent (no ordering dependency). Each task must run in isolation. Do NOT inline any of the task work in your own turns — dispatch each task as a separate isolated subagent.

When all three tasks are done, report "all-tasks-complete" and stop.

## Context

The task file lists 3 small, independent utility-creation tasks. Each requires an isolated subagent so task state (tool-call history, context) cannot leak across tasks. This is the core guarantee of arc-agent-driven.

## Setup

mkdir -p docs/tasks src tests

cat > docs/tasks/three-utilities-tasks.md << 'EOF'
# Three Independent Utilities

## Task 1: add trim utility
- Create `src/trim.js` exporting `trim(str)` — returns str with whitespace trimmed.
- Test: `node -e "console.log(require('./src/trim').trim(' x ') === 'x')"` → prints `true`.

## Task 2: add upper utility
- Create `src/upper.js` exporting `upper(str)` — returns str in uppercase.
- Test: `node -e "console.log(require('./src/upper').upper('ab') === 'AB')"` → prints `true`.

## Task 3: add reverse utility
- Create `src/reverse.js` exporting `reverse(str)` — returns str reversed.
- Test: `node -e "console.log(require('./src/reverse').reverse('ab') === 'ba')"` → prints `true`.
EOF

cat > package.json << 'EOF'
{"name":"eval-fixture","version":"1.0.0","private":true}
EOF

git init -q && git add -A && git commit -q -m "fixture"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

15

## Assertions

- [tool_count] Task >= 3
- [ ] At the end, `src/trim.js`, `src/upper.js`, and `src/reverse.js` all exist with the specified exported functions.
- [ ] The agent's final response includes the phrase `all-tasks-complete`.

## Grader

mixed

## Grader Config

The behavioral `[tool_count] Task >= 3` assertion is the discriminator — it requires the agent to spawn at least three subagents via the Task tool. A baseline agent without arc-agent-driven's discipline will typically inline the Write calls and skip the subagent delegation. Text assertions confirm the actual code was produced and the completion marker was emitted.

## Trials

3

## Version

1
