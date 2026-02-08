# User Message Counter Hook

Counts user prompt submissions for session evaluation.

## Purpose

Tracks the number of user messages in a session to determine if the session is "long enough" to potentially contain extractable learning patterns.

## How It Works

1. **UserPromptSubmit hook** increments a counter on each user message
2. Counter stored in temp file: `$TMPDIR/arcforge-user-count-<project>-<date>`
3. Counter read by `session-evaluator` on Stop to evaluate session
4. Counter resets **only when threshold is met** (in `pre-compact/main.js` or `session-tracker/end.js`)

**Note:** Counters accumulate across resume/exit cycles until the threshold is reached (`userCount >= 10 OR toolCount >= 50`). This allows meaningful sessions to be captured even if split across multiple short sessions.

## Trigger

- **UserPromptSubmit**: All user prompts

## Counter File

```
$TMPDIR/arcforge-user-count-arcforge-2025-01-24
```

Contains a single integer representing the count.

## Exported Functions

```javascript
const { readCount, resetCounter } = require('../user-message-counter/main');

// Read current count
const count = readCount();  // e.g., 15

// Reset counter (called from session-tracker/start.js)
resetCounter();
```

## Design Notes

**Why temp file instead of reading transcript?**
- Memory safe (transcripts can grow large)
- Follows existing compact-suggester pattern
- No dependency on CLAUDE_TRANSCRIPT_PATH availability
