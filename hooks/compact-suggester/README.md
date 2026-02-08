# Compact Suggester Hook

Tracks tool call count and suggests `/compact` at strategic intervals.

## Behavior

- **Threshold**: First suggestion at 50 tool calls
- **Interval**: Reminders every 25 calls after threshold (75, 100, 125, ...)
- **Reset**: Counter resets on session start/clear/compact

## Trigger

Runs on `PostToolUse` for ALL tools (matcher: `.*`)

## Storage

Counter stored in temp directory:
```
$TMPDIR/arcforge-tool-count-<project>-<date>
```

## Output Examples

At 50 calls:
```
📊 You've made 50 tool calls this session. Consider using /compact at your next phase boundary to preserve context quality.
```

At 75, 100, 125... calls:
```
📊 Now at 75 tool calls. Reminder: /compact helps maintain context quality for longer sessions.
```

## Why This Matters

Claude Code has limited context window. Long sessions accumulate tool call history which can:
- Reduce available context for actual coding
- Cause Claude to lose track of earlier work
- Slow down response times

Strategic compaction at phase boundaries (after completing a feature, before starting new work) helps maintain context quality.
