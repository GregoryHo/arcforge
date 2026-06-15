# arc-guard

PreToolUse **blocking** hook. Hardens the Worktree Rule (documented in
`arc-using`) from advisory prose into a deterministic gate.

## What it does

Dispatches by tool. Each rule has its own self-gating signal and is a no-op
otherwise; it denies via `permissionDecision: 'deny'`.

| Rule | Tool | Gate (signal) | Trigger → redirect |
|------|------|---------------|--------------------|
| G2 | Bash | `.arcforge-epic` in cwd | raw `git merge` → arc-finishing flow, epic path (`finish-epic.js merge`/`sync`) |
| G3 | Bash | `.arcforge-epic` in cwd | arcforge loop invocation → run it from the base session (`arc-looping`) |
| R-immutable | Edit/Write | `research-config.md` in cwd | editing the locked contract → it's the immutable judge (names the human-approved unlock escape) |
| R-scope | Edit/Write | `research-config.md` in cwd | editing a CANNOT-modify path → out-of-scope write |

## Why these and the precision choices

- **`.arcforge-epic` is the one high-precision discriminator** arcforge has. G2/G3
  are self-gated by it (marker present ⇔ "you're an implementer in a worktree").
  Rules that would fire from a **base** session ("block out-of-worktree edits")
  were deliberately not added — a base session legitimately coordinates (edits
  `dag.yaml`, `specs/`), so blocking there false-positives.
- **`git merge`** excludes `git merge-base` and conflict-recovery
  (`--abort/--continue/--quit`) — those run legitimately during the epic merge
  flow. **Loop** matches invocations, not `cat`/`diff` of a file named `loop.js`.
- **R-scope blocks only CANNOT entries that resolve to an existing file/dir.**
  `research-config.md`'s CANNOT list is free-form prose, so prose words and globs
  are skipped. A missed fence is recoverable (the research loop runs on a branch
  and resets); a false block mid-loop is not.

See `docs/plans/hook-hardening-design.md` for the full tier analysis.

## No-op invariant (tested)

When cwd has no `.arcforge-epic` marker (Bash rules) and no `research-config.md`
(Edit/Write rules), the hook emits nothing and the tool call proceeds. A
false-positive on the block path is the expensive failure mode (users disable
arcforge hooks wholesale), so the gates are narrow and the patterns conservative
(`git merge` excludes `git merge-base`; R-scope blocks only existing paths). The
invariant is enforced by `hooks/__tests__/arc-guard.test.js`.

## Mechanism

PreToolUse stdout JSON `{ hookSpecificOutput: { hookEventName: 'PreToolUse',
permissionDecision: 'deny', permissionDecisionReason } }`, exit 0; the reason is
fed back to Claude. Registered **without `async`** — async hooks cannot block.
The coordinator's own git calls use `execFileSync` (not the Bash tool), so they
bypass this hook; G2 only ever sees the agent's manual `git merge`.
