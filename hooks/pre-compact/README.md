# PreCompact Hook

Records context compaction events for session tracking and triggers diary prompts when threshold is met.

## What It Does

1. **Logs compaction events** to `~/.claude/sessions/<project>/compaction-log.txt`
   - Format: `[YYYY-MM-DDTHH:MM:SS.sssZ] Context compaction - sessionId: <id>`
   - Append-only log for historical tracking

2. **Updates current session file** with compaction markers
   - Adds timestamp to `compactions` array
   - Sets `lastCompaction` field

3. **Threshold-triggered behavior** (when `userCount >= 10 OR toolCount >= 50`):
   - Updates session with current user/tool counts
   - Generates markdown summary file (`<sessionId>.md`)
   - Prompts user to run `/diary` skill
   - Resets both counters (user messages and tool calls)

4. **Below threshold**:
   - Preserves counters for future accumulation
   - Shows current count status

## Threshold Logic

Uses shared threshold from `lib/thresholds.js`:

```javascript
userCount >= 10 || toolCount >= 50
```

This ensures diary prompts only appear for meaningful sessions.

## Output Examples

**Threshold met:**
```
📝 Context compaction detected. (15 messages, 47 tool calls)

Please use /diary skill immediately to capture session reflections before context is compacted.
```

**Below threshold:**
```
📝 Context compaction. (3 messages, 12 tool calls)
   Below threshold - counters preserved.
```

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
