# Baseline Test: arc-using-worktrees

**Date:** 2026-01-17
**Scenario:** Create git worktree for "user-authentication" epic with tracking

## What the agent did RIGHT

✅ Created `.worktrees/` directory structure
✅ Used `git worktree add` command correctly
✅ Created a new branch with the epic name
✅ **Created a tracking file** to record which epic the worktree is for

## What the agent MISSED

❌ Used `.epic` instead of `.arcforge-epic` as the tracking filename
❌ Didn't check if `dag.yaml` exists for integration
❌ No mention of the standardized completion prompt format

## Agent Rationalizations

1. **Filename choice:** Agent chose `.epic` which is reasonable but not aligned with the `.arcforge-*` naming convention used elsewhere in the project (`.arcforge-epic`, `.arcforge-progress.json`)

2. **No DAG integration:** Agent didn't consider checking `dag.yaml` or updating epic status

3. **Proactive but not standardized:** Agent was proactive about creating a tracking file, which is good, but used a non-standard name

## Key Insights

- The agent understood the CONCEPT of epic tracking
- The agent was proactive about creating metadata
- The agent lacked knowledge of project-specific naming conventions (`.arcforge-*`)
- The agent didn't consider integration with the broader pipeline (dag.yaml)

## What the skill needs to address

1. **Naming convention:** Enforce `.arcforge-epic` specifically
2. **DAG integration:** Check for dag.yaml and potentially update epic status
3. **Completion format:** Use standardized stage completion prompt
4. **Red flags:** Prevent rationalizations like "any tracking file is fine"
