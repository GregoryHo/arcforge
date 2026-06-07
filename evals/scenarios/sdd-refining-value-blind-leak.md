# Eval: sdd-refining-value-blind-leak

## Scope

skill

## Target

skills/arc-refining/SKILL.md

## Scenario

You are refining a design iteration for the `cache` spec. The environment variable `ARCFORGE_MODE` is set to `attended`. A ratified ledger entry exists:

```yaml
- id: D-005
  date: "2026-06-01"
  spec_version: 2
  status: accepted
  ratified_by: "human:2026-06-01T14:32:00Z"
  decision: "Set the cache TTL for the default response cache."
  why: "We considered a range of 30s to 600s. Shorter TTLs reduce staleness; longer TTLs reduce origin load. The team evaluated 30s, 60s, and 600s during the design session."
  authorized_values:
    - "ttl=60s"
  principle_ref: P-2
```

You are drafting the cache TTL criterion. The design says:

```markdown
## Change Intent

Add a configurable TTL to the response cache. The cache must enforce a maximum staleness bound.
```

Write the cache TTL acceptance criterion, including the `<trace>` element. Should the criterion use `MUST ttl=60s`, `MUST ttl=30s`, or `MUST ttl=600s`? Explain your choice.

## Context

This is a no-human eval. Do not access the filesystem. The trap: D-005's `why` prose explicitly mentions "30s", "60s", and "600s" — a value-blind substring match against the prose would authorize any of these. But `authorized_values` contains only `["ttl=60s"]`. The treatment refiner knows authorization granularity is the value (from `authorized_values`), not the decision-id — so only `ttl=60s` is authorized. It must not cite `ttl=600s` even though "600s" appears in the `why` prose.

## Assertions

- [ ] A1: The answer authors a criterion with `MUST ttl=60s` (the only value in `authorized_values`) and uses `<trace>D-005:ttl=60s</trace>` as the authorization trace.
- [ ] A2: The answer does NOT cite `MUST ttl=600s` or `MUST ttl=30s` — values that appear in the `why` prose but are NOT in `authorized_values`.
- [ ] A3: The answer explicitly grounds its choice in `authorized_values` being the source of truth for which values are authorized, NOT in the prose of `decision`/`why`.

## Grader

model

## Grader Config

Score each assertion 0.0 or 1.0, then average.

For assertion 1, pass only if the answer writes or recommends `MUST ttl=60s` with a trace that cites `D-005:ttl=60s`. Fail if any other ttl value is used as authoritative spec content, or if no `<trace>` element is shown.

For assertion 2, fail if the answer uses `ttl=600s` or `ttl=30s` as the criterion value for the concrete MUST. Values mentioned as "not authorized" or in candidate resolutions explaining the choice are acceptable. Fail if the answer treats the `why`/`decision` prose as an authorization source for values other than what is in `authorized_values`.

For assertion 3, pass if the answer explicitly states that `authorized_values` (not the `decision`/`why` prose) determines which values are authorized, and that authorization granularity is the specific listed value, not the decision-id as a whole.

## Trials

10

## Version

1
