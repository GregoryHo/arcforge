---
paths:
  - "tests/**"
  - "hooks/__tests__/**"
---

# Testing

## 4 Runners — All Must Pass

Run `npm test` before every PR. It executes 4 separate runners:

| Runner | Command | Location | What It Tests |
|--------|---------|----------|---------------|
| Jest | `npm run test:scripts` | `tests/scripts/` | Core engine (diary, reflect, session-utils) |
| Node `--test` | `npm run test:hooks` | `hooks/__tests__/` | Hook behavior |
| Custom | `npm run test:node` | `tests/node/` | CLI, DAG schema, models, YAML parser |
| pytest | `npm run test:skills` | `tests/skills/` | Skill content validation |

## Jest Tests (`tests/scripts/`)

- `describe`/`it` blocks
- Factory fixtures: `makeInstinct`, `makeCluster`, etc.
- Temp directories: `fs.mkdtempSync()` in setup, `fs.rmSync({recursive: true})` in teardown

## Node `--test` Tests (`hooks/__tests__/`)

- Use `require('node:test')` + `require('node:assert')`
- Environment isolation: save/restore env vars in before/after hooks
- Module cache: `delete require.cache[...]` in `beforeEach` (hooks use module-level state)

## pytest Tests (`tests/skills/`)

- Requires Python 3 + `pip install pytest pyyaml`
- File naming: `test_skill_arc_<name>.py`
- Validate frontmatter and content structure

## Custom Runner (`tests/node/`)

- CLI integration, DAG schema validation, model definitions, YAML parsing
- Lightweight — no test framework overhead

## Principles

- Test behavior, not implementation
- One assertion per test when possible
- Deterministic — no flaky tests
- Real code over mocks — mocks only when unavoidable
- Clear test names describing the scenario

## Temp Directory Lifecycle

```js
// Setup
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));

// Teardown
fs.rmSync(tmpDir, { recursive: true });
```

Always clean up temp directories in teardown to prevent disk bloat.
