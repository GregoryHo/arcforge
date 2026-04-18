# Eval: sdd-v2-arc-dispatching-parallel-independence

## Scope

workflow

## Target
arc-dispatching-parallel groups features into parallel waves based on dependency independence. Features with outstanding dependencies MUST wait; independent features go in the same wave.

## Scenario

I'm inside an arcforge worktree. Look at the features for the current epic and tell me which features can safely run in parallel **right now**, and which must wait. Return two lists:

```
Parallel now: <ids>
Must wait: <ids with waiting-reason>
```

Do not implement anything. Just produce the grouping.

## Context

The epic has 5 features with a dependency graph defined in the DAG. You are in the worktree (`.arcforge-epic` present). Use the DAG's `depends_on` information — a feature is ready only when every dependency has `status: completed`.

## Setup

mkdir -p specs/demo/epics/epic-core/features

cat > .arcforge-epic << 'EOF'
epic: epic-core
spec_id: demo
base_worktree: /tmp/base
base_branch: main
local:
  status: in_progress
  started_at: 2026-04-18T10:00:00Z
synced: null
EOF

cat > specs/demo/dag.yaml << 'EOF'
epics:
  - id: epic-core
    name: Core epic
    status: in_progress
    spec_path: specs/demo/epics/epic-core/epic.md
    worktree: epic-core
    depends_on: []
    features:
      - id: feat-a
        name: Independent A
        status: pending
        depends_on: []
      - id: feat-b
        name: Independent B
        status: pending
        depends_on: []
      - id: feat-c
        name: Depends on A
        status: pending
        depends_on:
          - feat-a
      - id: feat-d
        name: Independent D
        status: pending
        depends_on: []
      - id: feat-e
        name: Depends on A and B
        status: pending
        depends_on:
          - feat-a
          - feat-b
blocked: []
EOF

cat > specs/demo/epics/epic-core/epic.md << 'EOF'
# Epic: Core
Five features with a deps graph.
EOF

git init -q && git add -A && git commit -q -m "fixture"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

8

## Assertions

- [ ] The agent's `Parallel now` list includes exactly `feat-a`, `feat-b`, and `feat-d` (order-independent).
- [ ] The agent's `Must wait` list includes `feat-c` (blocked on `feat-a`) and `feat-e` (blocked on `feat-a` and `feat-b`), and explicitly names the blocking dependencies.
- [ ] The agent does NOT place `feat-c` or `feat-e` in the parallel-now group.

## Grader

model

## Grader Config

The agent must correctly partition the five features using the DAG's `depends_on` structure. All three assertions are text judgments. Grade strictly on dependency correctness: `feat-c` and `feat-e` must be in the "Must wait" list with their blocking deps named. `feat-a`, `feat-b`, `feat-d` must be the parallel-now group. Any other grouping fails.

## Trials

3

## Version

1
