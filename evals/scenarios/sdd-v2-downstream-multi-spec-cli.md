# Eval: sdd-v2-downstream-multi-spec-cli

## Scope

workflow

## Target
SDD v2 downstream multi-spec CLI routing: given a base repo containing 2+ specs and no worktree marker, the agent must use `--spec-id` or the aggregate output of `arcforge status`, not fall back to v1 assumptions like reading a root `dag.yaml`.

## Scenario

I'm at the root of an arcforge project. Tell me which pending epics are ready to work on across the whole project. I want the list of ready epic IDs. Don't implement anything — just figure out the ready epics and return their IDs.

## Context

This is an arcforge project that currently contains two separate specs. Each spec has its own `dag.yaml` under `specs/<spec-id>/`. There is no `.arcforge-epic` marker — you are in the base checkout, not a worktree. Use the arcforge CLI correctly for a multi-spec project.

## Setup

mkdir -p specs/spec-auth specs/spec-billing

cat > specs/spec-auth/dag.yaml << 'EOF'
epics:
  - id: epic-auth-login
    name: Auth login flow
    status: pending
    spec_path: specs/spec-auth/epics/epic-auth-login/epic.md
    worktree: null
    depends_on: []
    features: []
  - id: epic-auth-mfa
    name: Auth MFA
    status: pending
    spec_path: specs/spec-auth/epics/epic-auth-mfa/epic.md
    worktree: null
    depends_on:
      - epic-auth-login
    features: []
blocked: []
EOF

cat > specs/spec-billing/dag.yaml << 'EOF'
epics:
  - id: epic-billing-charge
    name: Billing charge flow
    status: pending
    spec_path: specs/spec-billing/epics/epic-billing-charge/epic.md
    worktree: null
    depends_on: []
    features: []
blocked: []
EOF

git init -q && git add -A && git commit -q -m "fixture"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

10

## Assertions

- [ ] The agent's final answer identifies exactly two ready epic IDs: `epic-auth-login` and `epic-billing-charge`.
- [ ] The agent's final answer does NOT include `epic-auth-mfa` (which depends on `epic-auth-login` and is therefore not ready).
- [tool_called] Bash:arcforge status
- [tool_not_called] Bash:cat dag.yaml

## Grader

mixed

## Grader Config

The agent should produce a final text answer listing ready epics. Grade strictly: the answer must mention both `epic-auth-login` and `epic-billing-charge` as ready, and must NOT mention `epic-auth-mfa` in the ready set. Extra commentary is acceptable. `tool_called` for `Bash:arcforge status` matches any invocation whose command starts with `arcforge status` (with or without flags). `tool_not_called` for `Bash:cat dag.yaml` matches the exact root-level `cat dag.yaml` invocation; reading a per-spec path with `cat` is fine.

## Trials

3

## Version

1
