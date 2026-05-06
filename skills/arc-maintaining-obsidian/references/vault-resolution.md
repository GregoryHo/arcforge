# Vault Resolution

Read on every invocation that needs to operate on a specific vault. The
skill resolves which vault to use via this 5-step cascade:

1. **Explicit override** — if the invocation includes `--vault=<name>`, use that vault. Skip remaining steps.
2. **Active Obsidian** — run `obsidian-cli vault`. If the returned `path` matches a registry entry, use it. Print `Operating on: <name> vault` so the user can abort if wrong.
3. **Session cache** — if step 2 didn't resolve but the session has already picked a vault on a prior turn, reuse it.
4. **Default** — if the registry has a `default` key, use that vault. Print resolved name.
5. **Ask** — if registry is empty or has no default, prompt the user with the list of registered vaults.

Once resolved, the choice is sticky for the session unless `--vault`
overrides it.

## First-run state

If `~/.arcforge/obsidian-vaults.json` does not exist or has zero
registered vaults, do NOT fall through to ad-hoc file writes. Suggest:

- `init-vault <path> --name <name> --preset=<preset>` — bootstrap a new
  vault from a preset
- `node ${ARCFORGE_ROOT}/scripts/cli.js obsidian register --name <name> --path <path>` —
  register an existing vault (then author AGENTS.md + SCHEMA.md
  manually)

before any operation runs.

## Obsidian not running

If Obsidian is not running for step 2, fall back to step 3 → step 4 →
step 5. Warn once that LINK resolution and live Obsidian search will
degrade until the app starts. Filesystem search/read still works.
