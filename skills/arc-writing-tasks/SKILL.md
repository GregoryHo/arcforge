---
name: arc-writing-tasks
description: Break a feature into small executable tasks with exact code and commands. Use when a spec or feature is ready and you need concrete implementation steps before coding — produces the task list arc-executing-tasks runs.
category: sdd
status: promoted
argument-hint: "<feature-name>"
---

# Writing Tasks

## Overview

Break features into bite-sized tasks (2-5 minutes each) with exact code and commands. Each task is independently executable.

## Core Rules

1. **Bite-sized** - Each task 2-5 minutes
2. **Exact code** - Complete code, not "add validation"
3. **Exact commands** - Full test command with expected output
4. **TDD order** - Test first, then implementation
5. **Persist to file** - Tasks saved to `docs/tasks/<name>-tasks.md`

## Granularity Check

| Too Vague | Just Right |
|-----------|------------|
| "Set up auth" | "Create User dataclass in src/types.py" |
| "Add tests" | "Write test_login_invalid_password in tests/auth/" |
| "Implement login" | "Add password hash check in login()" |

## Output Structure

Output to `docs/tasks/<feature-name>-tasks.md`. Each task is TDD-ordered: write failing test → run (expect FAIL) → implement → run (expect PASS) → commit.

```markdown
# <Feature Name> Tasks

> **Goal:** [One sentence describing what this delivers]
> **Architecture:** [2-3 sentences about approach]
> **Tech Stack:** [Key technologies/libraries]

> **For Claude:** Use arc-agent-driven or arc-executing-tasks to implement.

## Context
[Scene-setting from feature spec]

## Tasks

### Task 1: [Name]
**Files:**
- Create: `exact/path/to/file.py`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write failing test**
\`\`\`python
def test_specific_behavior():
    ...
\`\`\`

**Step 2: Run test**
Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL

**Step 3: Implement**
\`\`\`python
def function():
    ...
\`\`\`

**Step 4: Verify**
Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: add specific feature"`

### Task 2: ...
```

## Completion Format

✅ Tasks written → docs/tasks/<name>-tasks.md
- Total: N tasks
- Ready for: arc-agent-driven or arc-executing-tasks

## Blocked Format

⚠️ Writing tasks blocked
- Issue: Feature spec unclear
- Missing: Authentication method not specified
- Action: Clarify with user before breaking down

## Red Flags - STOP

- "Set up X" without exact files
- "Add tests" without test code
- "Implement Y" without exact implementation
- Tasks longer than 5 minutes

**Vague = break down further.**

## After This Skill

Hand off to one of:

- **`arc-agent-driven`** — automated execution, fresh subagent per task. Best for walk-away batch runs where each task is well-scoped.
- **`arc-executing-tasks`** — human-in-the-loop mode with checkpoint prompts between tasks. Best when the task list carries judgment calls or when you want to review each step.

Both read `docs/tasks/<name>-tasks.md` as input. Default to `arc-agent-driven`.
