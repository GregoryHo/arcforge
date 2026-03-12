# Security

## Command Execution

Always use `execFileSync` with array arguments — never shell-based execution with string interpolation:
```js
// CORRECT
execFileSync('git', ['worktree', 'add', worktreePath], { cwd });
```

Shell-based execution with interpolated variables is a command injection risk. Stick to `execFileSync` with argument arrays.

## Path Safety

- Use `sanitizeFilename()` from `utils.js` for any dynamic filenames
- Always `path.resolve()` before filesystem operations
- Never construct paths from raw user or tool input without validation
- Reject paths containing `..` or absolute paths when relative is expected

## Input Validation

Type-check at boundaries, fail fast with descriptive errors:
```js
if (typeof epicName !== 'string' || !epicName.trim()) {
  throw new Error('epicName must be a non-empty string');
}
```

Apply `typeof` guards at function entry for public APIs in `scripts/lib/`.

## Control Characters

Filter control characters from untrusted strings using:
```js
str.replace(/[\x00-\x1f\x7f]/g, '')
```

This matches the existing `escapeForJson` pattern in the codebase.

## No Secrets

- No hardcoded API keys, tokens, or passwords anywhere in the codebase
- No credential handling — arcforge delegates auth to the host tool (Claude Code, etc.)
- If a secret appears in a diff, stop and remove it before committing

## Hook Safety

Hooks receive untrusted input (tool names, file paths, user prompts from Claude):
- Validate tool names against known allowlists when possible
- Sanitize file paths before filesystem operations
- Never pass hook input directly to shell commands
- Treat all hook event data as potentially adversarial
