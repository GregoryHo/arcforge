# sdd-ledger-guard

PreToolUse hook that enforces append-only immutability on `specs/<id>/decisions.yml`.

## What It Does

Intercepts `Edit` and `Write` tool calls whose target file basename is `decisions.yml`. For each intercepted call, it:

1. Computes the resulting on-disk content (Write = new content; Edit = apply old_string → new_string in memory).
2. Fetches the baseline: the `HEAD` snapshot via `getHeadLedgerContent` when the file is tracked; when there is no HEAD version (untracked/uncommitted ledger, non-git-repo), falls back to the pre-edit on-disk content.
3. Parses both via `parseDecisionLedgerContent`.
4. Runs `validateDecisionLedger(current, previous)` to enforce:
   - D-id monotonicity and uniqueness.
   - Frozen-field immutability: `decision` and `why` text cannot be changed in-place.
   - Status transitions only via supersede (accepted → superseded-by:D-NNN requires a matching new entry).

DENY on any violation. ALLOW on all other paths.

## No-Op Invariant (tested)

- Target file basename is not `decisions.yml` → immediate ALLOW.
- `decisions.yml` is absent from HEAD **and** absent (or unreadable) on disk — a brand-new file, first write → `previous = null` → immutability/status checks skip → ALLOW.
- Any internal error → fail-open → ALLOW.

## Coverage Boundary

**This hook does NOT intercept all writes to decisions.yml.** Specifically:

- **Bash-level writes** (`echo >> decisions.yml`, `sed -i`, `tee`, `cat >`) bypass PreToolUse hooks entirely and are not covered.
- **Baseline priority**: HEAD wins when the file is tracked. When there is no HEAD version (untracked/uncommitted ledger — every new spec before its first commit — or non-git-repo / detached-HEAD cwd), the baseline is the pre-edit on-disk content, so append-only is enforced edit-over-edit (closes the former S8 hole for uncommitted ledgers).
- **Residual same-session gap (HEAD-tracked files)**: because HEAD stays authoritative for tracked files, appending a new entry and then editing it before the next commit still escapes — HEAD has no `previous` for the new entry (S8 limitation in `validateDecisionLedger`'s design — by construction, not a bug).
- **Brand-new file** (no HEAD version, nothing readable on disk): previous = null → checks skip → ALLOW (fail-open, safe).

These gaps are acceptable — the hook hardens the common case (Edit/Write tool in a normal session) and is explicitly fail-open for uncertain states.

## Block Mechanism

Outputs PreToolUse stdout JSON with `permissionDecision: 'deny'` (exit 0). The hook is registered synchronously (no `async`) — async hooks cannot block.

## Fail-Open Posture

Any error thrown in `main()` is silently caught and the tool call proceeds. A false-positive block (denying a valid write) is more damaging than a false-negative — users disable hooks wholesale to recover. When in doubt, allow.
