# Session Tracker Hook

Provides session persistence across Claude Code sessions.

## Features

### On Session Start
- Loads context from recent sessions (last 7 days)
- Shows notes, tool counts, and modified files from previous session
- Initializes new session file
- Filters out diary files (`diary-*.md`) from session loading

**Note:** Counters are NOT reset on session start. They accumulate across sessions until the threshold is met (in `pre-compact/main.js` or `session-tracker/end.js`).

### On Session End (Stop)
- Saves session metrics (duration, tool calls)
- Records modified files from git status
- Outputs session summary

## Triggers

- **SessionStart**: `startup|resume` (but not clear/compact - those are handled by inject-skills)
- **Stop**: All stop events

## Storage

Sessions stored in `~/.claude/sessions/` in both JSON and Markdown formats:
```
~/.claude/sessions/
├── my-project-2025-01-24.json    # Machine-readable
├── my-project-2025-01-24.md      # Human-readable summary
├── my-project-2025-01-23.json
├── my-project-2025-01-23.md
└── other-project-2025-01-24.json
```

## Session File Format

```json
{
  "project": "my-project",
  "started": "2025-01-24T10:00:00.000Z",
  "lastUpdated": "2025-01-24T12:30:00.000Z",
  "toolCalls": 47,
  "filesModified": [
    "src/foo.ts",
    "tests/foo.test.ts"
  ],
  "notes": "Working on hooks implementation"
}
```

## Markdown Summary Format

Each session also generates a human-readable `.md` file:

```markdown
# Session: my-project
**Date:** 2025-01-24

## Metrics
- **Duration:** ~45 minutes
- **Tool calls:** 47
- **Compactions:** 2

## Files Modified
- `src/foo.ts`
- `tests/foo.test.ts`

## Compaction Timeline
1. 11:00 - Compaction
2. 12:00 - Compaction

## Notes
Working on hooks implementation

---
*Generated at 2025-01-24T12:30:00.000Z*
```

## Output Examples

### Session Start
If previous session exists:
```
## Previous Session Context

**Notes from last session:** Working on hooks implementation
**Tool calls in last session:** 47

**Files modified:**
- src/foo.ts
- tests/foo.test.ts

**Session duration:** ~150 minutes
```

### Session End
```
📝 Session Summary:
  Duration: ~45 minutes
  Tool calls: 32
  Files modified: 5
  Session saved to: ~/.claude/sessions/my-project-2025-01-24.json
```

## Editing Notes

You can manually edit the session JSON to add notes:
```bash
vim ~/.claude/sessions/my-project-2025-01-24.json
```

Change the `notes` field to leave yourself reminders for next session.
