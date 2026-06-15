# Installing arcforge for OpenCode

Enable agentic skills in OpenCode via native skill discovery and system transform plugin.

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- Git
- Node.js — the arcforge CLI (`scripts/cli.js`) runs on Node; skills that
  call it need it on your `PATH`

## Installation

1. **Clone arcforge:**
   ```bash
   git clone https://github.com/GregoryHo/arcforge ~/.agents/arcforge
   ```

   This is the **standard clone location**, and skills resolve the CLI
   through `ARCFORGE_ROOT`. OpenCode has no SessionStart hook to export it,
   so skills fall back to `~/.agents/arcforge` automatically. If you clone
   somewhere else, export it in your shell profile so the CLI resolves:
   ```bash
   export ARCFORGE_ROOT=/your/arcforge/checkout
   ```

2. **Symlink skills:**
   ```bash
   mkdir -p ~/.config/opencode/skills
   ln -s ~/.agents/arcforge/skills ~/.config/opencode/skills/arcforge
   ```

3. **Symlink the plugin:**
   ```bash
   mkdir -p ~/.config/opencode/plugins
   ln -sf ~/.agents/arcforge/.opencode/plugins/arcforge.js ~/.config/opencode/plugins/arcforge.js
   ```

4. **Restart OpenCode** to discover skills and load the plugin.

## Verify

```bash
ls -la ~/.config/opencode/skills/arcforge
ls -la ~/.config/opencode/plugins/arcforge.js
```

The skills symlink should point to `~/.agents/arcforge/skills`.
The plugin symlink should point to `~/.agents/arcforge/.opencode/plugins/arcforge.js`.

## Updating

```bash
cd ~/.agents/arcforge && git pull
```

Skills and plugin update instantly through the symlinks — all platforms sharing this clone get updated at once.

## Uninstalling

```bash
unlink ~/.config/opencode/skills/arcforge
unlink ~/.config/opencode/plugins/arcforge.js
```

To also remove the clone:

```bash
rm -rf ~/.agents/arcforge
```
