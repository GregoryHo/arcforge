---
name: arc-dispatching-parallel
description: Use when dispatching multiple independent features within a worktree session
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
(never inherit — see arc-agent-driven's Model Selection ladder for the tier map).

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
- Verify the merged result with fresh-context subagents rather than trusting the
  implementers' own reports:
  - the `verifier` agent with the project test command — runs the suite from an
    empty context and returns raw output.
  - when a spec exists, also the `spec-reviewer` agent with the relevant
    `specs/<spec-id>/.../*.md` attached — it confirms every acceptance criterion
    in the integrated branch.
- Integrate only after the verifier (and spec-reviewer, if run) PASS.

## DAG-Based Workflow

When `dag.yaml` exists (from `/arc-planning`), the engine computes readiness —
don't hand-parse the dag. Identify your spec (from the worktree's `.arcforge-epic`
marker or the `--spec-id` the lead passed), then:

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
node "${ARCFORGE_ROOT}/scripts/cli.js" parallel --features --json
```

Output is the parallelizable set in the in-progress epic(s):

```json
{ "count": 2, "features": [{ "id": "feat-001", "name": "...", "epic": "epic-001" }] }
```

`count: 0` means nothing is ready right now — complete a blocking feature first,
or fall back to `arcforge next` for the single next task.

Group the returned features by independence (A doesn't depend on B, B doesn't
depend on A, no shared ordering deps), present the plan, and let the user pick:

- **Sequential:** use `arc-implementing` to implement features one at a time in
  dependency order.
- **Parallel:** dispatch one subagent per feature in the group, all in one message:
  ```
  subagent: "Implement feature <feature-id> from specs/<spec-id>/epics/<epic>/features/<feature>.md"
  ```
  Wait for all, then run the Review and Integrate gate (§4 of The Pattern) — the
  `verifier` agent, plus `spec-reviewer` when a spec exists — before the next group.

Fetch the next group from the engine (`arc-coordinating` owns the full lifecycle):

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
node "${ARCFORGE_ROOT}/scripts/cli.js" parallel --features --json   # next parallelizable features
node "${ARCFORGE_ROOT}/scripts/cli.js" next --json                  # or the next single task
```

## Without DAG: Independent Failures

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
| "Parallelization too complex"      | DAG makes it clear                   |
| "User knows the dependencies"      | Present structured analysis          |
| "Worktrees handle parallelization" | That's epic-level, not feature-level |

## Blocked Format

```
⚠️ Parallelization analysis blocked
Issue: <dag.yaml not found / no features ready / parse error>
Resolve: create dag.yaml (/arc-planning) · complete dependency features · fix dag.yaml syntax
```

## Cross-Platform Dispatch

The `subagent:` lines are notation, not a specific tool — this works on any
platform that runs a fresh subagent (Claude Code, Codex). The `verifier` and
`spec-reviewer` agents are pre-built where supplied; otherwise dispatch a
general-purpose subagent with the equivalent verify command and spec-check
instructions.

## Key Distinction

| Type              | Scope                         | Skill                                  |
| ----------------- | ----------------------------- | -------------------------------------- |
| **Epic-level**    | Multiple epics at once        | `arc-dispatching-teammates` (multi-epic via DAG) / `arc-coordinating` (lifecycle) |
| **Feature-level** | Multiple features within epic | This skill (`arc-dispatching-parallel`) |

Two epics run simultaneously as separate teammates via `arc-dispatching-teammates`
/ `arc-coordinating`; this skill parallelizes features within one epic worktree.

## Related Skills

- **Before:** `/arc-planning` creates dag.yaml
- **After:** `/arc-implementing` executes features
- **Related:** `/arc-coordinating` owns the DAG lifecycle (wraps `parallel`, `next`)
