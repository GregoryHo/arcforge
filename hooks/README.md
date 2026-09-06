# Claude Code Hooks

Hooks for extending Claude Code behavior in arcforge.

## Structure

```
hooks/
├── claude-code.json        # Hook registry (9 entries, each with a stable `id`)
├── README.md
├── secrets-guard/          # Warn-only scan for hardcoded credentials
│   └── main.js
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
│   └── README.md
├── user-message-counter/   # Counts user prompts
│   ├── main.js
│   └── README.md
└── observe/                # Tool call observation
    ├── main.js
    └── README.md
```

## Active Hooks

`claude-code.json` registers **9 entries**, each with a stable `id`. Every hook
is its own registration; the observers are async entries so their daemon I/O
never joins the blocking path.

The registry is named for its host rather than by convention. Claude Code loads
it because `.claude-plugin/plugin.json` declares
`"hooks": "./hooks/claude-code.json"`; the conventional `hooks/hooks.json` is <!-- doc-ref-lint: ignore R1 names the path that must NOT exist; its absence is the guard (check:hooks) -->
left empty on purpose, because that is the path Codex auto-discovers plugin
hooks at and these hooks speak Claude Code's protocol. `npm run check:hooks`
fails if either the declaration or the emptiness goes away.

| Event | id | Kind | What runs |
|-------|----|------|-----------|
| SessionStart | `inject-context` | sync | Loads previous session context / activated instincts |
| SessionStart | `session-start` | async | Initializes the session file, lazily starts the observer daemon |
| UserPromptSubmit | `user-message-counter` | sync | Counts user messages (stdin passthrough) |
| PreToolUse | `secrets-guard` | sync | Warn-only credential scan (never denies) |
| PreToolUse | `observe-pre` | async | Captures the pre-tool observation |
| PostToolUse | `compact-suggester` | sync | Shared diary tool-count + /compact suggestion |
| PostToolUse | `observe-post` | async | Captures the post-tool observation |
| Stop | `session-end` | sync | Session metrics and threshold-gated diary capture |
| PreCompact | `pre-compact` | sync | Resets compact-suggester state, runs threshold-gated diary capture |

> **Why `inject-context` includes `compact` but `session-start` doesn't:**
> `inject-context` re-injects instincts after compaction rebuilds the context;
> `session-start` creates session tracking state that shouldn't be
> re-initialized on compact.

### Blocking vs advisory hooks

Only PreToolUse can deny a tool call; everything else is advisory (PostToolUse
cannot block, so its output only reminds). Today no shipped hook denies:
`secrets-guard` is warn-only.

| Hook | Event | Channel | Blocking? |
|------|-------|---------|-----------|
| secrets-guard | PreToolUse | `systemMessage` | No — warns on credential shapes in Edit/Write content and `git commit` commands |
| compact-suggester | PostToolUse | `systemMessage` + model channel | No — increments the shared diary tool-count on every event; suggests /compact at 50, then every 25 |

Every hook is **fail-open** (any internal error → allow) and a **no-op** outside
its self-gated context.

### Registry schema check

`node scripts/check-hooks-schema.js` (npm: `check:hooks`) statically validates
`hooks/claude-code.json` — known event names, valid matchers, stable unique ids,
`${CLAUDE_PLUGIN_ROOT}` command form, and the one-sync-entry-per-blocking-event
rule. It also checks the registration path itself: that `.claude-plugin/plugin.json`
declares the registry, that `.codex-plugin/plugin.json` declares no hooks, and
that neither `hooks.json` nor `hooks/hooks.json` exists. The e2e suite spawns <!-- doc-ref-lint: ignore R1 names the path that must NOT exist; its absence is the guard (check:hooks) -->
entry files directly, so this linter is the only guard on the wiring itself.

## Adding New Hooks

1. Create a folder named after the hook's purpose (e.g., `my-hook/`)
2. Add `main.js` as the entry point (Node.js for cross-platform support)
3. Add `README.md` documenting the hook
4. Register in `claude-code.json`

### Hook Template

```javascript
#!/usr/bin/env node
const { readStdinSync, log } = require('../../scripts/lib/utils');

function main() {
  // Read and pass through stdin (for hook chaining)
  const stdin = readStdinSync();
  process.stdout.write(stdin);

  // Your logic here
  // log() goes to stderr — internal diagnostics only (invisible to users)
  log('[my-hook] Something happened');
}

main();
```

### Registry Entry

```json
{
  "PostToolUse": [
    {
      "matcher": "Edit",
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

Hooks import from `scripts/lib/` (canonical source). Key functions:

### scripts/lib/utils.js

- `escapeForJson(str)` - Safe JSON string escaping
- `fileExists(path)` - Check file existence
- `readFileSafe(path, default)` - Read file, returns default on error
- `writeFileSafe(path, content)` - Write file with directory creation
- `readStdinSync()` - Read all stdin content
- `log(msg)` - Log to stderr (internal diagnostics only — invisible to users)
- `output(obj)` - Write JSON to stdout (`{ systemMessage }` for user-visible output)
- `outputContext(context, eventName)` - Output structured hook response for Claude

### scripts/lib/package-manager.js

- `detectPackageManager(dir)` - Detect npm/pnpm/yarn/bun from lock files
- `getPmExecCommand(binary, pm)` - Get exec command for a binary
- `hasDevDependency(pkg, dir)` - Check if package is in devDependencies
- `hasScript(name, dir)` - Check if npm script exists

## Cross-Platform Notes

- Use Node.js instead of bash for Windows compatibility
- Use `execCommand` (which uses `execFileSync`) to prevent shell injection
- Use `path.join()` for file paths
- Temp files go to `os.tmpdir()` (via `getTempDir()`)
