# Gemini CLI Skills Notes

Source: https://geminicli.com/docs/cli/skills/

## Key points
- Skills are directories with a required `SKILL.md` containing frontmatter (`name`, `description`) and body instructions.
- Discovery tiers: workspace (`.gemini/skills/`) > user (`~/.gemini/skills/`) > extension skills; higher precedence overrides lower.
- Interactive management: `/skills list|enable|disable|reload` (with scope support).
- Terminal management: `gemini skills list/install/enable/disable/uninstall`, with `--scope workspace|user` and `--path` for monorepos.
- Activation flow: model matches description, calls `activate_skill`, UI prompts for consent, then injects `SKILL.md` + directory tree, and grants read access to skill assets.
- Recommended resource layout: `scripts/`, `references/`, `assets/` within skill directory.
- File references should be relative to the skill root to avoid cwd-dependent paths.
