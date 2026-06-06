# sdd-ledger-guard

PreToolUse hook that enforces append-only immutability on `specs/<id>/decisions.yml`.

## What It Does

Intercepts `Edit` and `Write` tool calls whose target file basename is `decisions.yml`. For each intercepted call, it:

1. Computes the resulting on-disk content (Write = new content; Edit = apply old_string → new_string in memory).
2. Fetches the current `HEAD` snapshot of the file via `getHeadLedgerContent`.
3. Parses both via `parseDecisionLedgerContent`.
4. Runs `validateDecisionLedger(current, previous)` to enforce:
   - D-id monotonicity and uniqueness.
   - Frozen-field immutability: `decision` and `why` text cannot be changed in-place.
   - Status transitions only via supersede (accepted → superseded-by:D-NNN requires a matching new entry).

DENY on any violation. ALLOW on all other paths.

## No-Op Invariant (tested)

- Target file basename is not `decisions.yml` → immediate ALLOW.
- `decisions.yml` is absent from HEAD (new file, first append) → `previous = null` → immutability/status checks skip → ALLOW.
- Any internal error → fail-open → ALLOW.

## Coverage Boundary

**This hook does NOT intercept all writes to decisions.yml.** Specifically:

- **Bash-level writes** (`echo >> decisions.yml`, `sed -i`, `tee`, `cat >`) bypass PreToolUse hooks entirely and are not covered.
- **Same-session pre-commit edits**: immutability is HEAD-relative. If brainstorming appends a new entry and then edits it before the next commit, the hook sees null `previous` for the new entry and allows it (S8 limitation in `validateDecisionLedger`'s design — by construction, not a bug).
- **Non-git-repo or detached-HEAD cwd**: `getHeadLedgerContent` returns null → previous = null → checks skip → ALLOW (fail-open, safe).

These gaps are acceptable — the hook hardens the common case (Edit/Write tool in a normal session) and is explicitly fail-open for uncertain states.

## Block Mechanism

Outputs PreToolUse stdout JSON with `permissionDecision: 'deny'` (exit 0). The hook is registered synchronously (no `async`) — async hooks cannot block.

## Fail-Open Posture

Any error thrown in `main()` is silently caught and the tool call proceeds. A false-positive block (denying a valid write) is more damaging than a false-negative — users disable hooks wholesale to recover. When in doubt, allow.
