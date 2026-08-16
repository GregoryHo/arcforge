# arcforge

## Project Overview

Skill-based agent toolkit for Claude Code.

## Commands

- `npm test` - Run all 5 test runners (all must pass)
- `npm run test:scripts` - Jest (`tests/scripts/` — engine + contract lints)
- `npm run test:hooks` - Node `--test` (`hooks/__tests__/`)
- `npm run test:node` - Custom runner (`tests/node/` — CLI contract, YAML, locking)
- `npm run test:skills` - pytest (`tests/skills/` — skill structure)
- `npm run test:observer-daemon` - Bash (`tests/observer-daemon/`)
- `npm run check:versions` / `check:docs` / `check:cli-consumers` / `check:hooks` / `check:eval-targets` - the 5 static checks (CI-gated, not part of `npm test`)
- `npm run lint` - Biome lint + format check (CI blocks merge on failure)
- `npm run lint:fix` - Auto-fix lint and format issues
- `npm run dev` - Claude Code session with the plugin loaded from this checkout
- `node scripts/cli.js --help` - CLI help

## Setup

```bash
npm install
```

Python 3 with pytest is required for `npm run test:skills`:
```bash
pip install pytest pyyaml
```
