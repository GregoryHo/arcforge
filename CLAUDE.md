# arcforge

## Project Overview

Skill-based autonomous agent toolkit for Claude Code and Codex.

## Commands

- `npm test` - Run all tests (5 runners, all must pass)
- `npm run test:scripts` - Jest tests (scripts/lib/)
- `npm run test:hooks` - Hook tests (Node --test)
- `npm run test:node` - CLI, DAG, models, YAML tests
- `npm run test:skills` - Skill validation (pytest)
- `npm run test:observer-daemon` - Observer daemon behavior (Bash)
- `npm run lint` - Biome lint + format check (CI blocks merge on failure)
- `npm run lint:fix` - Auto-fix lint and format issues
- `node scripts/cli.js --help` - CLI help

## Setup

```bash
npm install
```

Python 3 with pytest is required for `npm run test:skills`:
```bash
pip install pytest pyyaml
```
