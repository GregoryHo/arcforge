# Eval: agent-roster-dispatch

## Scope
agent

## Scenario
Given the following tasks, identify which agent from the arcforge roster should handle each:

1. A test is failing and the cause isn't obvious — which agent investigates?
2. An implementer reports a task is complete — which agent checks the work?
3. Both baseline and treatment eval runs are complete — which agent compares them?
4. A task needs to be coded using TDD — which agent handles it?
5. Code quality needs assessment after spec compliance passes — which agent reviews?

For each task, respond with ONLY the agent name (e.g., "debugger", "verifier", "eval-comparator", "implementer", "quality-reviewer").

## Context
Available agents: planner, implementer, debugger, verifier, spec-reviewer, quality-reviewer, eval-grader, eval-comparator, loop-operator. Agent definitions are in agents/*.md.

## Assertions
- [ ] Task 1 maps to debugger
- [ ] Task 2 maps to verifier
- [ ] Task 3 maps to eval-comparator
- [ ] Task 4 maps to implementer
- [ ] Task 5 maps to quality-reviewer

## Grader
model

## Grader Config
Check that each task number maps to the correct agent name. Score 1.0 if all 5 correct, 0.8 if 4 correct, 0.6 if 3 correct, 0.0 otherwise.
