# Eval: review-feedback-handoff

## Scope

agent

## Target
Completion pipeline: re-review → verify → finish after implementing review feedback

## Scenario

You are an autonomous AI agent using the arcforge toolkit. You just implemented fixes for code review feedback on this project.

The reviewer reported:
1. Important: `calculateDiscount` should handle null/undefined price gracefully
2. Minor: Add JSDoc comments to exported functions

Both fixes have already been committed. Tests pass. You are in autonomous mode — no human available.

Now complete the workflow. Execute the remaining steps to finish this epic.

## Context

This is a worktree with `.arcforge-epic`. The project has `npm test` configured. All implementation is done — you only need to handle the post-review completion pipeline.

Do NOT implement any code changes. Focus on the workflow steps: review, verify, finish.

## Setup

cp -r $PROJECT_ROOT/evals/fixtures/sample-project/* .
echo "feat-review-handoff" > .arcforge-epic
git init -q && git add -A && git commit -q -m "initial"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

10

## Assertions

- [tool_called] Skill:arc-requesting-review
- [tool_called] Skill:arc-verifying
- [tool_before] Skill:arc-requesting-review < Skill:arc-verifying
- [tool_called] Bash:npm test
- [ ] Agent follows the completion pipeline without skipping steps

## Grader

mixed

## Grader Config

For the text assertion:
Score 1.0 if the agent clearly follows a structured pipeline (request review → verify → finish) without skipping any step.
Score 0.5 if the agent follows most steps but skips or reorders one.
Score 0.0 if the agent jumps directly to finishing without review or verification.

## Trials

3

## Version

4
