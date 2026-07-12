---
name: arc-reviewing
description: Use when completing a task or feature to request code review, and when processing the reviewer feedback that comes back — one request→receive loop.
---

# arc-reviewing

Request review when work is complete, then process the feedback with technical rigor — one loop until approved.

## When to Request Review

**Mandatory:**
- After each task in agent-driven mode
- After completing a feature (if not using agent-driven)
- Before merge to base branch

**Optional:**
- When stuck (fresh perspective)
- Before refactoring
- After fixing a complex bug

## Requesting Review

1. Get git SHAs:
   ```bash
   # BASE_SHA = the commit the task started from (record it BEFORE the work).
   # Never use HEAD~1: a task with more than one commit would drop all but its
   # final commit from review.
   BASE_SHA="${TASK_BASE_SHA:-$(git merge-base HEAD "${BASE_BRANCH:-main}")}"
   HEAD_SHA=$(git rev-parse HEAD)
   ```

2. Dispatch the code-reviewer subagent (arcforge:code-reviewer) using the template at `code-reviewer.md` (this skill's directory) and fill placeholders:

   Required placeholders:
   - `{WHAT_WAS_IMPLEMENTED}`
   - `{PLAN_OR_REQUIREMENTS}`
   - `{BASE_SHA}`
   - `{HEAD_SHA}`
   - `{DESCRIPTION}`

3. Triage the feedback:
   - Fix **Critical** immediately
   - Fix **Important** before proceeding
   - Note **Minor** for later
   - Push back if the reviewer is wrong (see Processing Feedback below)

### Example

```
[Just completed Task 2: Add verification function]

BASE_SHA=$TASK_BASE_SHA   # recorded before Task 2's first commit (not HEAD~1)
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

## Processing Feedback

Verify before implementing. Ask before assuming. Technical correctness over social comfort.

### The Response Pattern

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate the requirement in your own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each

### Forbidden Responses

- ❌ "You're absolutely right!"
- ❌ "Great point!" / "Excellent feedback!"
- ❌ "Let me implement that now" (before verification)
- ❌ ANY gratitude expression ("Thanks for...")

### Handling Unclear Feedback

IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on ALL unclear items

WHY: Partial understanding = wrong implementation

### Source-Specific Handling

**From your human partner:**
- Trusted input, implement after understanding
- Still ask if scope is unclear
- No performative agreement

**If external feedback conflicts with your human partner:**
- Stop and discuss with your human partner before implementing

### When To Push Back

- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack

**Pushback examples:**

```
"I checked the current usage and this endpoint isn't called. Do we want to remove it (YAGNI) or keep it for future use?"
```

```
"This change would drop support for <legacy target>. If we still need that target, I can fix the issue without removing support."
```

### YAGNI Check

IF reviewer suggests "implementing properly":
  grep codebase for actual usage
  IF unused: "This isn't called. Remove it (YAGNI)?"

## The Review Loop

1. Request review, then process the feedback (both above).
2. After all feedback is addressed and tested → re-review until the reviewer approves.
3. Once approved → `arc-verifying` → `arc-finishing` (Step 0 discriminates on `.arcforge-epic`).

**Manual mode (human-in-loop):** signal completion to the user — they decide whether to re-review, verify, or finish.

## Integration

- **Called by:** arc-agent-driven (per task)
- **Related:** arc-verifying (verification mindset)
