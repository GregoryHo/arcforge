# Installing arcforge for Codex

Enable agentic skills in Codex via native skill discovery.

## Marketplace install (recommended)

arcforge ships a native Codex plugin manifest (`.codex-plugin/plugin.json`,
declaring `"hooks": {}` so Codex does not adopt the Claude Code hooks) and a
marketplace entry (`.agents/plugins/marketplace.json`). Install through Codex's
marketplace and skills are discovered automatically — no manual symlink.

If the marketplace lands the plugin somewhere other than `~/.agents/arcforge`,
export `ARCFORGE_ROOT` so the CLI resolves (see the note in step 1 below):

```bash
export ARCFORGE_ROOT=/path/to/installed/arcforge
```

## Manual install (fallback)

If you prefer a manual checkout — one clone, one symlink.

## Prerequisites

- Git
- Node.js — the arcforge CLI (`scripts/cli.js`) runs on Node; skills that
  call it need it on your `PATH`

## Installation

1. **Clone arcforge:**
   ```bash
   git clone https://github.com/GregoryHo/arcforge ~/.agents/arcforge
   ```

   This is the **standard clone location**, and skills resolve the CLI
   through `ARCFORGE_ROOT`. Codex has no SessionStart hook to export it, so
   skills fall back to `~/.agents/arcforge` automatically. If you clone
   somewhere else, export it in your shell profile so the CLI resolves:
   ```bash
   export ARCFORGE_ROOT=/your/arcforge/checkout
   ```

2. **Create the skills directory:**
   ```bash
   mkdir -p ~/.agents/skills
   ```

3. **Symlink skills into the shared directory:**
   ```bash
   ln -s ~/.agents/arcforge/skills ~/.agents/skills/arcforge
   ```

4. **Restart Codex** to discover the skills.

## Tool mapping

Skills describe actions in vendor-neutral terms. For how they map to Codex's
real tools (subagent dispatch, task tracking, web search), see
`skills/arc-using/references/codex-tools.md`.

## Verify

```bash
ls -la ~/.agents/skills/arcforge
```

You should see a symlink pointing to `~/.agents/arcforge/skills`.

## Updating

```bash
cd ~/.agents/arcforge && git pull
```

Skills update instantly through the symlink — all platforms sharing this clone get updated at once.

## Uninstalling

```bash
unlink ~/.agents/skills/arcforge
```

To also remove the clone:

```bash
rm -rf ~/.agents/arcforge
```
