# Session Evaluator Hook

Suggests pattern extraction for long sessions.

## Purpose

At session end, checks if the session was substantial enough to potentially contain extractable learning patterns. If so, prompts the user to consider using `/reflect`.

## How It Works

1. Runs on **Stop** event (after session-tracker/end.js)
2. Reads user message count from user-message-counter
3. Reads tool call count from compact-suggester
4. If threshold met, outputs suggestion to stderr

## Trigger

- **Stop**: All stop events

## Threshold Logic

Thresholds are defined in `lib/thresholds.js`:
- **minUserMessages**: 10 (at least 10 user prompts)
- **minToolCalls**: 50 (at least 50 tool calls)

**OR logic**: Either condition triggers the suggestion (not both required).

```javascript
// From lib/thresholds.js
userCount >= 10 || toolCount >= 50
```

## Output

When threshold met:
```
╔════════════════════════════════════════════════╗
║ 📊 Session Evaluation                          ║
╠════════════════════════════════════════════════╣
║ 15 user messages, 47 tool calls                ║
║                                                ║
║ Consider extracting patterns with /reflect     ║
║                                                ║
║ Sessions: ~/.claude/sessions/<project>/        ║
╚════════════════════════════════════════════════╝
```

## Design Notes

**Non-blocking:** Always exits 0, even on errors. Never disrupts session end.

**Non-intrusive:** Only suggests, never forces. User decides whether to run `/reflect`.

**Why these criteria?**
- **User messages** proxy for session complexity/length
- **Tool calls** indicate substantial interaction with codebase (50+ = significant work)
