---
name: arc-receiving-review
description: Use when receiving code review feedback, requires technical rigor not performative agreement
---

# arc-receiving-review

## Core Principle

Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## The Response Pattern

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each

## Forbidden Responses

- ❌ "You're absolutely right!"
- ❌ "Great point!" / "Excellent feedback!"
- ❌ "Let me implement that now" (before verification)
- ❌ ANY gratitude expression ("Thanks for...")

## Handling Unclear Feedback

IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on ALL unclear items

WHY: Partial understanding = wrong implementation

## Source-Specific Handling

**From your human partner:**
- Trusted input, implement after understanding
- Still ask if scope is unclear
- No performative agreement

**If external feedback conflicts with human partner:**
- Stop and discuss with your human partner before implementing

## When To Push Back

- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack

**Pushback examples:**

```
"I checked the current usage and this endpoint isn't called. Do we want to remove it (YAGNI) or keep it for future use?"
```

```
"This change would drop support for <legacy target>. If we still need that target, I can fix the issue without removing support."
```

## YAGNI Check

IF reviewer suggests "implementing properly":
  grep codebase for actual usage
  IF unused: "This isn't called. Remove it (YAGNI)?"

## Integration

- **Called by:** arc-agent-driven, arc-requesting-review
- **Related:** arc-verifying (verification mindset)
