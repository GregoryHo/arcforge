# arcforge

## Project Overview

Skill-based autonomous agent toolkit for Claude Code, Codex, Gemini CLI, and OpenCode.

## Hermes project context

- For ArcForge messaging, release positioning, website copy, eval gates, or project-specific workflow policy, load `arcforge-project-workflows`.
- For eval harness changes, scenario validation, or LLM/agent benchmark trust questions, load `eval-harness-hardening`.
- Keep ArcForge-specific decisions in this repo context or the ArcForge project workflow references, not in generic Hermes built-in skills.
- Messaging should be layer-first: Core toolkit, Optional workflows, Harness/eval gates; functional categories are secondary.

## Commands

- `npm test` - Run all tests (4 runners, all must pass)
- `npm run test:scripts` - Jest tests (scripts/lib/)
- `npm run test:hooks` - Hook tests (Node --test)
- `npm run test:node` - CLI, DAG, models, YAML tests
- `npm run test:skills` - Skill validation (pytest)
- `npm run lint` - Biome lint + format check (CI blocks merge on failure)
- `npm run lint:fix` - Auto-fix lint and format issues
- `node scripts/cli.js --help` - CLI help

## Setup

```bash
npm install
cd hooks && npm install && cd ..
```

Python 3 with pytest is required for `npm run test:skills`:
```bash
pip install pytest pyyaml
```
