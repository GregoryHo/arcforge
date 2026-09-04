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
  pending action notifications, stale-draft warnings (only for drafts written
  since the learning opt-in took effect — stubs from a learning-off period are
  by design, so counting them would report the whole backlog the moment a user
  opts in). A queued `reflect-ready` is dropped at delivery when learning is off
  in both scopes, so disabling it between the queuing Stop and this SessionStart
  retracts the invitation rather than spending it; the action is consumed either
  way, so a suppressed nudge never resurfaces later with a stale count.
  `diary-ready` is unaffected — it points at an artifact that exists and can be
  read now.
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
- **Above the diary threshold**, parses the transcript (`parseTranscript`) and
  records the tool names and modified-file paths it yields. With nothing parsed
  — below the threshold, or above it with no readable transcript — a Stop clears
  `filesModified`, while `toolsUsed` is neither written nor cleared: a record an
  earlier parse filled keeps that turn's tool list until a later parse refreshes
  it
- Stores verbatim recent user messages (`userMessageContent`) on that same
  threshold hit, and then **only when learning is enabled in some scope**.
  Removal is the half that is unconditional: every Stop drops the field when
  learning reads off, above or below the threshold, so prose captured under an
  earlier opt-in does not survive the opt-out, and an opt-out takes effect on the
  next Stop either way
- Runs diary-capture (threshold-gated draft + counter reset; the enricher spawn
  is behind the same learning opt-in)
- Queues the `reflect-ready` nudge **only when learning is enabled in some
  scope** — reflection is the learning loop, and with learning off the diaries
  it counts never get processed, so the nudge would re-queue at every threshold
  hit forever
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
  "userMessages": 12,
  "toolsUsed": ["Read", "Edit", "Bash"],
  "filesModified": [
    "src/foo.ts",
    "tests/foo.test.ts"
  ],
  "compactions": []
}
```

Every field above is continuity: the learning opt-in never gates any of them.
The diary threshold does gate the two the transcript supplies — `toolsUsed` and
`filesModified` are refreshed only on a Stop or compaction that hits the
threshold, and below it a Stop clears `filesModified` and leaves `toolsUsed` as
an earlier parse wrote it. `compactions` is seeded empty here; the PreCompact
hook appends to it and documents the populated shape. Other hooks stamp their
own fields into the same record and document those themselves.
One field is deliberately absent because it is not continuity:
`userMessageContent` — the last 10 user messages, each truncated — is written
on that same threshold hit and only when learning is enabled in some scope, and
is removed again, at any threshold, the first time a Stop or a compaction
stamps the record with learning off.

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
