---
paths:
  - "templates/**"
  - "commands/**"
  - "agents/**"
---

# Templates, Commands & Agents

## Templates

Location: `templates/<name>-prompt.md`

### Format

- Use `{VARIABLE}` placeholders for dynamic content
- Follow consistent structure:
  1. Role definition
  2. Workflow steps
  3. Rules and constraints
  4. Anti-patterns
  5. Report format (if applicable)

Reference existing templates: `implementer-prompt.md`, `quality-reviewer-prompt.md`, `spec-reviewer-prompt.md`.

## Commands

Location: `commands/<name>.md`

### Format

```yaml
---
description: "Brief description shown in /help"
disable-model-invocation: true
---

Invoke the arc-<skill-name> skill and follow it exactly as presented to you
```

- Commands are thin delegation wrappers only — they are never standalone workflows
- Body: single invoke line delegating to a skill
- `disable-model-invocation: true` prevents Claude from auto-invoking the command

## Agents

Location: `agents/<name>.md`

### Format

```yaml
---
name: <name>
description: |
  When to invoke this agent (include examples for Claude's routing)
model: inherit
---

You are a [role] specialist.

## Your Role
...

## Workflow
...

## Protocol
...
```

- `description`: include concrete examples so Claude's router picks the right agent
- `model: inherit`: use the parent conversation's model unless there's a reason to override
- Body: role → workflow → protocol structure
