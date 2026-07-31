---
paths:
  - "tests/**"
  - "hooks/__tests__/**"
---

# Testing

## 5 Runners — All Must Pass

Run `npm test` before every PR. It executes 5 separate runners:

| Runner | Command | Location | What It Tests |
|--------|---------|----------|---------------|
| Jest | `npm run test:scripts` | `tests/scripts/`, `skills/**/__tests__/` | Core engine + the contract lints (see below) |
| Node `--test` | `npm run test:hooks` | `hooks/__tests__/` | Hook behavior |
| Custom | `npm run test:node` | `tests/node/` | CLI, schemas, models, YAML parser |
| pytest | `npm run test:skills` | `tests/skills/` | Skill structure validation |
| Bash | `npm run test:observer-daemon` | `skills/arc-learning/tests/` | Observer daemon behavior |

`hooks/` is **not** a separate npm project — there is no `hooks/package.json`,
no `cd hooks && npm install`, and no second lockfile. `test:hooks` runs
`node --test hooks/__tests__/*.test.js` from the repo root; hook tests resolve
paths from `__dirname`, so they must stay cwd-independent.

`test:observer-daemon` still points into `skills/arc-learning/` — that is a
tracked D8 allowlist entry, not a pattern to copy. It moves to the engine side
in P2.

## Static Checks (all 5 run in CI)

| Command | Guards |
|---|---|
| `npm run check:versions` | Version string sync across the locations in `scripts/check-version-sync.js` |
| `npm run check:docs` | Shipped docs don't reference paths/flags the engine doesn't provide |
| `npm run check:cli-consumers` | CLI callers match the CLI surface |
| `npm run check:hooks` | `hooks/hooks.json` schema |
| `npm run check:eval-targets` | Eval scenarios don't target things that no longer exist |

## Contract Lints

Beyond unit tests, the suites carry the v6 boundary assertions. Treat a failure
here as a design violation, not a broken test:

| Guard | Runner |
|---|---|
| **D1** — no file under `skills/<name>/` requires/imports/sources outside its own directory; skill prose doesn't name `scripts/lib/` or `ARCFORGE_ROOT` | jest (`tests/scripts/`) |
| **D8** — `scripts/**` and `hooks/**` don't reference `skills/`, except an explicit allowlist that must only ever shrink | jest (`tests/scripts/`) |
| **Router bijection** — every shipped skill appears in the router table and every router row resolves to a shipped skill | jest (`tests/scripts/`) |
| **Task-list schema (D3)** — the markdown checkbox format parses; malformed samples are rejected | jest (`tests/scripts/`) |
| **Frozen frontmatter schema** + **legacy ratchet** — every entry in `docs/plans/v6/legacy-skills.json` still exists as `skills/<name>/` | pytest (`tests/skills/`) |

New enforcement exempts the skills listed in `legacy-skills.json` and applies in
full to everything else. When you delete or rewrite a legacy skill, prune its
entry in the same commit or the ratchet turns red.

## Coverage Floor

Jest enforces an 80% **line** floor over `scripts/lib/` (`jest.config.js`). It is
a partial gate — only the jest runner, only the canonical engine. Any new file
you add under `scripts/lib/` lands inside it, so ship its tests in the same
commit. Lowering the floor requires a written reason in the same commit.

## Jest Tests (`tests/scripts/`)

- `describe`/`it` blocks
- Factory fixtures: `makeInstinct`, `makeCluster`, etc.
- Temp directories: `fs.mkdtempSync()` in setup, `fs.rmSync({recursive: true})` in teardown

## Node `--test` Tests (`hooks/__tests__/`)

- Use `require('node:test')` + `require('node:assert')`
- Environment isolation: save/restore env vars in before/after hooks
- Module cache: `delete require.cache[...]` in `beforeEach` (hooks use module-level state)
- Resolve fixtures from `__dirname` — the runner is invoked from the repo root

## pytest Tests (`tests/skills/`)

- Requires Python 3 + `pip install pytest pyyaml`
- Generic checker: `test_skill_structure.py` iterates every `skills/*/SKILL.md`
- Validates the frozen frontmatter schema, `name` == dirname, sections,
  references, and the line budget

## Custom Runner (`tests/node/`)

- CLI integration, schema validation, model definitions, YAML parsing
- Lightweight — no test framework overhead

## Principles

- Test behavior, not implementation
- One assertion per test when possible
- Deterministic — no flaky tests
- Real code over mocks — mocks only when unavoidable
- Clear test names describing the scenario
- Deleting code means deleting its tests **in the same commit** — a stale suite
  that no longer has a subject is worse than no suite

## Temp Directory Lifecycle

```js
// Setup
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));

// Teardown
fs.rmSync(tmpDir, { recursive: true });
```

Always clean up temp directories in teardown to prevent disk bloat.
