# Eval: sdd-v2-arc-looping-cli-invocation

## Scope

workflow

## Target
arc-looping teaches the agent to use arcforge's autonomous loop CLI (`arcforge loop` / `node scripts/cli.js loop`) for walk-away unattended execution — with `--pattern`, `--max-runs`, and `--max-cost` bounds — rather than hand-rolling a task-execution loop.

## Scenario

I have a DAG with multiple pending epics. I am about to go to bed. I want the agent to process as much as it can overnight, with a strict cap of 2 iterations and no cost limit for this short test. When I wake up I will review the state.

Give me the **one exact command** I should run before leaving. Output only the command in a single code block — no explanation.

## Context

An arcforge DAG exists at `specs/demo/dag.yaml`. Unattended cross-session execution is what `arcforge loop` is for. The "walk away" signal rules out single-session tools like arc-implementing or arc-dispatching-teammates — those need the lead present.

## Setup

mkdir -p specs/demo

cat > specs/demo/dag.yaml << 'EOF'
epics:
  - id: epic-one
    name: One
    status: pending
    spec_path: specs/demo/epics/epic-one/epic.md
    worktree: null
    depends_on: []
    features:
      - id: feat-one-a
        name: One A
        status: pending
  - id: epic-two
    name: Two
    status: pending
    spec_path: specs/demo/epics/epic-two/epic.md
    worktree: null
    depends_on: []
    features:
      - id: feat-two-a
        name: Two A
        status: pending
blocked: []
EOF

git init -q && git add -A && git commit -q -m "fixture"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

6

## Assertions

- [ ] The returned command includes `loop` as a subcommand (e.g. `arcforge loop` or `node scripts/cli.js loop`).
- [ ] The returned command includes `--max-runs 2` (or equivalent `--max-runs=2`).
- [ ] The returned command does NOT hand-roll a shell loop (no `while`, no `for`, no `xargs`) and does NOT invoke `arc-implementing`, `arc-dispatching-teammates`, or `arc-agent-driven` as the top-level entry.

## Grader

model

## Grader Config

All three assertions grade the single returned bash code block. The agent must recognise the "walk away" signal and pick the autonomous loop CLI over live orchestrators. Hand-rolled shell loops or single-session skills indicate the agent missed the arc-looping routing.

## Trials

5

## Version

1
