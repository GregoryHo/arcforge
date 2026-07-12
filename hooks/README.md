# Claude Code Hooks

Hooks for extending Claude Code behavior in arcforge.

## Structure

```
hooks/
├── hooks.json              # Hook configuration (7 entries, each with a stable `id`)
├── run-hook.cmd            # Bash dispatcher (inject-skills only)
├── dispatch-pre.js         # Sync PreToolUse guard dispatcher (arc-guard + sdd-ledger-guard + sdd-ratify-guard)
├── dispatch-post.js        # Sync PostToolUse dispatcher (quality accumulator + arc-remind + compact-suggester)
├── README.md
├── inject-skills/          # Injects a minimal ArcForge bootstrap at session start
│   ├── main.sh
│   └── README.md
├── arc-guard/              # Blocks unsafe ops (raw git merge / arcforge loop in epic worktrees, research scope violations)
│   ├── main.js
│   └── README.md
├── arc-remind/             # Post-action nudges: PR boundary, skill-shipping eval, main-branch warning
│   ├── main.js
│   └── README.md
├── sdd-ledger-guard/       # Blocks decision-ledger append-only violations and status forgery
│   ├── main.js
│   └── README.md
├── sdd-ratify-guard/       # Blocks `arcforge ratify` in unattended loop context
│   ├── main.js
│   └── README.md
├── quality-check/          # Accumulates edited paths; Prettier + type-check batch runs at Stop
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
│   └── README.md
├── user-message-counter/   # Counts user prompts
│   ├── main.js
│   └── README.md
└── observe/                # Tool call observation
    ├── main.js
    └── README.md
```

## Active Hooks

`hooks.json` registers **7 entries**, each with a stable `id`. The PreToolUse and
PostToolUse sub-hooks are consolidated into one **sync dispatcher** per event
(one process instead of one registration each); the observers stay separate,
async entries so their daemon I/O never joins the blocking path.

| Event | id | Kind | What runs |
|-------|----|------|-----------|
| SessionStart | `inject-skills` | sync (bash) | Injects a minimal ArcForge bootstrap + `ARCFORGE_ROOT` (matcher includes `compact` to persist the env file) |
| SessionStart | `inject-context` | sync | Loads previous session context / activated instincts |
| SessionStart | `session-start` | async | Initializes the session file, lazily starts the observer daemon |
| UserPromptSubmit | `user-message-counter` | sync | Counts user messages (stays standalone — stdin passthrough) |
| PreToolUse | `guard-dispatcher` | **sync (blocking)** | `dispatch-pre.js` → arc-guard, sdd-ledger-guard, sdd-ratify-guard |
| PreToolUse | `observe-pre` | async | Captures the pre-tool observation |
| PostToolUse | `post-dispatcher` | sync | `dispatch-post.js` → quality-check accumulator, arc-remind, compact-suggester |
| PostToolUse | `observe-post` | async | Captures the post-tool observation |
| Stop | `session-end` | sync | Session metrics, threshold-gated diary capture, and the quality batch |
| PreCompact | `pre-compact` | sync | Resets compact-suggester state, runs threshold-gated diary capture |

> **Why inject-skills includes `compact` but the others don't:**
> `inject-skills` sets `ARCFORGE_ROOT` via env file, which must persist through compaction.
> `inject-context` injects instincts into Claude's context, which gets rebuilt during compaction anyway.
> `session-start` creates session tracking state that shouldn't be re-initialized on compact.

### Blocking vs advisory sub-hooks

Only PreToolUse can deny a tool call; everything else is advisory (PostToolUse
cannot block, so its output only reminds).

| Sub-hook | Dispatcher | Channel | Blocking? |
|----------|-----------|---------|-----------|
| arc-guard | guard-dispatcher (PreToolUse) | `permissionDecision: deny` | **Yes** — raw `git merge`/`arcforge loop` in an epic worktree, research-config scope |
| sdd-ledger-guard | guard-dispatcher (PreToolUse) | `permissionDecision: deny` | **Yes** — decisions.yml append-only + `status: accepted` forgery |
| sdd-ratify-guard | guard-dispatcher (PreToolUse) | `permissionDecision: deny` | **Yes** — `arcforge ratify` during a live loop |
| quality-check | post-dispatcher (PostToolUse) | accumulate → Stop `systemMessage` | No — Prettier + tsc + console.\* scan batch once at Stop |
| arc-remind | post-dispatcher (PostToolUse) | `systemMessage` (+ model channel in autopilot) | No — PR boundary, eval-before-ship, worktree-add, spec→dag, main-branch nudges |
| compact-suggester | post-dispatcher (PostToolUse) | `systemMessage` + model channel | No — increments the shared diary tool-count on every event; suggests /compact at 50, then every 25 |

Every guard is **fail-open** (any internal error → allow) and a **no-op** outside
its self-gated context. Deny precedence follows the dispatcher's rule order.

### quality-check Stop batching (v5)

quality-check no longer runs per edit. On PostToolUse it only **accumulates** the
edited `.ts/.tsx/.js/.jsx` path into a session temp file; the Prettier + tsc +
`console.*` scan runs **once at Stop** over the unique paths. Findings arrive at
Stop over the user-visible `systemMessage` channel only (the model channel is
unavailable at Stop, and lint findings never block the Stop). Behavior delta:
files are no longer auto-formatted mid-task.

### Disabling individual sub-hooks — `ARCFORGE_DISABLED_HOOKS`

Set `ARCFORGE_DISABLED_HOOKS` to a comma-separated list of sub-hook `id`s to skip
them inside the dispatchers. Granularity is per sub-hook, not per process:
disabling one leaves its siblings — and any shared counter a sibling owns —
running. Recognized ids: `arc-guard`, `sdd-ledger-guard`, `sdd-ratify-guard`,
`quality-check`, `arc-remind`, `compact-suggester`.

```bash
# Silence arc-remind nudges without touching the guards or the diary counter
ARCFORGE_DISABLED_HOOKS=arc-remind claude
```

### hooks.json schema check

`node scripts/check-hooks-schema.js` (npm: `check:hooks`) statically validates
`hooks.json` — known event names, valid matchers, stable unique ids,
`${CLAUDE_PLUGIN_ROOT}` command form, and the one-sync-dispatcher-per-blocking-event
rule. The e2e suite spawns entry files directly, so this linter is the only guard
on the registration wiring itself.

## Adding New Hooks

1. Create a folder named after the hook's purpose (e.g., `my-hook/`)
2. Add `main.js` as the entry point (Node.js for cross-platform support)
3. Add `README.md` documenting the hook
4. Register in `hooks.json`

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

### hooks.json Entry

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
