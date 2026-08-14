# Plugin

v6 targets **Claude Code only**. There is no second packaging target to keep in
sync — see `docs/plans/v6/PLAN.md`.

## Plugin Manifest (`.claude-plugin/plugin.json`)

- Required field: `name` (kebab-case, becomes namespace prefix)
- Optional metadata: `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`
- Component path fields available: `commands`, `agents`, `skills`, `mcpServers`, `outputStyles`, `lspServers`
- Do NOT add a `hooks` field — `hooks/hooks.json` is auto-loaded by convention

## Skill Discovery and the `skills` Whitelist

Skills live in **lifecycle buckets** — `skills/core/<name>/`, plus
`in-progress/` and `deprecated/` as needed — and `plugin.json` carries a single
directory entry:

```json
"skills": ["./skills/core/"]
```

**Verified mechanics** (spike: `docs/plans/v6/spikes/plugin-skills-whitelist.md`):

- Nested directories are **not** auto-discovered. Remove the `skills` field and
  a nested layout loads nothing. The whitelist is not a filter — it is the only
  way to load a nested layout.
- The whitelist accepts **directory entries**: `"skills": ["./skills/core/"]`
  loads every skill under that directory in one entry.
- The loaded identifier is the skill's `name` (== dirname); the bucket segment
  does not appear in it, so a move between buckets never changes an invocation.

Consequences to work with, not around:

- Only `core/` ships. `in-progress/` and `deprecated/` are on-disk holding areas
  that never load, so they need no manifest edit and no exclusion rule.
- Promoting or retiring a skill is a **`git mv` between buckets** — the manifest
  does not change.
- The buckets are not tracked when empty; create one at the moment a skill moves
  into it rather than keeping a placeholder.
- Guards resolve skills through the bucket. `skills/core` is the single point in
  `tests/scripts/v6-legacy-skills.js` (jest) and `tests/skills/test_skill_structure.py`
  (pytest); the D8 lint treats a bucket segment as generic tree access and keys
  on the skill name inside it.

## Versioning

- `plugin.json` is the canonical version (wins if `marketplace.json` also sets one)
- Every other location that must match is enumerated in
  `scripts/check-version-sync.js` (`LOCATIONS`) and enforced by
  `npm run check:versions` — sync against that list, don't maintain a copy of it
- Bumping the version is critical — plugin code is cached by version, so changes
  without a version bump don't propagate to installed copies

## Marketplace (`.claude-plugin/marketplace.json`)

- Required: `name`, `owner.name`, `plugins` array
- Installation: `claude plugin install arcforge@arcforge-dev`
- Source types: GitHub repo, git URL, npm, pip, relative path

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
| `ARCFORGE_ROOT` | Custom — **removed in P2** | Set by the `inject-skills` hook. Legacy: skills must reach the engine by subprocess CLI via `${CLAUDE_PLUGIN_ROOT}` (D1), not by injected env. Don't add new consumers. |

`${CLAUDE_PLUGIN_ROOT}` is a **hooks-only** variable — spike-verified UNSET in
skill-triggered Bash. The skill → engine boundary is the bare `arcforge` CLI
(D9): Claude Code adds every loaded plugin's `bin/` to PATH, and `bin/arcforge`
is the shim to `scripts/cli.js` (D1, see `.claude/rules/architecture.md`).

## Plugin Directory Layout

- `.claude-plugin/` — only `plugin.json` + `marketplace.json` go here
- Component dirs at plugin root: `skills/` (bucketed, see above), `hooks/`
- Skills become namespaced when installed: `/arcforge:<skill-name>` — the bucket
  is a layout detail, never part of the name
- `agents/` and `templates/` still exist on disk but are removed in P2 — don't
  add to them

## Distribution

- `package.json` `files` array controls what ships (its `templates/`, `agents/`,
  `.codex*`, `.agents/` entries are removed in P2 alongside those directories)
- Primary: GitHub marketplace (`claude plugin install arcforge@arcforge-dev`)
- Plugin scopes: `user` (default), `project`, `local`, `managed`
