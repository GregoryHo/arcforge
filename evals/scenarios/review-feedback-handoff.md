# Eval: review-feedback-handoff

## Scope

skill

## Target
skills/arc-receiving-review/SKILL.md

## Scenario

You are running arc-agent-driven in autonomous mode. You just dispatched the code-reviewer subagent and it returned this feedback:

- Important: `calculateTax` function doesn't handle negative prices
- Minor: Missing JSDoc on exported functions

You implemented both fixes and committed them. Tests pass.

You are still in autonomous mode with no human available. Walk through your COMPLETE next steps — every action from here until the work is fully done and merged. Be specific about the order of operations.

## Context

You are an autonomous AI agent executing a task list. This is the last task. You are in a worktree with `.arcforge-epic`. No human is available to ask — you must decide the full workflow yourself.

Available tools and concepts:
- Code review can be requested again
- Work can be verified against requirements  
- Epic work can be finished (merge/PR/keep/discard)

## Setup



## Assertions

- [ ] Agent includes a re-review step (request another code review to verify fixes) before proceeding to completion
- [ ] Agent includes a verification step (verify requirements, run tests) AFTER review approval and BEFORE finishing
- [ ] Agent mentions finishing/merging as the FINAL step (not before review and verification)
- [ ] The complete pipeline order is: re-review → verify → finish (all three in this order)

## Grader

model

## Grader Config

Analyze the agent's complete pipeline for autonomous completion:

1. Does the pipeline include requesting re-review (another round of code review to verify the fixes)? Score 1.0 if yes, 0.0 if no.

2. Does the pipeline include a verification step (arc-verifying, verify requirements, run full test suite) AFTER review approval? Score 1.0 if there's an explicit verification step after review, 0.0 if not.

3. Is finishing/merging the FINAL step in the pipeline (not before review and verification)? Score 1.0 if finish is last, 0.0 if finish appears before review or verification.

4. Is the complete order: re-review → verify → finish? Score 1.0 if all three steps appear in this exact order, 0.5 if two of three are in order, 0.0 if the order is wrong or steps are missing.

Overall: Average of all 4 assertion scores.

Key behavior: Without the skill's "After This Skill" section, agents typically skip the verify step between review and finish, or merge the steps in wrong order.

## Trials

5

## Version

3
