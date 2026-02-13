# arcforge for Codex

Guide for using arcforge with OpenAI Codex.

## Quick Install

Tell Codex:

```
Fetch and follow instructions from https://raw.githubusercontent.com/GregoryHo/arcforge/master/.codex/INSTALL.md
```

## Manual Installation

### Prerequisites

- OpenAI Codex access
- Git

### Installation Steps

#### 1. Clone arcforge

```bash
git clone https://github.com/GregoryHo/arcforge.git ~/.agents/arcforge
```

#### 2. Create the skills symlink

```bash
mkdir -p ~/.agents/skills
ln -s ~/.agents/arcforge/skills ~/.agents/skills/arcforge
```

#### 3. Restart Codex

Skills are discovered automatically through the symlink.

## How It Works

Codex scans `~/.agents/skills/` for skill directories at startup. Each directory containing a `SKILL.md` file with valid frontmatter becomes an available skill.

The symlink `~/.agents/skills/arcforge` points into the cloned repo's `skills/` directory, making all arcforge skills visible to Codex without copying files. The `description` field in each skill's SKILL.md frontmatter tells Codex when to auto-activate the skill (e.g., `"Use when exploring ideas before implementation"`).

## Usage

Skills are discovered automatically after installation. Use them as you would any native Codex skill.

### Personal Skills

Create your own skills in `~/.agents/skills/`:

```bash
mkdir -p ~/.agents/skills/my-skill
```

Create `~/.agents/skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: Use when [condition] - [what it does]
---

# My Skill

[Your skill content here]
```

Personal skills override agentic skills with the same name.

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

Remove the symlink and optionally delete the clone:

```bash
unlink ~/.agents/skills/arcforge
rm -rf ~/.agents/arcforge   # optional: remove the repo
```

## Windows (PowerShell)

### Installation

```powershell
git clone https://github.com/GregoryHo/arcforge.git "$env:USERPROFILE\.agents\arcforge"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\arcforge" "$env:USERPROFILE\.agents\arcforge\skills"
```

### Uninstalling

```powershell
cmd /c rmdir "$env:USERPROFILE\.agents\skills\arcforge"
Remove-Item -Recurse -Force "$env:USERPROFILE\.agents\arcforge"  # optional
```

## Troubleshooting

### Skills not found

1. Verify symlink: `ls -la ~/.agents/skills/arcforge`
2. Verify skills exist: `ls ~/.agents/arcforge/skills`
3. Restart Codex to trigger skill discovery
