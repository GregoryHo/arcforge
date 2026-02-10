# Claude Code Hooks

Hooks for extending Claude Code behavior in arcforge.

## Structure

```
hooks/
├── hooks.json              # Hook configuration
├── run-hook.cmd            # Bash dispatcher
├── README.md
├── lib/                    # Shared utilities
│   ├── utils.js            # File ops, JSON helpers, command detection
│   └── package-manager.js  # PM detection (npm/pnpm/yarn/bun)
├── inject-skills/          # Injects arc-using skill at session start
│   ├── main.sh
│   └── README.md
├── quality-check/          # Auto-format & type-check on Edit
│   ├── main.js
│   ├── prettier.js
│   ├── typescript.js
│   └── README.md
├── compact-suggester/      # Suggests /compact at tool call thresholds
│   ├── main.js
│   └── README.md
├── pre-compact/            # Marks state before context compaction
│   ├── main.js
│   └── README.md
├── session-tracker/        # Session persistence
│   ├── inject-context.js   # Context injection at session start
│   ├── start.js
│   ├── end.js
│   ├── summary.js          # Markdown summary generator
│   ├── session.json.template
│   ├── session.md.template
│   └── README.md
├── user-message-counter/   # Counts user prompts
│   ├── main.js
│   └── README.md
├── observe/                # Tool call observation
│   └── main.js
└── log-lightweight.py      # Lightweight session logging
```

## Active Hooks

### SessionStart

| Hook | Trigger | Description |
|------|---------|-------------|
| inject-skills | startup, resume, clear, compact | Injects arc-using skill content |
| session-tracker/inject-context | startup, resume, clear | Loads previous session context |
| session-tracker/start | startup, resume, clear | Resets counters, initializes session |
| log-lightweight | All | Records session start for logging |

### UserPromptSubmit

| Hook | Trigger | Description |
|------|---------|-------------|
| user-message-counter | All | Counts user messages for session evaluation |
| log-lightweight | All | Records user prompts for logging |

### PreToolUse

| Hook | Trigger | Description |
|------|---------|-------------|
| observe | All | Captures tool calls for behavioral pattern observation |
| log-lightweight | All | Records tool usage for session logging |

### PostToolUse

| Hook | Trigger | Description |
|------|---------|-------------|
| quality-check | Edit on .ts/.tsx/.js/.jsx | Auto-format (Prettier), type-check (TSC), console.log warnings |
| observe | All | Captures tool call results for behavioral pattern observation |
| compact-suggester | All | Counts tool calls, suggests /compact at 50, then every 25 |
| log-lightweight | All | Records tool results for session logging |

### Stop

| Hook | Trigger | Description |
|------|---------|-------------|
| session-tracker/end | All | Saves session metrics (JSON + Markdown summary) |
| log-lightweight | All | Records session stop for logging |

### SubagentStop

| Hook | Trigger | Description |
|------|---------|-------------|
| log-lightweight | All | Records subagent stop for logging |

### SessionEnd

| Hook | Trigger | Description |
|------|---------|-------------|
| log-lightweight | All | Records session end for logging |

### PermissionRequest

| Hook | Trigger | Description |
|------|---------|-------------|
| log-lightweight | All | Records permission requests for logging |

### PreCompact

| Hook | Trigger | Description |
|------|---------|-------------|
| pre-compact | All | Logs compaction event, marks session file with compaction timestamp |

## Adding New Hooks

1. Create a folder named after the hook's purpose (e.g., `my-hook/`)
2. Add `main.js` as the entry point (Node.js for cross-platform support)
3. Add `README.md` documenting the hook
4. Register in `hooks.json`

### Hook Template

```javascript
#!/usr/bin/env node
const { readStdinSync, log } = require('../lib/utils');

function main() {
  // Read and pass through stdin (for hook chaining)
  const stdin = readStdinSync();
  process.stdout.write(stdin);

  // Your logic here
  // Warnings go to stderr (visible in Claude Code)
  log('[my-hook] Something happened');
}

main();
```

### hooks.json Entry

```json
{
  "PostToolUse": [
    {
      "matcher": "tool == \"Edit\"",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/my-hook/main.js\""
        }
      ]
    }
  ]
}
```

## Available Hook Events

| Event | Trigger | Common Use Cases |
|-------|---------|------------------|
| SessionStart | startup, resume, clear, compact | Context injection, counter reset |
| PreToolUse | Before tool execution | Block dangerous operations, suggest alternatives |
| PostToolUse | After tool completion | Auto-format, type-check, count tools |
| UserPromptSubmit | When user submits prompt | Input validation, context injection |
| Notification | On notification events | Custom notifications |
| PreCompact | Before context compaction | State marking, checkpoint creation |
| Stop | When Claude stops | Save state, cleanup, summaries |
| SubagentStop | When subagent stops | Subagent-specific cleanup |

## Shared Utilities

### lib/utils.js

- `escapeForJson(str)` - Safe JSON string escaping
- `fileExists(path)` - Check file existence
- `readFileSafe(path)` - Read file, returns null on error
- `writeFileSafe(path, content)` - Write file with directory creation
- `execCommand(cmd, args)` - Safe command execution (no shell injection)
- `readStdinSync()` - Read all stdin content
- `log(msg)` - Log to stderr (visible to user, not sent to Claude)
- `outputContext(context, eventName)` - Output structured hook response for Claude

### lib/package-manager.js

- `detectPackageManager(dir)` - Detect npm/pnpm/yarn/bun from lock files
- `getPmExecCommand(binary, pm)` - Get exec command for a binary
- `hasDevDependency(pkg, dir)` - Check if package is in devDependencies
- `hasScript(name, dir)` - Check if npm script exists

## Cross-Platform Notes

- Use Node.js instead of bash for Windows compatibility
- Use `execCommand` (which uses `execFileSync`) to prevent shell injection
- Use `path.join()` for file paths
- Temp files go to `os.tmpdir()` (via `getTempDir()`)
