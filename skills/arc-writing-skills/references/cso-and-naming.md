# Claude Search Optimization, Naming, and Flowcharts

Reference depth for arc-writing-skills. Load when writing a skill's description, name, or deciding whether to use a flowchart.

## Rich Description Field

**Description = When to Use, NOT What the Skill Does.** The description should ONLY describe triggering conditions.

**Why this matters:** Testing revealed that when a description summarizes the skill's workflow, Claude may follow the description instead of reading the full skill content. The trap: descriptions that summarize workflow create a shortcut Claude will take, and the skill body becomes documentation Claude skips.

```yaml
# BAD: Summarizes workflow - Claude may follow this instead of reading skill
description: Use for TDD - write test first, watch it fail, write minimal code

# GOOD: Triggering conditions only
description: Use when implementing any feature or bugfix, before writing implementation code
```

## Keyword Coverage

Use words Claude would search for:
- Error messages, symptoms, synonyms
- Tools: actual commands, library names, file types

## Descriptive Naming

| Rule | Details |
|------|---------|
| Prefix | `arc-` required |
| Case | kebab-case |
| Voice | Verb-first, active |
| Form | Gerund (-ing) for process skills |
| Structure | `arc-<action>[-<object>[-<scope>]]` |

**Patterns:**

| Pattern | When | Example |
|---------|------|---------|
| `arc-<gerund>` | Single action | `arc-brainstorming`, `arc-debugging` |
| `arc-<gerund>-<object>` | Action + target | `arc-writing-tasks`, `arc-managing-sessions` |
| `arc-using-<tool>` | Tool usage | `arc-using-worktrees` |
| `arc-<acronym>` | Well-known abbreviation | `arc-tdd` |

**Avoid:**
- Agent-nouns: `arc-coordinator` → `arc-coordinating` <!-- doc-ref-lint: ignore R4 deliberately-wrong naming anti-pattern shown for teaching, not a skill reference -->
- Bare verbs: `arc-debug` → `arc-debugging` <!-- doc-ref-lint: ignore R4 deliberately-wrong naming anti-pattern shown for teaching, not a skill reference -->
- Noun-first: `arc-task-writer` → `arc-writing-tasks` <!-- doc-ref-lint: ignore R4 deliberately-wrong naming anti-pattern shown for teaching, not a skill reference -->

## 3-Level Loading Model

Skills use progressive disclosure — not everything loads at once:

| Level | What loads | When | Token cost |
|-------|-----------|------|------------|
| **1. Description** | `name` + `description` frontmatter | Always in context | ~100 tokens per skill |
| **2. SKILL.md body** | Full markdown content | On skill invocation | 500–4,000 tokens |
| **3. References** | Files in `references/`, `agents/`, etc. | On-demand when agent reads them | Zero until needed |

**Keep SKILL.md lean and high-signal. Move detail to references.**

## Flowchart Usage

**Use flowcharts ONLY for:** non-obvious decision points, process loops where you might stop too early, "when to use A vs B" decisions.

**Never use flowcharts for:** reference material (use tables/lists), code examples (use markdown blocks), linear instructions (use numbered lists), labels without semantic meaning (step1, helper2).

See `graphviz-conventions.dot` for graphviz style rules. Use `render-graphs.js` to render a skill's flowcharts to SVG:

```bash
"${SKILL_ROOT}/render-graphs.js" ../some-skill           # Each diagram separately
"${SKILL_ROOT}/render-graphs.js" ../some-skill --combine # All diagrams in one SVG
```
