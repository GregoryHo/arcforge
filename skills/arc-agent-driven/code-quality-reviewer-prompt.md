# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**

Dispatch a code-reviewer subagent (the `code-reviewer` agent where your platform
provides it, otherwise a general-purpose subagent) with the
arc-requesting-review/code-reviewer.md template and the fields below:

```
Template: arc-requesting-review/code-reviewer.md

WHAT_WAS_IMPLEMENTED: [from implementer's report]
PLAN_OR_REQUIREMENTS: Task N from [task-file]
BASE_SHA: [commit before task]
HEAD_SHA: [current commit]
DESCRIPTION: [task summary]
```

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment
