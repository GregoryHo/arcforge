# Eval: sdd-v2-arc-agent-driven-subagent-per-task

## Scope

agent

## Target
Regression guard: for 3 clearly independent task-list items, a bare agent spawns at least one Agent subagent per task rather than inlining all Write calls. Piloting showed baseline and treatment both parallelise at ~3 Agent calls — Claude's native instinct for independent tasks already matches the arc-agent-driven discipline in this scenario shape. Kept as a regression guard: if this ever drops below `Agent >= 3`, Claude's native parallelism for independent tasks has regressed.

A workflow-scope A/B that actually pressure-tests arc-agent-driven's discipline would need non-trivially-dependent tasks or a sufficiently large task count that batching becomes tempting — both are future work.

## Scenario

Execute the tasks defined in `docs/tasks/three-utilities-tasks.md`. When the tasks are all done, report "all-tasks-complete" and stop.

## Context

The task file lists 3 small, independent utility-creation tasks in an arcforge-style tasks document. Use whatever arcforge-toolkit approach you consider appropriate for executing a prepared task list. You have Read, Write, Edit, Bash, Task, and other standard tools.

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

- [tool_count] Agent >= 3
- [ ] At the end, `src/trim.js`, `src/upper.js`, and `src/reverse.js` all exist with the specified exported functions.
- [ ] The agent's final response includes the phrase `all-tasks-complete`.

## Grader

mixed

## Grader Config

The behavioral `[tool_count] Task >= 3` assertion is the sole discriminator — it requires the agent to spawn at least three Task subagents. A baseline agent without arc-agent-driven's per-task-subagent discipline will typically inline the Write calls itself to save turns; a treatment agent that has the skill loaded should recognise this as a task-list-execution situation and dispatch one subagent per task. Text assertions confirm the end-state (files exist, completion marker emitted) so the agent can't "pass" by doing nothing.

## Trials

3

## Version

1
