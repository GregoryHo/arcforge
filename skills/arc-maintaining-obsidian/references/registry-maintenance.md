# Registry Maintenance

The vault registry lives at `~/.arcforge/obsidian-vaults.json`. **The
skill manages this file end-to-end through `${CLAUDE_PLUGIN_ROOT}/scripts/cli.js
obsidian <subcommand>` — never hand-edit.**

## Schema

```json
{
  "default": "<vault-name>",
  "vaults": [
    {
      "name": "<short-name>",
      "path": "<absolute path to vault root>",
      "search": {
        "baseline": "filesystem",
        "preferred": "filesystem",
        "qmd_collection": null,
        "fallbacks": ["filesystem", "obsidian-cli"]
      },
      "scope": "<one-line scope statement>",
      "preset": "<preset-name-used-at-init>"
    }
  ]
}
```

The schema is small but error-prone; mutations have side effects
(first-becomes-default, optional QMD collection lifecycle, lock
acquisition). The CLI handles all of those atomically.

## Subcommands

| Subcommand | Behavior |
|---|---|
| `${CLAUDE_PLUGIN_ROOT}/scripts/cli.js obsidian register --name <n> --path <p> [--default] [--preset <p>] [--scope "..."] [--qmd-collection <name>]` | Add a vault. First-registered becomes default automatically. `--qmd-collection` implies `--search-preferred=qmd`. |
| `${CLAUDE_PLUGIN_ROOT}/scripts/cli.js obsidian unregister <name>` | Remove the entry. Vault files at `<path>` untouched. If the removed entry was the default, default is cleared. |
| `${CLAUDE_PLUGIN_ROOT}/scripts/cli.js obsidian set-default <name>` | Update `default`. Errors if `<name>` not registered. |
| `${CLAUDE_PLUGIN_ROOT}/scripts/cli.js obsidian list-vaults [--json]` | Print the registry. Default marker, preset, search baseline shown. |

The `init-vault` workflow is LLM-driven (see
`bootstrap-workflow.md`); only the registry mutation at step 9
delegates to the CLI.

## Inspecting a vault without switching to it

Use **bare invoke** with `--vault=<name>` — Domain Contract Orientation
runs and prints the named vault's name / scope / types / last activity,
no mode entered.

## Why never hand-edit `obsidian-vaults.json`

- The CLI atomically writes through a sibling tmp file rename, so a
  half-written registry never lands.
- Mutations are paired with file-locking (`scripts/lib/locking.js`)
  so concurrent sessions don't race.
- A user who hand-edits today drifts from schema tomorrow when fields
  are added.
- The CLI applies the first-becomes-default invariant; manual edits
  forget it.
