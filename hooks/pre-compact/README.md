# PreCompact Hook

Records context compaction events for session tracking and captures the session
diary when the threshold is met.

## What It Does

1. **Resolves the session id from stdin** (`parseStdinJson` + `setSessionIdFromInput`)
   before touching any counter, so the counts read belong to the live session.

2. **Updates the current session file** with compaction markers
   - Adds timestamp to `compactions` array
   - Sets `lastCompaction` field
   - Above the diary threshold, stamps *this* compaction's counts
     (`userMessages`, `toolCalls`) and — when the PreCompact payload carries a
     `transcript_path` — the `toolsUsed` and `filesModified` that transcript
     parses to, reusing the same shared stamp the Stop hook runs. This happens
     **before** the draft is generated in step 3, because the draft is rendered
     from the record: a compaction that reaches the threshold before any Stop
     has closed the record would otherwise report the previous turn's numbers
     and none of the paths it touched. With nothing to parse, the record keeps
     the paths an earlier Stop wrote rather than being blanked. Below the
     threshold nothing is stamped and the transcript is never parsed — no draft
     is rendered there, so the parse would be wasted work on the compaction path.
   - Writes `userMessageContent` only while the learning opt-in reads on, and
     deletes it when it reads off. Stamping the marker rewrites the whole
     record, so the gate that governs capture governs what survives the rewrite
     (D-010); an absent project root reads as no consent and prunes.

3. **Threshold-triggered behavior** (when `userCount >= 10 OR toolCount >= 50`):
   Delegates to the shared diary-capture core (`scripts/lib/diary-capture.js`),
   the same path the Stop hook runs:
   - Generates the auto-diary draft (always — it is built from the session
     record's metadata, none of which the opt-in gates, and step 2 has just
     refreshed it)
   - Spawns the background diary enricher **only when learning is enabled in
     some scope** (dual path — Stop AND PreCompact), handing it the same
     session summary the Stop hook builds — the prose, tool names, paths and
     stats line of the record step 2 just stamped, not an empty object. With
     learning off the draft keeps its `TO BE ENRICHED` stubs; that is the
     contract, not a failure. `projectRoot` is passed explicitly so the opt-in
     is read from the project, not from the compaction cwd.
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
"📝 Diary draft ready …" pointing at /arcforge:learning.

## Session File Format

After compaction, the session file includes:

```json
{
  "project": "arcforge",
  "started": "2025-01-24T10:00:00.000Z",
  "lastUpdated": "2025-01-24T12:00:00.000Z",
  "toolCalls": 47,
  "userMessages": 15,
  "toolsUsed": ["Read", "Edit"],
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
