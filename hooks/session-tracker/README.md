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
- Records modified files from transcript parsing (parseTranscript)
- Runs diary-capture (threshold-gated draft + counter reset)
- Outputs session summary

## Triggers

- **SessionStart** (`inject-context.js`): `startup|resume|clear|compact` — runs on every SessionStart source, including compact.
- **SessionStart** (`start.js`): `startup|resume|clear` — does not run on `compact` (background init should not re-run mid-compaction).
- **Stop** (`end.js`): all Stop events.

## Storage

Sessions stored in `~/.arcforge/sessions/{project}/{date}/` as JSON:
```
~/.arcforge/sessions/
├── my-project/
│   ├── 2025-01-24/
│   │   └── {sessionId}.json    # Machine-readable
│   └── 2025-01-23/
│       └── {sessionId}.json
└── other-project/
    └── 2025-01-24/
        └── {sessionId}.json
```

## Session File Format

```json
{
  "sessionId": "abc123",
  "project": "my-project",
  "date": "2025-01-24",
  "started": "2025-01-24T10:00:00.000Z",
  "lastUpdated": "2025-01-24T12:30:00.000Z",
  "toolCalls": 47,
  "filesModified": [
    "src/foo.ts",
    "tests/foo.test.ts"
  ]
}
```

## Output Examples

### Session Start
`inject-context.js` builds a brief `systemMessage` summary from whichever of
these are present — active instincts, pending action notifications, a
stale-draft warning, available session aliases, and recent global promotions
(full detail goes to Claude via `additionalContext`):

```
2 active instincts | 1 pending action | 3 unenriched drafts | 2 session aliases | 1 new global promotion
```

### Session End
`end.js` only surfaces a user-visible `systemMessage` when the diary
threshold fired on this Stop; otherwise the same summary is logged to
stderr only (invisible to the user):

```
📝 Session paused. (12 messages, 47 tool calls)
   Diary captured; counters reset for next session.
```

Below threshold (stderr only, not shown to the user):
```
📝 Session paused. (12 messages, 47 tool calls)
   Counters preserved for next resume.
```

## Leaving Notes for Next Session

The session JSON is not read back by any hook — editing it does not
communicate anything to a future session. To leave yourself a message for
next time, write a handover with `/sessions` instead of editing the
session JSON directly.
