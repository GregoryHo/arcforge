# sdd-ratify-guard

PreToolUse hook that provides best-effort denial of `arcforge ratify` Bash invocations when an autonomous loop is running.

## What It Does

Intercepts `Bash` tool calls whose command matches `arcforge ratify` or `node <path>/cli.js ratify`. If the loop sentinel (`.arcforge-loop.json`) is present at project root, the hook **denies** the tool call.

## Why This Exists

`arcforge ratify` is a human-attended operation. Running it inside an autonomous loop would allow an agent to self-ratify decisions — bypassing the human review gate.

This hook is the **best-effort harness layer** (Task 3b). The **primary deterministic gate** is the engine-side check in `scripts/cli/ratify-command.js`:
- Refuses to mint when `ARCFORGE_MODE !== 'attended'`
- Refuses to mint when `.arcforge-loop.json` sentinel is present

## Honest Limits

**This hook is bypassable via `--dangerously-skip-permissions`.** That is a known, accepted tradeoff (per implementation-plan.md §0.5 B1 decision). The engine gate is the real guarantee; this hook adds defense-in-depth for the common case.

Do not rely on this hook alone for security — the combination of engine gate + hook makes self-ratification very difficult without deliberate bypass.

## Sentinel File

The sentinel is `.arcforge-loop.json` at project root — the same file maintained by `scripts/loop.js`. Its presence signals an active or recently interrupted autonomous loop.

## Fail-Open

Any internal error → silently caught → ALLOW. A false-positive block is more damaging than a missed denial (users disable hooks wholesale to recover from false positives).
