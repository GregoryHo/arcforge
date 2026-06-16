# Compact Suggester Hook

Tracks tool call count and suggests `/compact` at strategic intervals.

## Behavior

- **Threshold**: First suggestion at 50 tool calls
- **Interval**: Reminders every 25 calls after threshold (75, 100, 125, ...)
- **Phase-aware**: messaging reflects the current phase using a rolling window of
  the most recent 20 tool types (read-heavy / write-heavy / neutral), not the
  lifetime average — so a long research phase early in the session no longer
  masks a later implementation phase.
- **Reset**: State is reset on every compaction by the PreCompact hook (via the
  shared `getSuggesterStatePath()` helper), so suggestions never survive a
  context boundary.

## Trigger

Runs on `PostToolUse` for ALL tools (matcher: `.*`)

## Storage

A single session-scoped JSON state file in the temp directory:
```
$TMPDIR/arcforge-suggester-state-<sessionId>.json
```

Shape:
```json
{
  "tools": 0,
  "reads": 0,
  "writes": 0,
  "window": ["r", "w", "..."],
  "suggestions": [{ "count": 50, "phase": "neutral", "at": "<iso>" }]
}
```

All counters, the rolling phase window, and the suggestion snapshots live in
this one file (1 read + 1 write per hook invocation). The canonical path is
owned by `getSuggesterStatePath()` in `scripts/lib/diary-capture.js` so the
writer and the PreCompact resetter always agree on one filename.

The separate `arcforge-tool-count-<sessionId>` file is the **diary threshold's**
source of truth — incremented here via `incrementSharedToolCount()` (owned by
diary-capture). It is intentionally distinct from the suggester's own counter so
the diary trigger and the compaction suggestion share no fragile coupling.

## Session record

Each time a suggestion fires, a snapshot `{ count, phase, at }` is appended to
the live session JSON (`suggestions[]`) so the timing of suggestions can later be
correlated against compaction events.

## Output Examples

At 50 calls (neutral phase):
```
📊 50 tool calls this session. If you're between workflow phases, consider /compact to preserve context quality. Use arc-compacting for timing guidance.
```

At 75, 100, 125... calls:
```
📊 75 tool calls. Between phases? /compact helps maintain context quality for longer sessions.
```

## Why This Matters

Claude Code has limited context window. Long sessions accumulate tool call history which can:
- Reduce available context for actual coding
- Cause Claude to lose track of earlier work
- Slow down response times

Strategic compaction at phase boundaries (after completing a feature, before starting new work) helps maintain context quality.
