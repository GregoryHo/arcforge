# Session Tracker Hook

Provides session persistence and SessionStart context injection.

## Scripts

| Script | Event | Mode | Role |
|--------|-------|------|------|
| `inject-context.js` | SessionStart | sync | Inject context to Claude + a user summary |
| `start.js` | SessionStart | async | Background init (session file, observer daemon, decay) |
| `end.js` | Stop | — | Session metrics + diary-capture |

## Features

### On Session Start — context injection (`inject-context.js`, sync)

Emits one combined JSON with two channels (see `hooks.md` → Output Visibility):

- **additionalContext** (Claude-visible): activated behavioral instincts,
  pending action notifications, stale-draft warnings.
- **systemMessage** (user-visible): a brief one-line summary, plus
  discoverability hints (available session aliases, recent global promotions).

Activated instincts are **activation-gated** (ICL-4): an instinct is injected
only when a reviewer explicitly activated it on the dashboard and has not since
deactivated it. Confidence sorts and caps the list at the **top 5** — it is never
a threshold. The `inject_activated_instincts` kill-switch is **default ON**; an
explicit `false` in the global learning config silences injection.

### On Session Start — background tasks (`start.js`, async)

- Initializes the new session file (filters out diary files `diary-*.md`)
- Checks/starts the observer daemon
- Runs decay cycles on instincts

**Note:** Diary-trigger counters are NOT reset on session start. They accumulate
across sessions until the threshold is met; reset is owned exclusively by
`diary-capture.js` (run from `end.js` and `pre-compact/main.js`).

### On Session End (Stop) — `end.js`
- Saves session metrics (duration, tool calls)
- Records modified files from git status
- Runs diary-capture (threshold-gated draft + counter reset)
- Outputs session summary

## Triggers

- **SessionStart**: `startup|resume` (but not clear/compact - those are handled by inject-skills)
- **Stop**: All stop events

## Storage

Sessions stored in `~/.arcforge/sessions/` as JSON:
```
~/.arcforge/sessions/
├── my-project-2025-01-24.json    # Machine-readable
├── my-project-2025-01-23.json
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
  Session saved to: ~/.arcforge/sessions/my-project-2025-01-24.json
```

## Editing Notes

You can manually edit the session JSON to add notes:
```bash
vim ~/.arcforge/sessions/my-project-2025-01-24.json
```

Change the `notes` field to leave yourself reminders for next session.
