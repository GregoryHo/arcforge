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

## Verify

```bash
ls ~/.gemini/skills/arc-*
```

You should see one symlink per skill, each pointing to a directory in `~/.agents/arcforge/skills/`.

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
