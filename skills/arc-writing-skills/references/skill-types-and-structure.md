# Skill Types, Structure, and Anti-Patterns

Reference depth for arc-writing-skills. Load when designing a new skill's type, folder layout, or frontmatter.

## TDD Mapping for Skills

| TDD Concept | Skill Creation |
|-------------|----------------|
| **Test case** | Pressure scenario with subagent |
| **Production code** | Skill document (SKILL.md) |
| **Test fails (RED)** | Agent violates rule without skill (baseline) |
| **Test passes (GREEN)** | Agent complies with skill present |
| **Refactor** | Close loopholes while maintaining compliance |
| **Write test first** | Run baseline scenario BEFORE writing skill |
| **Watch it fail** | Document exact rationalizations agent uses |
| **Minimal code** | Write skill addressing those specific violations |
| **Watch it pass** | Verify agent now complies |
| **Refactor cycle** | Find new rationalizations → plug → re-verify |

## By Content (what the skill teaches)

- **Technique** — Concrete method with steps to follow (e.g., condition-based-waiting)
- **Pattern** — Way of thinking about problems (e.g., flatten-with-flags)
- **Reference** — API docs, syntax guides, tool documentation

## Design Anti-Patterns

Discovered through eval — don't repeat:

- **"Mindset" skills** — AI agents don't internalize mindsets. A skill that says "embed me in everything" relies on copy-paste, which is unreliable. Use bounded routing conditions to trigger discipline skills instead.
- **Self-contradicting invocation** — Never write "don't invoke me" in a skill that's registered in the routing table. The routing table says "invoke it"; the skill says "don't invoke me" → agent obeys the prohibition.
- **Embedded-only verification** — Verification embedded in other skills (arc-finishing Step 1, arc-tdd Verify RED/GREEN) is defense-in-depth, not the primary mechanism. The primary trigger is the routing table.
- **Narrative example** — "In session 2025-10-03, we found..." — too specific, not reusable.
- **Multi-language dilution** — example-js.js, example-py.py, example-go.go — mediocre quality, maintenance burden.
- **Code in flowcharts** — can't copy-paste, hard to read.
- **Generic labels** — helper1, helper2, step3 — labels should have semantic meaning.

## Directory Structure

| Platform | Skills Directory |
|----------|------------------|
| Claude Code | `~/.claude/skills/` |
| Codex | `~/.agents/skills/` |

> arcforge installs into these directories via symlink: Codex uses `~/.agents/skills/arcforge` → `~/.agents/arcforge/skills` (see `.codex/INSTALL.md`).

```
skills/
  skill-name/
    SKILL.md              # Core logic and decisions (required)
    references/           # Detailed material, loaded on-demand
    scripts/              # Executable utilities (run, not loaded)
    agents/               # Subagent templates
```

- **What stays in SKILL.md:** Core rule, decision logic, routing, red flags, checklists.
- **What moves to `references/`:** Detailed examples, API docs, comprehensive syntax, lengthy tables, extended rationale.
- **Keep inline:** Principles, concepts, code patterns (< 50 lines).

## Frontmatter — Optional Fields

Use only when they earn their place:

| Field | Use when |
|---|---|
| `argument-hint` | Skill takes CLI-style arguments you want surfaced in the slash-command palette (e.g., `arc-maintaining-obsidian`). Pure UX — no triggering effect. |
| `allowed-tools` | You want to constrain which tools the skill may use. Defense in depth at the skill layer. |
| `disable-model-invocation` | Skill must be **user-invocable only**, never auto-triggered by the model. |
| `user-invocable` | Skill should appear in the slash command list. |

Avoid `model`, `context`, `agent`, `hooks` unless you have a concrete reason — those couple the skill to runtime concerns better managed at the plugin or settings level.

## SKILL.md Section Template

```markdown
---
name: Skill-Name-With-Hyphens
description: Use when [specific triggering conditions and symptoms]
---

# Skill Name

## Overview
Core principle in 1-2 sentences.

## When to Use
Bullet list with SYMPTOMS and use cases. When NOT to use.

## Core Pattern
Before/after code comparison (for techniques/patterns)

## Quick Reference
Table or bullets for scanning

## Common Mistakes
What goes wrong + fixes
```

## When to Split into References

Split when any of these are true:
- A section has **100+ lines** of examples, tables, or API docs
- Content is only needed for **specific subtasks**, not the core flow
- The same reference material applies to **multiple skills**
- SKILL.md is approaching its tier limit and has extractable detail

For large reference files (300+ lines), include a table of contents at the top.

### Word Count Tiers (soft guidance)

| Tier | Limit | Use for |
|------|-------|---------|
| Lean | <500w | Simple triggers, thin wrappers |
| Standard | <1000w | Most workflow skills |
| Comprehensive | <1800w | Complex multi-path skills |
| Meta | <2500w | Self-referential teaching skills |

## Testing by Skill Type

- **Discipline-enforcing (rules):** academic questions (do they understand?), pressure scenarios (do they comply under stress?), combined pressures (time + sunk cost + exhaustion). Success: follows rule under maximum pressure.
- **Technique (how-to):** application, variation, and gap-testing scenarios. Success: applies technique correctly.
- **Pattern (mental model):** recognition scenarios + counter-examples. Success: identifies when/how to apply.
- **Reference (docs/APIs):** retrieval + application scenarios. Success: finds and correctly applies the reference.
