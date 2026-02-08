# Installing Agentic-Core for OpenCode

Enable agentic skills in OpenCode via native skill discovery and system transform plugin.

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- Git

## Installation

1. **Clone arcforge:**
   ```bash
   git clone https://github.com/GregoryHo/arcforge ~/.agents/arcforge
   ```

2. **Symlink skills:**
   ```bash
   mkdir -p ~/.config/opencode/skills
   ln -s ~/.agents/arcforge/skills ~/.config/opencode/skills/arcforge
   ```

3. **Symlink the plugin:**
   ```bash
   mkdir -p ~/.config/opencode/plugins
   ln -s ~/.agents/arcforge/.opencode/plugins/arcforge.js ~/.config/opencode/plugins/arcforge.js
   ```

4. **Restart OpenCode** to discover skills and load the plugin.

## Migrating from old paths

If you previously cloned to `~/.config/opencode/arcforge`:

1. Remove old symlinks (if any):
   ```bash
   rm -f ~/.config/opencode/skills/arcforge
   rm -f ~/.config/opencode/plugins/arcforge.js
   ```

2. Move the clone to the new location:
   ```bash
   mv ~/.config/opencode/arcforge ~/.agents/arcforge
   ```

3. Pull latest changes:
   ```bash
   cd ~/.agents/arcforge && git pull
   ```

4. Create the new symlinks:
   ```bash
   mkdir -p ~/.config/opencode/skills
   ln -s ~/.agents/arcforge/skills ~/.config/opencode/skills/arcforge

   mkdir -p ~/.config/opencode/plugins
   ln -s ~/.agents/arcforge/.opencode/plugins/arcforge.js ~/.config/opencode/plugins/arcforge.js
   ```

5. Restart OpenCode.

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
