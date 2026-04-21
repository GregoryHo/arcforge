# iteration-2 — skill-creator methodology

This iteration uses **Anthropic skill-creator's** parallel-subagent methodology,
complementing iteration-1's arc-writing-skills RED/GREEN/REFACTOR pressure scenarios.

## Why a second methodology?

- iteration-1 (arc-writing-skills): "does a v1-armed subagent rationalize
  skipping v2 discipline?" — catches prose-level gaps in SKILL.md body.
- iteration-2 (skill-creator): "does reading the v2 SKILL.md actually
  change agent behavior vs no-skill baseline?" — independent, non-dogfood
  evidence that uses Anthropic's official harness, not arcforge's.

Two evidence streams, two independent validators. Both should agree that
v2 teaches the right discipline.

## Non-dogfood design

This run does NOT invoke `arc eval ab` — the arcforge harness (the code
being tested) stays out of the measurement loop. Subagents are spawned
via the native Task tool; outputs land in `<case>/with_skill/outputs/`
and `<case>/without_skill/outputs/` per skill-creator conventions.

## Scope in this iteration

Three test prompts, six total runs (3 × 2 conditions). Steps 1–3 of
skill-creator methodology (spawn, draft assertions, capture timing).
Steps 4+ (grade, aggregate, launch viewer) deferred.
