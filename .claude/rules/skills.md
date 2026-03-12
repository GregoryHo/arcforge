---
paths:
  - "skills/**"
  - "tests/skills/**"
---

# Skills

## Naming

- Prefix: `arc-` required for all skills
- Case: kebab-case
- Voice: verb-first, gerund (-ing) for process skills
- Structure: `arc-<action>[-<object>[-<scope>]]`
- Good: `arc-brainstorming`, `arc-writing-tasks`, `arc-using-worktrees`
- Bad: `arc-coordinator` (agent-noun), `arc-debug` (bare verb), `arc-task-writer` (noun-first)

## Frontmatter

- Only two fields: `name` and `description`
- Max 1024 characters total
- `name`: letters, numbers, and hyphens only
- `description`: must start with "Use when..." — triggers only, NOT workflow summary
- Never summarize the skill's workflow in the description — Claude may follow description instead of reading full skill

## Iron Law

```
NO SKILL WITHOUT A FAILING TEST FIRST
```

TDD for documentation:
1. **RED** — Run pressure scenarios WITHOUT the skill. Document baseline behavior and rationalizations verbatim.
2. **GREEN** — Write the skill addressing those specific failures. Re-run WITH the skill. Agent should now comply.
3. **REFACTOR** — Find new rationalizations, add explicit counters, re-test until bulletproof.

If you wrote the skill before testing, delete it and start over.

## Cross-Referencing

- Use `**REQUIRED BACKGROUND:** ...` to reference other skills
- Never use `@`-file syntax (force-loads context into memory)

## Word Count Tiers (soft guidance)

| Tier | Limit |
|------|-------|
| Lean | <500w |
| Standard | <1000w |
| Comprehensive | <1800w |
| Meta | <2500w |

Over-limit skills should extract details to `references/` for progressive loading.

## File Layout

```
skills/
  arc-<name>/
    SKILL.md              # Main skill file (required)
    supporting-file.*     # Only if needed (heavy reference, scripts)
```

## Testing

- Test file: `tests/skills/test_skill_arc_<name>.py`
- Uses pytest — validate frontmatter + content structure
- Follow patterns in existing test files (e.g., `test_skill_arc_brainstorming.py`)

## Reference

Follow `skills/arc-writing-skills/SKILL.md` when creating or editing skills — it contains the complete methodology.
