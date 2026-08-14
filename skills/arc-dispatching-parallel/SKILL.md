---
name: arc-dispatching-parallel
description: Dispatch multiple independent features to parallel subagents within one worktree session. Use when fanning out feature-level work you drive yourself; for epic-level teammates you monitor as a present lead use arc-dispatching-teammates.
category: orchestration
status: promoted
---

# arc-dispatching-parallel

## Overview

Dispatch multiple agents for genuinely independent tasks in parallel.

## When to Use

Use when a set of tasks is independent:

- Review found multiple independent issues to fix
- Multiple independent features, or investigation/research tasks
- Multiple independent failures or problem domains (different test files, subsystems, or root causes)

**Don't use when** tasks are related (fixing one might fix others), you need full
system state, or agents would interfere (editing the same files).

## The Pattern

### 1. Identify Independent Tasks

Group by independence — no shared dependencies, no shared files, each
understandable without context from the others. Concretely: different test files
with unrelated failures, different subsystems with no shared code paths.

### 2. Create Focused Prompts

Each agent gets a specific scope (one problem), a clear goal, constraints (don't
change other code), an expected output (summary of changes), and a **named model**
(never inherit — name the tier explicitly on every dispatch).

```
Fix <problem-domain> in <file-or-subsystem>.
Context: <failure name(s) + error/message>
Constraints: don't change unrelated files; avoid refactors outside this scope
Return: root cause, fix summary, files changed
```

### 3. Dispatch in Parallel

Dispatch one general-purpose subagent per task — all in a single batch so they
run concurrently — using whatever subagent mechanism your platform provides:

```
subagent: "Fix issue A in file X"
subagent: "Fix issue B in file Y"
```

### 4. Review and Integrate

- Read each summary. Verify no conflicts — if found, the tasks were not truly
  independent: resolve manually and re-check grouping.
- Verify the merged result with a fresh-context subagent rather than trusting the
  implementers' own reports: hand it the project test command, have it run the
  suite from an empty context, and return raw output.
- Integrate only after that verification passes.

## Independent Failures

Group failures by subsystem or file, apply the independence checks above, dispatch
parallel agents with the prompt template, integrate, and run the full test suite.
Conflicts found ⇒ tasks were not truly independent: resolve manually and re-check
grouping.

## Red Flags

- Dispatch for related issues (fixing one might fix others)
- Skip conflict verification
- Proceed without a full test-suite run

## Common Rationalizations

| Excuse                             | Reality                              |
| ---------------------------------- | ------------------------------------ |
| "Sequential prevents conflicts"    | Parallel is safe when no deps        |
| "Parallelization too complex"      | Independence analysis makes it clear |
| "User knows the dependencies"      | Present structured analysis          |
| "Worktrees handle parallelization" | That's worktree-level, not task-level |

## Cross-Platform Dispatch

The `subagent:` lines are notation, not a specific tool — this works on any
platform that runs a fresh subagent. Where no pre-built verification agent is
supplied, dispatch a general-purpose subagent with the equivalent verify
command and check instructions.

## Key Distinction

| Type                | Scope                              | Skill                                   |
| ------------------- | ---------------------------------- | --------------------------------------- |
| **Worktree-level**  | Multiple worktrees at once         | `arc-dispatching-teammates`             |
| **Task-level**      | Multiple tasks within one worktree | This skill (`arc-dispatching-parallel`) |

Separate worktrees run simultaneously as teammates via `arc-dispatching-teammates`;
this skill parallelizes independent tasks within one worktree.

## Related Skills

- **Before:** `/executing` produces the task list
- **After:** `/finishing` wraps up the integrated result
