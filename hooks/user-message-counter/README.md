# User Message Counter Hook

Counts user prompt submissions toward the diary-capture trigger.

## Purpose

Tracks the number of user messages in a session so diary-capture can decide
whether the session is "long enough" to potentially contain extractable
learning patterns.

## How It Works

1. **UserPromptSubmit hook** increments the `user-count` counter on each user message.
2. Counter stored in a session-scoped temp file (see [Counter File](#counter-file)).
3. The counter is **read and reset only by `diary-capture.js`** (via `readCounts()` /
   `resetCounters()`), invoked from the Stop hook (`session-tracker/end.js`) and the
   PreCompact hook (`pre-compact/main.js`).

## Counter-Ownership Contract

`diary-capture.js` defines a single-writer-per-counter contract (ICL-8):

| Counter | Written by | Read + reset by |
|---------|-----------|-----------------|
| `user-count` | **this hook** (UserPromptSubmit) | `diary-capture.js` |
| `tool-count` | `compact-suggester` via `incrementSharedToolCount()` | `diary-capture.js` |

This hook is the **sole writer** of `user-count`. It never reads or resets —
those roles belong exclusively to `diary-capture.js`, which is also the sole
reset path. There is no reset on session start.

**Note:** Counters accumulate across resume/exit cycles until the threshold is
reached (`userCount >= 10 OR toolCount >= 50`, per `scripts/lib/thresholds.js`).
This lets meaningful sessions be captured even when split across several short
sessions. The reset fires only when the threshold is met inside `runDiaryCapture`.

## Trigger

- **UserPromptSubmit**: All user prompts

## Counter File

Session-scoped, in the system temp dir:

```
$TMPDIR/arcforge-user-count-<session-id>
```

Contains a single integer representing the count.

## Exported Functions

```javascript
const { readCount, writeCount, resetCounter, getCounterFilePath } =
  require('../user-message-counter/main');
```

These thin wrappers over the shared `createSessionCounter('user-count')` exist
for tests; production read/reset go through `diary-capture.js` per the
counter-ownership contract above.

## Design Notes

**Why a temp file instead of reading the transcript?**
- Memory safe (transcripts can grow large)
- Follows the existing compact-suggester pattern
- No dependency on `CLAUDE_TRANSCRIPT_PATH` availability
