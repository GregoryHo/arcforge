# Coding Standards

## Code Style

- Formatter/linter: Biome (`biome.json`) — runs in CI, no pre-commit hook
- Single quotes, semicolons always, 2-space indent, 100-char line width
- Scope: `scripts/`, `hooks/`, `tests/` (`.js` files only)
- Run `npm run lint:fix` before committing to avoid CI failures

## File Size

- Soft limit: 400 lines
- Hard limit: 700 lines
- Largest file (coordinator.js) is 702 lines — avoid growing beyond this
- Extract utilities when a file exceeds 400 lines

## Function Size

- Target: <50 lines
- Accept up to 70 for state coordination functions (e.g., `expandWorktrees`)
- If a function exceeds 50 lines, look for extraction opportunities

## Nesting

- Maximum 4 levels deep
- Use early returns to reduce nesting
- Extract nested logic into named functions

## Error Handling (3 Tiers)

Arcforge uses different error strategies by layer:

### Library code (`scripts/lib/`)
Throw with context — callers decide how to handle:
```js
throw new Error(`Failed to read DAG: ${err.message}`);
```

### Hooks (`hooks/`)
Silent catch — hooks must never crash the session:
```js
try { /* hook logic */ } catch { /* silently continue */ }
```

### CLI (`scripts/cli.js`)
Exit with user-facing message:
```js
console.error(`Error: ${message}`);
process.exit(1);
```

## Safe File Wrappers

Use `readFileSafe()` / `writeFileSafe()` for optional file operations that may not exist:
```js
const content = readFileSafe(filePath, '');  // returns default on failure
```

Reserve raw `fs.readFileSync` / `fs.writeFileSync` for files that must exist (failure = real error).

Both are defined in `scripts/lib/utils.js`.

## Module Patterns

- Named exports only — no default exports
- Destructuring imports: `const { foo, bar } = require('./module')`
- No barrel/index files — import directly from source module

## Mutations

- Allow direct mutation on local/temporary objects within a function
- Use spread (`{ ...obj, key: val }`) when constructing output or logging records
- Never mutate function parameters
