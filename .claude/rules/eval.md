---
paths:
  - "evals/**"
  - "scripts/lib/eval*.js"
  - "scripts/eval-dashboard*"
---

# Eval-Driven Development

## Principle

If you can't measure improvement, you can't ship with confidence. Eval is not optional — it's how arcforge validates that skills and workflows actually change agent behavior.

## When to Eval

- **Before shipping a new skill** — run baseline (without skill) to confirm it teaches new behavior
- **After modifying a skill** — run eval to confirm the change had the intended effect
- **When behavior is ambiguous** — "does the agent actually do X?" is an eval question, not a code review question

## What Eval Is NOT

- NOT unit testing (that's `npm test` — verifies code correctness)
- NOT manual inspection (that's code review — verifies code quality)
- Eval verifies **agent behavior** — what Claude actually does when given tools and context

## Text vs Behavioral Assertions

| | Text `[ ]` | Behavioral `[tool_called]` |
|---|---|---|
| Tests | What the agent **said** | What the agent **did** |
| Grader | Model (LLM-as-judge) | Code (deterministic) |
| Reliability | Noisy | Reproducible |
| Use when | Judging quality/reasoning | Verifying actions/ordering |

**Prefer behavioral assertions.** "Agent mentions verification" ≠ "agent actually verifies." Use `[tool_called] Bash:npm test` over `[ ] Agent runs tests`.

## Common Traps

- **Baseline at ceiling** — Claude already knows the answer without the skill → scenario isn't discriminative. Redesign the trap, don't conclude the skill works.
- **Testing infrastructure** — "file exists" or "exit code 0" → use unit tests, not eval. Eval tests Claude's choices.
- **Skill formalizes existing behavior** — if A/B delta is 0 after 2+ redesigns, the skill may teach what agents already do. Consider agent eval (single condition) instead.

## Reference

Follow `skills/arc-evaluating/SKILL.md` for the complete methodology — scenario design, grader selection, metrics, execution, and reporting.
