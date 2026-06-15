# PreCompact Hook

Records context compaction events for session tracking and captures the session
diary when the threshold is met.

## What It Does

1. **Resolves the session id from stdin** (`parseStdinJson` + `setSessionIdFromInput`)
   before touching any counter, so the counts read belong to the live session.

2. **Updates the current session file** with compaction markers
   - Adds timestamp to `compactions` array
   - Sets `lastCompaction` field

3. **Threshold-triggered behavior** (when `userCount >= 10 OR toolCount >= 50`):
   Delegates to the shared diary-capture core (`scripts/lib/diary-capture.js`),
   the same path the Stop hook runs:
   - Generates the auto-diary draft
   - Spawns the background diary enricher (dual path — Stop AND PreCompact)
   - Resets both counters (the sole reset path)

   Then it queues a `diary-ready` pending action for the next `SessionStart`.
   PreCompact stdout is reserved for the transcript channel and cannot render a
   `systemMessage`, so the notification is deferred to inject-context.

4. **Below threshold**:
   - Preserves counters for future accumulation

## Threshold Logic

Uses shared threshold from `scripts/lib/thresholds.js`:

```javascript
userCount >= 10 || toolCount >= 50
```

This ensures diary capture only happens for meaningful sessions.

## Notification (pending action, not systemMessage)

When the threshold is met, the hook calls `addPendingAction(project, 'diary-ready', …)`.
The next `SessionStart(source: "compact")` surfaces it via inject-context.js as
"📝 Diary draft ready — use /arcforge:arc-journaling …".

## Session File Format

After compaction, the session file includes:

```json
{
  "project": "arcforge",
  "started": "2025-01-24T10:00:00.000Z",
  "lastUpdated": "2025-01-24T12:00:00.000Z",
  "toolCalls": 47,
  "userMessages": 15,
  "filesModified": ["src/foo.ts"],
  "compactions": [
    "2025-01-24T11:00:00.000Z",
    "2025-01-24T12:00:00.000Z"
  ],
  "lastCompaction": "2025-01-24T12:00:00.000Z"
}
```

## Non-Blocking Design

The hook is designed to **never block compaction**:
- All errors are caught and logged to stderr
- Always exits with code 0
- Passes through stdin unchanged for hook chaining

## Trigger

- **Event**: `PreCompact`
- **Matcher**: `.*` (all compaction events)
