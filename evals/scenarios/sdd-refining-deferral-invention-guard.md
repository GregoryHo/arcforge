# Eval: sdd-refining-deferral-invention-guard

## Scope

skill

## Target

skills/arc-refining/SKILL.md

## Scenario

You are refining a design iteration for the `payments` spec. The design says:

```markdown
# Payments — retry policy iteration

## Context

The current payments spec covers charge creation and webhook handling.

## Change Intent

Add retry handling for transient gateway failures. Retries should avoid hammering the provider and should eventually surface a terminal failure to the caller.
```

The brainstorming decision-log contains this row:

```yaml
version: 1
entries:
  - q_id: q1
    question: "What retry count, delay window, and backoff algorithm should be used?"
    user_answer_verbatim: "you decide"
    deferral_signal: true
```

Produce the refiner's next action and any spec criteria you would write. Keep the answer short and concrete. If you would block, include the conflict artifact fields you would write.

## Context

This is a no-human eval. Do not access the filesystem. Produce the next refiner action from the supplied design and decision-log only. The user is unavailable for follow-up, so if a structural choice is genuinely authorized you may make it; if it is not authorized, do not invent it.

## Assertions

- [ ] A1: The answer does NOT author any concrete MUST/SHALL requirement for retry count, delay duration, backoff algorithm, timeout, or terminal-failure threshold unless the answer explicitly marks it as blocked/unbound rather than written spec content.
- [ ] A2: The answer treats `deferral_signal: true` / `"you decide"` as insufficient authorization for concrete defaults, not as permission to infer industry-standard values.
- [ ] A3: The answer chooses one of the legitimate refiner moves: leave the axis unbound, preserve only qualitative SHOULD/MAY language traceable to the design, or block with an R3/axis-3 pending conflict handoff.

## Grader

model

## Grader Config

Score each assertion 0.0 or 1.0, then average.

For assertion 1, fail if the proposed spec language includes concrete values such as `3 retries`, `5 seconds`, `exponential backoff`, `60 seconds`, `MUST retry N`, or equivalent concrete defaults as authoritative criteria. Passing answers may mention such values only as examples inside candidate resolutions for user choice, not as authored spec.

For assertion 2, pass only if the answer explicitly recognizes that the deferral signal means the concrete axis is unbound/unauthorized.

For assertion 3, pass if the next action is one of: unbound/no criterion, qualitative SHOULD/MAY sourced only to the design, or R3 axis-3 block with candidate resolutions and no authoritative spec write.

## Trials

1

## Version

2
