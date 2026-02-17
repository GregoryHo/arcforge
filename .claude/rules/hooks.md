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
  lib/                    # Shared utilities (utils.js, package-manager.js)
  <hook-name>/
    main.js               # Entry point
    README.md             # Hook documentation
```

## Error Handling

Silent catch — hooks must never crash the session:
```js
try { /* hook logic */ } catch { /* silently continue */ }
```

## Stdin/Stdout

- Use `readStdinSync()` from `hooks/lib/utils.js` to read stdin
- Write back to stdout for hook chaining

## Logging

- `log(msg)` writes to stderr (visible in Claude Code debug output, not sent to Claude)
- Never use `console.log` for debug output in hooks (it goes to stdout and contaminates the chain)

## Shared Utilities

Import from `hooks/lib/utils.js`:
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
