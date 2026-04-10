# Hooks System Guide

## Overview

Arcforge hooks extend Claude Code sessions with automated behaviors — tracking tool usage, injecting context, suggesting compaction, and logging session activity. Hooks fire on lifecycle events (session start, tool use, stop, etc.) and run as child processes that communicate via stdin/stdout/stderr.

This guide covers the hook I/O system: what hooks receive, how to output, and who sees what.

## How Hooks Work

```
Claude Code Event (e.g., PostToolUse)
  │
  ├─ Match hook registration (hooks.json matcher)
  ├─ Spawn hook process
  │   ├─ stdin:  JSON with event data
  │   ├─ stdout: JSON response (systemMessage, additionalContext, or passthrough)
  │   ├─ stderr: Debug logs (visible in verbose mode only)
  │   └─ exit:   0 = success, 2 = block (specific events only)
  │
  └─ Claude Code processes hook output
```

Each hook invocation is a **fresh process** — no in-memory state persists between calls. Use file-based counters (`createSessionCounter`) for persistent state.

## Hook Input (stdin)

All hooks receive JSON via stdin with these common fields:

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Session UUID |
| `transcript_path` | string | Full path to session transcript JSONL |
| `cwd` | string | Project working directory |
| `hook_event_name` | string | Event type (e.g., `"PostToolUse"`) |

### Event-Specific Fields

**SessionStart**

| Field | Values | Description |
|-------|--------|-------------|
| `source` | `startup`, `resume`, `clear`, `compact` | What triggered the session start |

> **Note**: The field is `source`, not `trigger`. This was confirmed against the official Claude Code schema.

**UserPromptSubmit**

| Field | Description |
|-------|-------------|
| `permission_mode` | Current permission mode (e.g., `"default"`) |
| `prompt` | The user's submitted prompt text |

**PreToolUse / PostToolUse**

| Field | Description |
|-------|-------------|
| `permission_mode` | Current permission mode |
| `tool_name` | Tool being called (e.g., `"Bash"`, `"Edit"`, `"Write"`) |
| `tool_input` | Tool parameters (e.g., `{file_path, content}` for Write) |
| `tool_use_id` | Unique ID for this tool invocation |
| `tool_response` | (PostToolUse only) Tool execution result |

**Stop**

| Field | Description |
|-------|-------------|
| `permission_mode` | Current permission mode |
| `stop_hook_active` | Whether a stop hook is currently running |
| `last_assistant_message` | Claude's final response text |

**SessionEnd**

| Field | Description |
|-------|-------------|
| `reason` | Why the session ended (e.g., `"other"`) |

### Reading Input in Hooks

```js
const { readStdinSync, parseStdinJson, setSessionIdFromInput } = require('../../scripts/lib/utils');

const stdin = readStdinSync();
const input = parseStdinJson(stdin);
setSessionIdFromInput(input);  // Cache session ID for counter operations
```

## Hook Output — Who Sees What

This is the most important section. Different output mechanisms reach different audiences:

### Output Visibility Matrix

| Mechanism | Audience | Visible? | Use For |
|-----------|----------|----------|---------|
| **stderr** | **Nobody** | **NO** — condensed, invisible even in Ctrl+O | Internal diagnostics only |
| **systemMessage** (stdout JSON) | **User (always)** | **YES** — shown as "HookEvent:Tool says:" | Suggestions, warnings |
| **additionalContext** (stdout JSON) | **Claude** | YES — injected into context | Context injection |
| **Exit code 2** | Claude Code engine | N/A — blocks event | Blocking actions |

### stderr — Invisible (DO NOT rely on)

```js
const { log } = require('../../scripts/lib/utils');
log('Processing tool call...');  // Goes to stderr — NOBODY SEES THIS
```

**What happens**: Claude Code condenses ALL hook stderr into `"N hooks ran"`. The individual messages are **completely invisible** — not shown in normal mode, not shown in Ctrl+O transcript mode, not shown anywhere. This was verified on PostToolUse (4 hooks) and Stop (2 hooks) events.

**CRITICAL**: This means stderr is useless for communicating with users. It exists only for internal diagnostics that nobody will read unless they add custom logging.

**Use for**: Diagnostic messages, progress tracking, debug info.

**Do NOT use for**: User-facing suggestions or warnings — they will be invisible.

### systemMessage — User-Visible Messages (Always Shown)

```js
const { output } = require('../../scripts/lib/utils');
output({ systemMessage: '📊 50 tool calls. Consider /compact.' });
```

**What happens**: Claude Code displays the message directly to the user, labeled as `PostToolUse:HookName says:`. Not condensed, always visible.

**Use for**: Compact suggestions, quality warnings, actionable notifications.

**Example output in terminal**:
```
PostToolUse:Bash says:
  📊 50 tool calls (mostly reads) — looks like a research/exploration phase.
  If you're transitioning to implementation, /compact now to free context.
```

### additionalContext — Claude Context Injection

```js
const { outputContext } = require('../../scripts/lib/utils');
outputContext('You have arcforge skills available...', 'SessionStart');
```

**What happens**: The text is injected into Claude's context as `additionalContext`. Claude sees it as part of its instructions. The user does NOT see it directly.

**Available on**: SessionStart and UserPromptSubmit events only. Other events ignore this field.

**Use for**: Injecting skill information, active instincts, pending action notifications.

**Output format** (handled by `outputContext`):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Your injected text here..."
  }
}
```

### Exit Code 2 — Blocking Actions

```js
// In a PreToolUse hook — block dangerous command
if (isDangerous(input.tool_input.command)) {
  console.error('Blocked: dangerous command detected');
  process.exit(2);
}
```

**What happens**: Claude Code prevents the action (tool call, prompt submission, or stop).

**Available on**: PreToolUse, UserPromptSubmit, Stop events only. Other events ignore exit code 2.

## Counter System

Hooks run as fresh processes — use file-based counters for persistent state:

```js
const { createSessionCounter } = require('../../scripts/lib/utils');

const counter = createSessionCounter('my-counter');
const current = counter.read();    // Read current value
counter.write(current + 1);       // Increment
counter.reset();                   // Reset to 0
counter.getFilePath();             // Get file path (for debugging)
```

Counter files are stored at `{TMPDIR}/arcforge-{name}-session-{sessionId}`.

**Important**: If multiple systems need independent counters, use different names. Shared counter names create coupling (e.g., compact-suggester uses `compact-count`, diary system uses `tool-count`).

## Sync vs Async Hooks

In `hooks.json`:

```json
{
  "type": "command",
  "command": "node hooks/my-hook/main.js",
  "async": true  // ← fire-and-forget, non-blocking
}
```

| Mode | Behavior | Use For |
|------|----------|---------|
| Sync (default) | Claude Code waits for hook to finish | Context injection, blocking decisions |
| Async (`"async": true`) | Fire-and-forget, runs in background | Logging, tracking, observation |

**Rule of thumb**: If the hook's output affects Claude's behavior → sync. If it only logs/tracks → async.

## Registered Hooks (Current)

| Event | Hook | Sync/Async | Purpose |
|-------|------|-----------|---------|
| SessionStart | inject-skills | sync | Inject arc-using skill content into Claude |
| SessionStart | inject-context | sync | Inject active instincts + pending actions |
| SessionStart | session-tracker/start | async | Initialize session file, run decay |
| SessionStart | log-lightweight | async | Log session event |
| UserPromptSubmit | user-message-counter | sync | Count user prompts |
| UserPromptSubmit | log-lightweight | async | Log prompt |
| PreToolUse | observe | async | Record tool call to observations |
| PreToolUse | log-lightweight | async | Log pending tool |
| PostToolUse | quality-check | sync | Auto-format, type-check, console.log warn |
| PostToolUse | observe | async | Record tool result |
| PostToolUse | compact-suggester | sync | Suggest /compact at threshold |
| PostToolUse | log-lightweight | async | Log tool completion |
| PreCompact | pre-compact | sync | Log compaction, update session |
| Stop | session-tracker/end | sync | Update session, generate diary |
| Stop | log-lightweight | async | Final log write |
| SessionEnd | log-lightweight | async | Clear state |
| SubagentStop | log-lightweight | async | Track subagent completion |
| PermissionRequest | log-lightweight | async | Log permission request |

## Testing Hooks

### Unit Tests (function-level)

Test individual exported functions in isolation:

```js
const { shouldSuggest, buildMessage } = require('../compact-suggester/main');
assert.ok(shouldSuggest(50));
assert.ok(!shouldSuggest(30));
```

### E2E Tests (execution-level)

Test the full stdin → script → stdout/stderr pipeline using `spawnSync`:

```js
const { spawnSync } = require('node:child_process');

const result = spawnSync('node', ['hooks/compact-suggester/main.js'], {
  input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read', ... }),
  encoding: 'utf-8',
});

// spawnSync captures BOTH stdout and stderr (unlike execFileSync)
assert.strictEqual(result.status, 0);
assert.ok(result.stdout.includes('systemMessage'));
```

**Important**: Use `spawnSync`, not `execFileSync`. `execFileSync` discards stderr on success — you can't verify hook warnings or suggestions.

### Eval (behavioral verification)

For hooks that inject context into Claude (inject-skills, inject-context), use the eval harness to verify Claude demonstrates the injected knowledge. See `evals/scenarios/hook-inject-skills.md` for an example.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `console.log` for debug | Use `log()` (stderr) — console.log goes to stdout and corrupts hook protocol |
| Using `logHighlight()` or `log()` for user-facing messages | Use `output({ systemMessage: "..." })` — stderr is completely invisible (not just condensed) |
| Reading `input.trigger` on SessionStart | Use `input.source` — official field name is `source` |
| Sharing counter names across independent systems | Use separate counter names (e.g., `compact-count` vs `tool-count`) |
| Using `execFileSync` in tests | Use `spawnSync` — captures stderr on success |
| Testing only exit code 0 | Test actual behavior: check stdout JSON, stderr content, file side-effects |
