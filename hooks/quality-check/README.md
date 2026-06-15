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
