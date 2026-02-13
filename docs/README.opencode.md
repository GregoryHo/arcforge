# arcforge for OpenCode

Guide for using arcforge with [OpenCode.ai](https://opencode.ai).

## Quick Install

Tell OpenCode:

```
Clone https://github.com/GregoryHo/arcforge to ~/.agents/arcforge, then create directory ~/.config/opencode/skills, then symlink ~/.agents/arcforge/skills to ~/.config/opencode/skills/arcforge, then create directory ~/.config/opencode/plugins, then symlink ~/.agents/arcforge/.opencode/plugins/arcforge.js to ~/.config/opencode/plugins/arcforge.js, then restart opencode.
```

## Manual Installation

### Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- Git

### Installation Steps

#### 1. Clone arcforge

```bash
git clone https://github.com/GregoryHo/arcforge.git ~/.agents/arcforge
```

#### 2. Create the skills symlink

```bash
mkdir -p ~/.config/opencode/skills
ln -s ~/.agents/arcforge/skills ~/.config/opencode/skills/arcforge
```

#### 3. Register the plugin

```bash
mkdir -p ~/.config/opencode/plugins
ln -sf ~/.agents/arcforge/.opencode/plugins/arcforge.js ~/.config/opencode/plugins/arcforge.js
```

#### 4. Restart OpenCode

Skills are discovered natively through the symlink. The plugin injects agentic context via `experimental.chat.system.transform`.

## How It Works

OpenCode uses two mechanisms to integrate arcforge:

1. **Skill discovery** — OpenCode scans `~/.config/opencode/skills/` for directories containing `SKILL.md` with valid frontmatter. The symlink makes all arcforge skills appear there without copying files. The `description` field triggers auto-activation.

2. **Plugin** — The `arcforge.js` plugin uses OpenCode's `experimental.chat.system.transform` hook to inject agentic context (routing tables, skill metadata) into the system prompt at runtime. This enables features like automatic skill routing that go beyond basic skill discovery.

> **Note:** Unlike Codex and Gemini (which share `~/.agents/skills/`), OpenCode requires its own skills symlink at `~/.config/opencode/skills/` plus the plugin symlink.

## Tool Mapping

arcforge skills are written for Claude Code's tool vocabulary. OpenCode maps these automatically:

| Claude Code | OpenCode | Purpose |
|---|---|---|
| `Skill` tool | `skill` | Load and activate a skill |
| `Read` | `read_file` | Read file contents |
| `Bash` | `shell` | Run shell commands |
| `Edit` | `edit_file` | Modify file contents |
| `Write` | `write_file` | Create or overwrite a file |

## Skill Priority

1. **Project skills** (`.opencode/skills/`) — project-specific overrides
2. **User skills** (`~/.config/opencode/skills/`) — personal skills
3. **Agentic skills** (`~/.config/opencode/skills/arcforge/`) — from the arcforge repo

Higher-priority skills override lower ones with the same name.

### Personal Skills

Create your own skills in `~/.config/opencode/skills/`:

```bash
mkdir -p ~/.config/opencode/skills/my-skill
```

Create `~/.config/opencode/skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: Use when [condition] - [what it does]
---

# My Skill

[Your skill content here]
```

## Coordinator CLI

The coordinator CLI is only needed for dag-based multi-agent orchestration. Most users don't need this.

```bash
cd ~/.agents/arcforge && node scripts/cli.js --help
```

## Updating

```bash
cd ~/.agents/arcforge && git pull
```

Skills update instantly through the symlink. Restart OpenCode to pick up plugin changes.

## Uninstalling

Remove both symlinks and optionally delete the clone:

```bash
unlink ~/.config/opencode/skills/arcforge
unlink ~/.config/opencode/plugins/arcforge.js
rm -rf ~/.agents/arcforge   # optional: remove the repo
```

## Windows

### cmd

```cmd
git clone https://github.com/GregoryHo/arcforge.git "%USERPROFILE%\.agents\arcforge"
mkdir "%USERPROFILE%\.config\opencode\skills"
mklink /J "%USERPROFILE%\.config\opencode\skills\arcforge" "%USERPROFILE%\.agents\arcforge\skills"
mkdir "%USERPROFILE%\.config\opencode\plugins"
mklink /J "%USERPROFILE%\.config\opencode\plugins\arcforge.js" "%USERPROFILE%\.agents\arcforge\.opencode\plugins\arcforge.js"
```

### PowerShell

```powershell
git clone https://github.com/GregoryHo/arcforge.git "$env:USERPROFILE\.agents\arcforge"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.config\opencode\skills"
cmd /c mklink /J "$env:USERPROFILE\.config\opencode\skills\arcforge" "$env:USERPROFILE\.agents\arcforge\skills"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.config\opencode\plugins"
cmd /c mklink /J "$env:USERPROFILE\.config\opencode\plugins\arcforge.js" "$env:USERPROFILE\.agents\arcforge\.opencode\plugins\arcforge.js"
```

### Git Bash

```bash
git clone https://github.com/GregoryHo/arcforge.git ~/.agents/arcforge
mkdir -p ~/.config/opencode/skills
ln -s ~/.agents/arcforge/skills ~/.config/opencode/skills/arcforge
mkdir -p ~/.config/opencode/plugins
ln -sf ~/.agents/arcforge/.opencode/plugins/arcforge.js ~/.config/opencode/plugins/arcforge.js
```

## Testing

The OpenCode integration tests live in `tests/integration/opencode/`:

```bash
# Run all tests
./tests/integration/opencode/run-tests.sh --integration --verbose

# Run a specific test
./tests/integration/opencode/run-tests.sh --test test-tools.sh
```

## Troubleshooting

### Plugin not loading

1. Check plugin symlink: `ls -la ~/.config/opencode/plugins/arcforge.js`
2. Check OpenCode logs for errors
3. Verify target exists: `ls ~/.agents/arcforge/.opencode/plugins/arcforge.js`

### Skills not found

1. Verify symlink: `ls -la ~/.config/opencode/skills/arcforge`
2. Verify skills exist: `ls ~/.agents/arcforge/skills`
3. Restart OpenCode to trigger skill discovery
