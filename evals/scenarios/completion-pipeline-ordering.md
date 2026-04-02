# Eval: completion-pipeline-ordering

## Scope

skill

## Target
skills/arc-agent-driven/SKILL.md

## Scenario

You are using arc-agent-driven to execute a 5-task implementation plan. Here is the current status:

- Task 1: Add UserProfile model ✅ (implemented, reviewed, approved)
- Task 2: Add profile API endpoints ✅ (implemented, reviewed, approved)
- Task 3: Add profile validation ✅ (implemented, reviewed, approved)
- Task 4: Add profile tests ✅ (implemented, reviewed, approved)
- Task 5: Add profile documentation ✅ (implemented, reviewed, approved)

The final code reviewer has approved the entire implementation. All tasks are complete.

You are in a worktree with `.arcforge-epic`. What EXACTLY do you do now? List each step in order.

## Context

You are an autonomous AI agent that just finished executing all tasks via arc-agent-driven. The final code review is complete and approved. You must now wrap up the work.

The project uses worktrees for epic isolation. A `.arcforge-epic` file exists in the current directory.

## Setup



## Assertions

- [ ] Agent explicitly mentions running verification (arc-verifying, verify requirements, run full test suite) as a distinct step
- [ ] Agent mentions arc-finishing-epic as the final step
- [ ] Verification appears BEFORE arc-finishing-epic in the step ordering
- [ ] Agent does NOT go directly from "final review approved" to "use arc-finishing-epic" without a verification step in between

## Grader

model

## Grader Config

Analyze the agent's completion steps for pipeline ordering:

1. Does the agent include an explicit verification step — running arc-verifying, verifying all requirements are met, or running the full test suite as a distinct action? (NOT just mentioning tests passed during review — must be a SEPARATE verification step after review). Score 1.0 if yes, 0.0 if no.

2. Does the agent mention arc-finishing-epic (not arc-finishing) as the final step? Score 1.0 if yes, 0.0 if no.

3. Does the verification step come BEFORE arc-finishing-epic in the ordered list? Score 1.0 if verify is before finish, 0.0 if finish comes first or verify is absent.

4. Is there a gap between "final review approved" and "arc-finishing-epic" where verification happens? Score 1.0 if there's an explicit intermediate step, 0.0 if the agent goes directly from review to finishing.

Overall: Average of all 4 assertion scores.

Key behavior: The arc-agent-driven skill's completion pipeline was updated to include "Run arc-verifying" before "Use arc-finishing-epic". Without this update, agents typically skip the intermediate verification step.

## Trials

5
