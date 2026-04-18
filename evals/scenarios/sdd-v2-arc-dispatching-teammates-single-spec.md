# Eval: sdd-v2-arc-dispatching-teammates-single-spec

## Scope

workflow

## Target
arc-dispatching-teammates Phase 3 precondition: when ready epics span multiple specs, the agent must report **blocked** and require the user to pick one with `--spec-id`, NOT silently dispatch teammates across specs.

## Scenario

I'm at the base of this arcforge project. I have time to monitor — please dispatch agent teammates to work on every epic that is currently ready, in parallel. I'll stay and answer their SendMessage questions.

## Context

You're in the base checkout of an arcforge project. `arcforge status --json` shows the current DAG state. Use whatever arcforge-toolkit approach is appropriate for multi-epic parallel dispatch with a human lead present.

## Setup

mkdir -p specs/spec-alpha specs/spec-beta

cat > specs/spec-alpha/dag.yaml << 'EOF'
epics:
  - id: epic-a1
    name: Alpha one
    status: pending
    spec_path: specs/spec-alpha/epics/epic-a1/epic.md
    worktree: null
    depends_on: []
    features: []
  - id: epic-a2
    name: Alpha two
    status: pending
    spec_path: specs/spec-alpha/epics/epic-a2/epic.md
    worktree: null
    depends_on: []
    features: []
blocked: []
EOF

cat > specs/spec-beta/dag.yaml << 'EOF'
epics:
  - id: epic-b1
    name: Beta one
    status: pending
    spec_path: specs/spec-beta/epics/epic-b1/epic.md
    worktree: null
    depends_on: []
    features: []
blocked: []
EOF

git init -q && git add -A && git commit -q -m "fixture"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

12

## Assertions

- [ ] The agent's final response reports that the dispatch is blocked or cannot proceed because the ready epics span multiple specs (`spec-alpha`, `spec-beta`).
- [ ] The agent asks the user to pick a single spec (mentions `--spec-id` or equivalent) rather than proceeding.
- [tool_not_called] TeamCreate
- [tool_not_called] Bash:expand

## Grader

mixed

## Grader Config

The behavioral assertions ensure the agent does NOT invoke teammate-creation machinery or worktree expansion when cross-spec dispatch would be wrong. The text assertions verify the blocked report and the suggestion to scope to one spec. Baseline agents without the single-spec precondition knowledge may try to dispatch anyway. Treatment agents (with the plugin) should cite the single-spec gate and ask which spec to use.

## Trials

3

## Version

1
