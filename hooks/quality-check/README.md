# Quality Check Hook

Automatically runs quality checks after editing TypeScript/JavaScript files.

## Features

1. **Auto-format with Prettier** - Formats the file in-place if Prettier is installed
2. **TypeScript type checking** - Reports type errors for the edited file
3. **Console.log detection** - Warns about console.* statements

## Trigger

Runs on `PostToolUse` when:
- Tool is `Edit`
- File matches `\.(ts|tsx|js|jsx)$`

## Requirements

- **Prettier**: Must be in `devDependencies` to auto-format
- **TypeScript**: Must be in `devDependencies` for type checking

## Output

- Warnings are logged to stderr (visible in Claude Code output)
- stdin is passed through to stdout unchanged (hook chaining)

## Examples

```
[quality-check] Formatted: Component.tsx
[quality-check] TypeScript errors in Component.tsx:
  Line 42: Property 'foo' does not exist on type 'Props' (TS2339)
[quality-check] console.* found in Component.tsx:
  Line 15: console.log('debug', data)...
```
