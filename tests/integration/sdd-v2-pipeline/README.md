# SDD v2 Pipeline — Integration Tests

End-to-end tests for the five SDD v2 downstream execution skills
(`arc-implementing`, `arc-agent-driven`, `arc-dispatching-parallel`,
`arc-dispatching-teammates`, `arc-looping`). Each test scaffolds a shared
per-spec fixture into `/tmp`, expands the relevant worktree (if needed),
then spawns `claude -p` to exercise one downstream skill end-to-end.

## Phases

All three phases are complete:

**Phase A** — two pilot tests (arc-implementing + arc-looping):
- `test-arc-implementing.sh` — expand `epic-parser`, invoke arc-implementing,
  assert task files + source code + Skill delegation.
- `test-arc-looping.sh` — invoke arc-looping at project root with DAG pattern
  + `--max-runs 3`, assert `.arcforge-loop.json` fields and CLI invocation.

**Phase B** — three remaining skills:
- `test-arc-agent-driven.sh` — pre-created tasks file, arc-agent-driven
  executes it, assert source code + Agent tool dispatched.
- `test-arc-dispatching-parallel.sh` — two independent features, assert
  both executed in parallel (Agent dispatched ≥ 2×).
- `test-arc-dispatching-teammates.sh` — 2 ready epics at project root,
  assert TeamCreate + Agent dispatch.

**Phase C** — fixture regeneration mechanism:
- `regenerate-fixture.sh` — rebuilds spec.xml, details/, dag.yaml, and
  epics/ from the fixed design.md seed via arc-refining + arc-planning.
  Never re-runs arc-brainstorming (design.md is human-managed).

## Running locally

```bash
# Run a single test
bash tests/integration/sdd-v2-pipeline/test-arc-implementing.sh

# Run all five tests (sequentially)
bash tests/integration/sdd-v2-pipeline/run-all.sh

# Regenerate the fixture from design.md (review diff, then apply manually)
bash tests/integration/sdd-v2-pipeline/regenerate-fixture.sh

# Regenerate and apply directly
bash tests/integration/sdd-v2-pipeline/regenerate-fixture.sh --apply
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

The fixture is the schema contract — any upstream change to `spec.xml` /
`dag.yaml` / `epic.md` must also update the fixture here.

### Fixture layering

```
docs/plans/demo-spec/2026-04-17/design.md   ← human-managed seed (never regenerated)
specs/demo-spec/spec.xml + details/         ← arc-refining output (regenerable)
specs/demo-spec/dag.yaml + epics/           ← arc-planning output (regenerable)
```

`regenerate-fixture.sh` re-runs arc-refining + arc-planning against the
fixed design.md to produce fresh downstream artifacts. It never touches
design.md — upstream design decisions are human-managed; downstream
structured outputs are regenerable from that fixed seed.

## Timeouts

- arc-implementing: default 25 min (`SDD_V2_IMPLEMENTING_TIMEOUT`)
- arc-looping: default 20 min (`SDD_V2_LOOPING_TIMEOUT`)
- regenerate-fixture arc-refining: default 10 min (`SDD_REGEN_REFINE_TIMEOUT`)
- regenerate-fixture arc-planning: default 10 min (`SDD_REGEN_PLAN_TIMEOUT`)

Override via env vars when debugging:
```bash
SDD_V2_LOOPING_TIMEOUT=300 bash test-arc-looping.sh
SDD_REGEN_REFINE_TIMEOUT=300 bash regenerate-fixture.sh
```

## Why not in npm test

Each test costs real Anthropic API tokens and wall-clock minutes. The
existing `tests/integration/subagent-driven-dev/` runs follow the same
convention — manual gate, never CI. Unit tests in `tests/scripts/`,
`hooks/__tests__/`, `tests/node/`, `tests/skills/` verify the per-spec
layout statically and remain the fast-feedback loop.
