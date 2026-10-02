# Observe Hook

Captures tool calls for behavioral pattern observation.

## Trigger

- **PreToolUse** (All): captures tool calls
- **PostToolUse** (All): captures tool call results

Registered with `async: true` to avoid blocking tool execution.

## What It Does

Appends sanitized tool-call observations to `observations.jsonl` for the
current project, only when learning is enabled (`isLearningEnabled()`).
Payloads are sanitized before persistence (`sanitize-observation.js`) and
capped in size (`MAX_INPUT_LENGTH`, `MAX_FILE_SIZE`) before being written.

While learning is on it also keeps the project's root on record, so the
background analysis can check this project's opt-in — including one made
mid-session. The record is rewritten only when it changes.

After writing, it wakes the observer daemon with `SIGUSR1` (at most once every
30 seconds), sending the signal to the PID in the daemon's lock only after
checking that this process's command line runs `observer-daemon.sh`. A daemon
that died without removing its lock leaves a PID the system can reuse, and
`SIGUSR1` would terminate an unrelated process, so a PID that is not the
daemon is never signaled. The daemon reclaims that stale lock the next time it
starts.

Once enough observations have built up (50 by default) and no daemon is
running, the hook starts one itself, so curation does not wait for the next
session. A lock left by a daemon that died does not count as running: the hook
starts the daemon and the daemon reclaims the lock. The hook treats the lock as
stale only when its process is gone or `ps` shows it running something else;
when it cannot tell — `ps` is not installed, or the lock's pid file is empty
or not written yet — it leaves the lock alone rather than risk a second daemon.

## Related

See `docs/guide/learning-dashboard.md` for the full observation → instinct
pipeline this hook feeds into.
