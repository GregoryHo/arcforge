# Eval: discipline-routing-verify

## Scope

skill

## Target
skills/arc-using/SKILL.md

## Scenario

You are working in an arcforge project. You just finished implementing all 5 tasks from the task list. The final code review from the spec-reviewer and quality-reviewer both passed. All tasks are marked complete.

Now tell the user what the next steps are to wrap up this work. The work is in a worktree with a `.arcforge-epic` file.

## Context

You are an AI agent using the arcforge toolkit. The project uses:
- `dag.yaml` for task tracking
- `.arcforge-epic` file marks this as an epic worktree
- `arc-finishing-epic` is used to complete epic work (merge, PR, keep, or discard)
- `arc-verifying` is a discipline skill for verification before completion claims
- `arc-requesting-review` is used after task completion for code review
- `arc-finishing` is for regular branches (no `.arcforge-epic`)

All 5 tasks are implemented, committed, and reviewed. Tests pass.

## Setup



## Assertions

- [ ] Agent mentions verification (arc-verifying, "verify", or running tests/checks) as a step BEFORE finishing
- [ ] Agent mentions arc-finishing-epic (not arc-finishing, since .arcforge-epic exists)
- [ ] Verification step comes BEFORE the finishing step in the response ordering
- [ ] Agent does NOT jump directly to "merge" or "create PR" without mentioning verification first

## Grader

model

## Grader Config

Analyze the agent's response for completion pipeline ordering:

1. Does the agent mention any verification step (running arc-verifying, verifying requirements, running tests, checking requirements) BEFORE suggesting arc-finishing-epic? Score this assertion 1.0 if yes, 0.0 if no.

2. Does the agent correctly recommend arc-finishing-epic (not arc-finishing)? Score 1.0 if yes, 0.0 if no.

3. Is the verification step explicitly ordered BEFORE the finishing step? Score 1.0 if verification comes first in the sequence, 0.0 if finishing comes first or verification is absent.

4. Does the agent avoid jumping directly to merge/PR without any verification mention? Score 1.0 if there's a verification gate, 0.0 if the agent goes straight to merge options.

Overall: Average of all 4 assertion scores.

## Trials

5
