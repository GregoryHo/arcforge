# SDD v2 Pipeline — Integration Tests

End-to-end tests for the five SDD v2 downstream execution skills
(`arc-implementing`, `arc-agent-driven`, `arc-dispatching-parallel`,
`arc-dispatching-teammates`, `arc-looping`). Each test scaffolds a shared
per-spec fixture into `/tmp`, expands the relevant worktree (if needed),
then spawns `claude -p` to exercise one downstream skill end-to-end.

## Phase A scope (current)

Phase A ships two tests:

- `test-arc-implementing.sh` — scaffold fixture, expand `epic-parser`,
  invoke arc-implementing inside the worktree, assert task files +
  source code + Skill delegation to `arc-writing-tasks` /
  `arc-agent-driven`.
- `test-arc-looping.sh` — scaffold fixture, invoke arc-looping at project
  root with DAG pattern + `--max-runs 3`, assert `.arcforge-loop.json`
  fields and the CLI invocation appeared in the session log.

Phase B (three remaining skills) and Phase C (fixture regeneration
mechanism) are deferred.

## Running locally

```bash
# Run a single test
bash tests/integration/sdd-v2-pipeline/test-arc-implementing.sh

# Run every Phase A test (sequentially)
bash tests/integration/sdd-v2-pipeline/run-all.sh
```

Each test writes artifacts under `/tmp/arcforge-tests/<timestamp>/sdd-v2-pipeline/<skill-name>/`.
Trial dirs are not auto-cleaned so you can inspect them after a run.

These tests spawn real `claude -p` sessions and take **10–25 minutes each**.
They are manual-only and are not wired into `npm test`.

## Fixture shape

The shared fixture at `fixture/` describes one spec (`demo-spec`) with
three epics in a diamond DAG:

```
epic-parser (root)    epic-formatter (root)
         \                 /
          epic-integration (join)
```

Two root epics satisfy the ≥2-ready-epics precondition of
`arc-dispatching-teammates`. Fully independent features inside
`epic-parser` satisfy `arc-dispatching-parallel`. The diamond shape gives
`arc-looping` DAG pattern real dependency ordering to exercise.

The fixture is **hand-authored**, not live-generated from upstream skills.
It is the schema contract — any upstream change to `spec.xml` /
`dag.yaml` / `epic.md` must also update the fixture here. Phase C will
add a `regenerate-fixture.sh` script that walks the upstream skills on a
trivial prompt and commits the result as the new baseline.

## Timeouts

- arc-implementing: default 25 min (`SDD_V2_IMPLEMENTING_TIMEOUT`)
- arc-looping: default 20 min (`SDD_V2_LOOPING_TIMEOUT`)

Override via env vars when debugging:
```bash
SDD_V2_LOOPING_TIMEOUT=300 bash test-arc-looping.sh
```

## Why not in npm test

Each test costs real Anthropic API tokens and wall-clock minutes. The
existing `tests/integration/subagent-driven-dev/` runs follow the same
convention — manual gate, never CI. Unit tests in `tests/scripts/`,
`hooks/__tests__/`, `tests/node/`, `tests/skills/` verify the per-spec
layout statically and remain the fast-feedback loop.
