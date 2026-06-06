---
paths:
  - "skills/**"
  - "tests/skills/**"
---

# Skills (contributor quick reference)

The canonical authoring methodology lives in `skills/arc-writing-skills/SKILL.md` — naming, frontmatter (required + optional fields), test-driven creation, word-count tiers, skill type taxonomy (composition: Workflow / Discipline / Meta — content: Technique / Pattern / Reference), and design anti-patterns. Read it before creating or editing any skill. Evaluation is owned by `skills/arc-evaluating/SKILL.md`, not arc-writing-skills.

This file holds only the contributor-side conventions that don't belong in shipped skill surface.

## Test File Convention

- Location: `tests/skills/test_skill_arc_<name>.py` (one test file per skill)
- Runner: pytest — validates frontmatter + content structure
- Pattern: follow existing tests (e.g., `test_skill_arc_brainstorming.py`)

## Evaluating skill edits (not just new skills)

arc-evaluating owns the ship gate for skills, agents, and workflows — for new skills and for edits. The line is **behavioral footprint**, not edit size and not whether you call it "docs": a skill IS documentation, so "just adding a section" / "small clarification" / "documentation only" are not automatic exemptions. If an edit changes what the skill instructs the agent to do or decide, re-run its eval before shipping. Changes with no behavioral footprint (typo, reformatting, metadata-only) are exempt, per arc-evaluating. When unsure, treat it as behavioral and run the eval.
