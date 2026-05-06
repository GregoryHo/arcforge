---
paths:
  - "skills/**"
  - "tests/skills/**"
---

# Skills (contributor quick reference)

The canonical authoring methodology lives in `skills/arc-writing-skills/SKILL.md` — naming, frontmatter (required + optional fields), Iron Law TDD, word-count tiers, skill type taxonomy (composition: Workflow / Discipline / Meta — content: Technique / Pattern / Reference), and design anti-patterns. Read it before creating or editing any skill.

This file holds only the contributor-side conventions that don't belong in shipped skill surface.

## Test File Convention

- Location: `tests/skills/test_skill_arc_<name>.py` (one test file per skill)
- Runner: pytest — validates frontmatter + content structure
- Pattern: follow existing tests (e.g., `test_skill_arc_brainstorming.py`)

## Iron Law applies to skill EDITS, not just creation

The Iron Law in `arc-writing-skills` says "delete it, start over" if you wrote a skill before testing. The same applies to **edits** — if you change a skill's behavioral spec without re-running its eval, that change is untested and shouldn't ship. "Just adding a section" / "small clarification" / "documentation only" are not exemptions.
