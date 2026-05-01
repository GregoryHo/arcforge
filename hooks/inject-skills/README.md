# inject-skills

Injects a minimal ArcForge bootstrap into every Claude Code session.

## Hook Event

**SessionStart** - triggers on `startup`, `resume`, `clear`, `compact`

## How it works

1. Determines the ArcForge plugin root.
2. Exports `ARCFORGE_ROOT` through `CLAUDE_ENV_FILE` when available.
3. Emits compact `additionalContext` that says ArcForge skills are available and should be used on demand.

The hook intentionally does **not** inject the full `arc-using` skill. The bootstrap should preserve harness/eval isolation and avoid turning ArcForge into an always-on workflow policy.

## Context Wrapper

The injected context is plain guidance, not an emphasis wrapper:

```text
ArcForge skills are available for this project.
ARCFORGE_ROOT=...
Use ArcForge as a minimal, composable toolkit...
```

Agents should read or invoke specific skills when they are useful for the task, and proceed directly for simple, read-only, grading, or isolated eval work.

## Output format

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "ArcForge skills are available..."
  }
}
```
