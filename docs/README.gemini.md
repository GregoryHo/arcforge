# arcforge for Gemini CLI

Guide for using arcforge with Gemini CLI.

## Quick Install

Tell Gemini CLI:

```
Fetch and follow instructions from https://raw.githubusercontent.com/GregoryHo/arcforge/master/.gemini/INSTALL.md
```

## Manual Installation

### Prerequisites

- Gemini CLI installed
- Git

### Installation Steps

#### 1. Clone arcforge

```bash
git clone https://github.com/GregoryHo/arcforge.git ~/.agents/arcforge
```

#### 2. Symlink each skill into the Gemini skills directory

```bash
mkdir -p ~/.gemini/skills
for skill in ~/.agents/arcforge/skills/arc-*/; do
  ln -sf "$skill" ~/.gemini/skills/
done
```

#### 3. Restart Gemini CLI

Skills are discovered automatically through the symlink.

## How It Works

Gemini CLI scans `~/.gemini/skills/` for skill directories at startup. Each directory containing a `SKILL.md` file with valid frontmatter becomes an available skill. Gemini expects skill folders **directly** under `~/.gemini/skills/` (flat, not nested).

The installation creates individual symlinks for each skill (e.g. `~/.gemini/skills/arc-using → ~/.agents/arcforge/skills/arc-using`), making all arcforge skills visible to Gemini CLI without copying files. The `description` field in each skill's SKILL.md frontmatter tells Gemini when to auto-activate the skill.

## Tool Mapping

arcforge skills are written for Claude Code's tool vocabulary. Gemini CLI maps these automatically:

| Claude Code | Gemini CLI | Purpose |
|---|---|---|
| `Skill` tool | `activate_skill` | Load and activate a skill |
| `Read` | `read_file` | Read file contents |
| `Bash` | `execute_shell_command` | Run shell commands |
| `Edit` | `edit_file` | Modify file contents |
| `Write` | `write_file` | Create or overwrite a file |

## Skill Priority

1. **Workspace skills** (`.gemini/skills/`) — project-specific overrides
2. **User skills** (`~/.gemini/skills/`) — personal skills
3. **Agentic skills** (`~/.gemini/skills/arc-*`) — symlinked from the arcforge repo

Higher-priority skills override lower ones with the same name.

## Coordinator CLI

The coordinator CLI is only needed for dag-based multi-agent orchestration. Most users don't need this.

```bash
cd ~/.agents/arcforge && node scripts/cli.js --help
```

## Updating

```bash
cd ~/.agents/arcforge && git pull
```

Skills update instantly through the symlink.

## Uninstalling

Remove the skill symlinks and optionally delete the clone:

```bash
for skill in ~/.gemini/skills/arc-*; do
  [ -L "$skill" ] && unlink "$skill"
done
rm -rf ~/.agents/arcforge   # optional: remove the repo
```

> **Note:** If Codex or OpenCode also use this clone, removing `~/.agents/arcforge` will affect all platforms.

## Windows

### cmd

```cmd
git clone https://github.com/GregoryHo/arcforge.git "%USERPROFILE%\.agents\arcforge"
mkdir "%USERPROFILE%\.gemini\skills"
for /D %s in ("%USERPROFILE%\.agents\arcforge\skills\arc-*") do mklink /J "%USERPROFILE%\.gemini\skills\%~nxs" "%s"
```

### PowerShell

```powershell
git clone https://github.com/GregoryHo/arcforge.git "$env:USERPROFILE\.agents\arcforge"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.gemini\skills"
Get-ChildItem "$env:USERPROFILE\.agents\arcforge\skills\arc-*" -Directory | ForEach-Object {
  cmd /c mklink /J "$env:USERPROFILE\.gemini\skills\$($_.Name)" $_.FullName
}
```

### Git Bash

```bash
git clone https://github.com/GregoryHo/arcforge.git ~/.agents/arcforge
mkdir -p ~/.gemini/skills
for skill in ~/.agents/arcforge/skills/arc-*/; do
  ln -sf "$skill" ~/.gemini/skills/
done
```

## Troubleshooting

### Skills not found

1. Verify symlinks: `ls -la ~/.gemini/skills/arc-*` (should show 24 symlinks)
2. Verify a skill resolves: `ls ~/.gemini/skills/arc-using/SKILL.md`
3. Restart Gemini CLI to trigger skill discovery
