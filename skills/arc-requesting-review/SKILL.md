---
name: arc-requesting-review
description: Use when completing tasks or features to request code review
---

# arc-requesting-review

## When to Request Review

**Mandatory:**
- After each task in agent-driven mode
- After completing feature (if not using agent-driven)
- Before merge to base branch

**Optional:**
- When stuck (fresh perspective)
- Before refactoring
- After fixing complex bug

**Review frequency by workflow:**
- **Agent-driven:** review after EACH task
- **Executing-tasks:** review after each batch (default 3 tasks)
- **Ad-hoc:** review before merge or when stuck

## How to Request

1. Get git SHAs:
   ```bash
   BASE_SHA=$(git rev-parse HEAD~1)
   HEAD_SHA=$(git rev-parse HEAD)
   ```

2. Dispatch code-reviewer subagent (arcforge:code-reviewer) using template at `agents/code-reviewer.md` and fill placeholders:

Required placeholders:
- `{WHAT_WAS_IMPLEMENTED}`
- `{PLAN_OR_REQUIREMENTS}`
- `{BASE_SHA}`
- `{HEAD_SHA}`
- `{DESCRIPTION}`

3. Act on feedback:
   - Fix Critical immediately
   - Fix Important before proceeding
   - Note Minor for later
   - Push back if reviewer is wrong (use arc-receiving-review)

## Example

```
[Just completed Task 2: Add verification function]

BASE_SHA=$(git rev-parse HEAD~1)
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer]
WHAT_WAS_IMPLEMENTED: Verification and repair functions
PLAN_OR_REQUIREMENTS: Task 2 from docs/tasks/verify-index-tasks.md
BASE_SHA: a7981ec
HEAD_SHA: 3df7661
DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Reviewer feedback]
Important: Missing progress reporting
Minor: Magic number for reporting interval

[Fix Important, note Minor, then continue]
```

## Integration

- **Called by:** arc-agent-driven (per task)
- **Pairs with:** arc-receiving-review (handle feedback)
