---
paths:
  - "hooks/**"
---

# Hooks

## Language

- Node.js only (exception: `inject-skills/main.sh` for environment injection)
- Must be cross-platform — no bash for hook logic

## Structure

```
hooks/
  hooks.json              # Hook registration
  run-hook.cmd            # Dispatcher
  <hook-name>/
    main.js               # Entry point
    README.md             # Hook documentation
```

## Error Handling

Silent catch — hooks must never crash the session:
```js
try { /* hook logic */ } catch { /* silently continue */ }
```

## Hook Input Schema

All hooks receive JSON via stdin. Common fields across all events:

| Field | All Events | Notes |
|-------|-----------|-------|
| `session_id` | ✓ | UUID |
| `transcript_path` | ✓ | Full path to session transcript |
| `cwd` | ✓ | Project working directory |
| `hook_event_name` | ✓ | Event type string |

Event-specific fields:

| Event | Extra Fields |
|-------|-------------|
| SessionStart | `source` (`startup\|resume\|clear\|compact`) |
| UserPromptSubmit | `permission_mode`, `prompt` |
| PreToolUse | `permission_mode`, `tool_name`, `tool_input`, `tool_use_id` |
| PostToolUse | `permission_mode`, `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| Stop | `permission_mode`, `stop_hook_active`, `last_assistant_message` |
| SessionEnd | `reason` |

**IMPORTANT**: SessionStart uses `source` (not `trigger`). Values: `startup`, `resume`, `clear`, `compact`.

Use `readStdinSync()` + `parseStdinJson()` from `scripts/lib/utils.js` to read.

## Output Visibility

**Who sees hook output depends on the mechanism used:**

| Mechanism | Audience | Visible? | Use for |
|-----------|----------|----------|---------|
| `stderr` (`log()`, `console.error()`) | **Nobody** | **NO** — condensed into "N hooks ran", invisible even in Ctrl+O | Internal diagnostics only |
| `stdout` `{"systemMessage": "..."}` | **User (always)** | **YES** — shown as "HookEvent:Tool says:" | Suggestions, warnings, notifications |
| `stdout` `{"hookSpecificOutput": {"additionalContext": "..."}}` | **Claude** | YES — injected into context | Context injection (SessionStart, UserPromptSubmit only) |
| Exit code 2 | Claude Code engine | N/A — blocks action | Blocking hooks only (PreToolUse, UserPromptSubmit, Stop) |

**CRITICAL**: `stderr` is **invisible** in all events (verified: PostToolUse, Stop). Claude Code condenses it regardless of hook count. Do NOT use stderr for anything the user needs to see.

**Rules:**
- User-visible message → `output({ systemMessage: "..." })` (only mechanism that works)
- Context for Claude → `outputContext(text, eventName)` (SessionStart/UserPromptSubmit only)
- Both at once → `outputCombined(userMsg, claudeCtx, eventName)` (verified: Claude Code processes all keys in a single JSON)
- Internal diagnostics → `log(msg)` (stderr, but user will never see it)
- Never use `console.log` — goes to stdout, contaminates hook protocol

## Shared Utilities

Import from `scripts/lib/utils.js` (canonical source):
- `readStdinSync()` — read stdin for hook chaining
- `log(msg)` — log to stderr
- `execCommand(cmd, args)` — safe execution (no shell injection)

## Dependencies

- Hooks have their own `package.json` — run `cd hooks && npm install` separately
- Do not add dependencies to the root `package.json` for hook-only needs

## Registration

Register hooks in `hooks/hooks.json`:
- Use `"async": true` for non-blocking hooks (e.g., logging, tracking)
- Use `${CLAUDE_PLUGIN_ROOT}` (with braces) for all path references
- Handler types: `command` (shell), `prompt` (LLM evaluation), `agent` (multi-turn subagent)

## Module Pattern

```js
if (require.main === module) { main(); }
```

Export testable functions separately from the entry point.

## Testing

- Tests live in `hooks/__tests__/` — run with `npm run test:hooks` (Node `--test`)
- Use `require('node:test')` + `require('node:assert')`
- Module cache: tests must `delete require.cache[...]` in `beforeEach` (hooks use module-level state)
- Isolate environment variables in tests — restore in teardown

## Safe Execution

Use `execCommand()` from utils or `execFileSync` with array arguments — never string interpolation with shell commands. See `security.md` for details.
