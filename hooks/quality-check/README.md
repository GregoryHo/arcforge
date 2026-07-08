# Quality Check Hook

Automatically runs quality checks after editing TypeScript/JavaScript files.

## Features

1. **Auto-format with Prettier** - Formats the file in-place if Prettier is installed
2. **TypeScript type checking** - Reports type errors for the edited file
3. **Console.log detection** - Warns about console.* statements

## Trigger

Runs on `PostToolUse` when:
- Tool is `Edit` or `Write` (matcher `Edit|Write`)
- File matches `\.(ts|tsx|js|jsx)$`

## Requirements

- **Prettier**: Must be in `devDependencies` to auto-format
- **TypeScript**: Must be in `devDependencies` for type checking

## Performance

Type-checking runs `tsc --noEmit` with `--incremental` and a per-project
`.tsbuildinfo` cache in the OS temp directory, so repeated edits to the same
project reuse prior results and the second and later runs are faster. The cache
invalidates correctly across edits — a newly introduced type error is always
reported, never masked by a stale cache. If the installed `tsc` rejects
`--incremental` (an older compiler), the run backs off and retries without the
flag, so type-checking is never silently dropped — only the speedup.

If no `tsconfig.json` is found in any ancestor directory of the edited file
(e.g. a monorepo where `tsconfig.json` only lives in a sub-package directory
below the edited file), the check falls back to a standalone single-file
`tsc` run scoped to just that file, using `tsc`'s default compiler options.
This avoids the alternative failure mode — `tsc` running with zero input
files and silently reporting a "clean" result. Known tradeoff: the standalone
check does not apply the project's own `tsconfig.json` settings (lib, types,
paths, strict, etc.), so it can surface noise unrelated to real project
errors — e.g. `TS2591: Cannot find name 'node:fs'` on an otherwise-valid
`import { readFileSync } from 'node:fs'`. This is accepted: a noisy but real
check is preferable to a silent false-clean result. Standalone-mode results
are labeled distinctly in the model-facing heading (`no tsconfig.json
found — checked with default compiler options...`) so the model can weigh
them accordingly instead of mistaking them for real project-aware errors.

## Output

Findings are split by audience over a single stdout JSON object:

- **TypeScript errors + `console.*` findings → the model** via
  `hookSpecificOutput.additionalContext` (spike-verified v2.1.172 — the model
  receives it on the next turn and can fix the defect). These are actionable
  problems the next turn should resolve.
- **`Formatted: <file>` → the user** via `systemMessage`. Prettier already
  rewrote the file, so this is a notice, not an action item — it never enters
  the model channel. When model findings are also present, the formatted notice
  is merged into the same JSON object as the model output.
- Nothing actionable → no output.

## Examples

Model channel (`additionalContext`) when type errors / console.* are found:

```
TypeScript errors in Component.tsx:
  Line 42: Property 'foo' does not exist on type 'Props' (TS2339)
console.* found in Component.tsx:
  Line 15: console.log('debug', data)...
```

User channel (`systemMessage`) when Prettier reformatted the file:

```
Formatted: Component.tsx
```
