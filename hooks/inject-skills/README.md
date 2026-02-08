# inject-skills

Injects `arc-using` skill content into every Claude Code session.

## Hook Event

**SessionStart** - triggers on `startup`, `resume`, `clear`, `compact`

## How it works

1. Reads the `arc-using` SKILL.md content from the plugin cache
2. Wraps content in `<EXTREMELY_IMPORTANT>` tags for priority injection
3. Escapes content for JSON output
4. Returns `additionalContext` that gets injected into Claude's system prompt

## Context Wrapper

The skill content is wrapped in emphasis tags to ensure Claude prioritizes it:

```xml
<EXTREMELY_IMPORTANT>
You have arcforge skills.

**Below is the full content of your 'arc-using' skill...**

[skill content here]
</EXTREMELY_IMPORTANT>
```

This wrapper is intentional - it tells Claude to treat the skill instructions as high-priority system context rather than optional guidance.

## Output format

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>...</EXTREMELY_IMPORTANT>"
  }
}
```
