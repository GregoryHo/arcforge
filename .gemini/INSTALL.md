# Installing arcforge for Gemini CLI

Enable agentic skills in Gemini CLI via native skill discovery.

## Prerequisites

- Git

## Installation

1. **Clone arcforge:**
   ```bash
   git clone https://github.com/GregoryHo/arcforge ~/.agents/arcforge
   ```

2. **Symlink each skill into the Gemini skills directory:**
   ```bash
   mkdir -p ~/.gemini/skills
   for skill in ~/.agents/arcforge/skills/arc-*/; do
     ln -sf "$skill" ~/.gemini/skills/
   done
   ```

3. **Restart Gemini CLI** to discover the skills.

Gemini expects skill folders directly under `~/.gemini/skills/`, so each skill gets its own symlink.

## Migrating from old paths

If you previously cloned to `~/.gemini/arcforge`:

1. Remove old symlinks (if any):
   ```bash
   rm -f ~/.gemini/skills/arcforge
   ```

2. Move the clone to the new location:
   ```bash
   mv ~/.gemini/arcforge ~/.agents/arcforge
   ```

3. Pull latest changes:
   ```bash
   cd ~/.agents/arcforge && git pull
   ```

4. Create per-skill symlinks:
   ```bash
   mkdir -p ~/.gemini/skills
   for skill in ~/.agents/arcforge/skills/arc-*/; do
     ln -sf "$skill" ~/.gemini/skills/
   done
   ```

5. Remove the old bootstrap block from `~/.gemini/GEMINI.md` (if present).

6. Restart Gemini CLI.

## Verify

```bash
ls ~/.gemini/skills/arc-*
```

You should see 24 symlinks, each pointing to a skill directory in `~/.agents/arcforge/skills/`.

## Updating

```bash
cd ~/.agents/arcforge && git pull
```

Skills update instantly through the symlinks. If new skills were added, re-run the symlink loop:

```bash
for skill in ~/.agents/arcforge/skills/arc-*/; do
  ln -sf "$skill" ~/.gemini/skills/
done
```

## Uninstalling

```bash
for skill in ~/.gemini/skills/arc-*; do
  [ -L "$skill" ] && unlink "$skill"
done
```

To also remove the clone:

```bash
rm -rf ~/.agents/arcforge
```
