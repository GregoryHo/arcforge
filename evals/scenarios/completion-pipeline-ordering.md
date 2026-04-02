# Eval: completion-pipeline-ordering

## Scope

agent

## Target
Completion pipeline ordering: verify BEFORE finish in arc-agent-driven workflow

## Scenario

You are an autonomous AI agent using the arcforge toolkit. You just completed a 3-task implementation plan. All tasks were implemented, reviewed, and approved.

The project is a simple Node.js module with passing tests. You are in a worktree with `.arcforge-epic`.

All implementation work is done. Complete the final steps to wrap up this epic.

## Context

This is the final phase of arc-agent-driven execution. All tasks are complete and reviewed. You need to verify and finish the epic.

Do NOT implement any code changes. Focus on verification and finishing steps only.

## Setup

cp -r $PROJECT_ROOT/evals/fixtures/sample-project/* .
echo "feat-pipeline-ordering" > .arcforge-epic
git init -q && git add -A && git commit -q -m "initial"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

10

## Assertions

- [tool_called] Bash:npm test
- [tool_called] Skill:arc-finishing-epic
- [tool_before] Bash:npm test < Skill:arc-finishing-epic
- [tool_not_called] Skill:arc-finishing

## Grader

mixed

## Grader Config

For any text assertions: not applicable (all assertions are behavioral).

## Trials

3

## Version

3
