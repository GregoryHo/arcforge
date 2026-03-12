# Plugin

## Plugin Manifest (`.claude-plugin/plugin.json`)

- Required field: `name` (kebab-case, becomes namespace prefix)
- Optional metadata: `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`
- Component path fields: `commands`, `agents`, `skills`, `mcpServers`, `outputStyles`, `lspServers`
- Do NOT add a `hooks` field — `hooks/hooks.json` is auto-loaded by convention

## Marketplace (`.claude-plugin/marketplace.json`)

- Required: `name`, `owner.name`, `plugins` array
- Installation: `claude plugin install arcforge@arcforge-dev`
- Source types: GitHub repo, git URL, npm, pip, relative path

## Versioning

- Set version in `plugin.json` (canonical source — wins if both `plugin.json` and `marketplace.json` set it)
- Also sync to `package.json` and `.opencode/plugins/arcforge.js` for non-Claude platforms
- Bumping version is critical — plugin code is cached by version, changes without version bump won't propagate

## Hook Registration

- `hooks/hooks.json` at plugin root — auto-loaded by Claude Code v2.1+
- Use `${CLAUDE_PLUGIN_ROOT}` (with braces) for all path references in hooks
- Handler types: `command` (shell), `prompt` (LLM evaluation), `agent` (multi-turn subagent)
- Supported events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PreCompact, Stop, SubagentStop, SubagentStart, SessionEnd, PermissionRequest, Notification, TeammateIdle, TaskCompleted

## Environment Variables (available in hooks)

| Variable | Scope | Description |
|----------|-------|-------------|
| `${CLAUDE_PLUGIN_ROOT}` | All hooks | Absolute path to plugin directory |
| `$CLAUDE_PROJECT_DIR` | All hooks | Project root directory |
| `$CLAUDE_ENV_FILE` | SessionStart only | File to persist env vars |
| `$CLAUDE_CODE_REMOTE` | All hooks | `"true"` in web environments, unset in CLI |
| `ARCFORGE_ROOT` | Custom | Set by `inject-skills` hook for downstream skills |

## Plugin Directory Layout

- `.claude-plugin/` — only `plugin.json` + `marketplace.json` go here
- Component dirs at plugin root: `skills/`, `hooks/`, `commands/`, `agents/`, `templates/`
- Skills become namespaced when installed: `/arcforge:arc-brainstorming`

## Multi-Platform Packaging

One repo, four platforms:

| Directory | Platform | Notes |
|-----------|----------|-------|
| `.claude-plugin/` | Claude Code | Hooks + marketplace |
| `.codex/` | Codex | Installation guide (symlinks to `~/.agents/`) |
| `.gemini/` | Gemini CLI | Per-skill symlinks |
| `.opencode/` | OpenCode | Plugin + installation guide (includes `arcforge.js`) |

## Distribution

- `package.json` `files` array controls what ships
- Primary: GitHub marketplace (`claude plugin install arcforge@arcforge-dev`)
- Plugin scopes: `user` (default), `project`, `local`, `managed`
