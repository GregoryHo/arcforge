# Observe Hook

Captures tool calls for behavioral pattern observation (arc-learning).

## Trigger

- **PreToolUse** (All): captures tool calls
- **PostToolUse** (All): captures tool call results

Registered with `async: true` to avoid blocking tool execution.

## What It Does

Appends sanitized tool-call observations to `observations.jsonl` for the
current project, only when learning is enabled (`isLearningEnabled()`).
Payloads are sanitized before persistence (`sanitize-observation.js`) and
capped in size (`MAX_INPUT_LENGTH`, `MAX_FILE_SIZE`) before being written.

## Related

See `skills/arc-learning/SKILL.md` for the full observation → instinct
pipeline this hook feeds into.
