# Installing Agentic-Core for Codex

Enable agentic skills in Codex via native skill discovery. One clone, one symlink.

## Prerequisites

- Git

## Installation

1. **Clone arcforge:**
   ```bash
   git clone https://github.com/GregoryHo/arcforge ~/.agents/arcforge
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

## Migrating from old paths

If you previously cloned to `~/.codex/arcforge`:

1. Remove the old symlink (if any):
   ```bash
   rm -f ~/.agents/skills/arcforge
   ```

2. Move the clone to the new location:
   ```bash
   mv ~/.codex/arcforge ~/.agents/arcforge
   ```

3. Pull latest changes:
   ```bash
   cd ~/.agents/arcforge && git pull
   ```

4. Create the new symlink:
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.agents/arcforge/skills ~/.agents/skills/arcforge
   ```

5. Remove the old bootstrap block from `~/.codex/AGENTS.md` (if present).

6. Restart Codex.

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
