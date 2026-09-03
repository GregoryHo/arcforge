# hooks — spec

> Status: shipped v6.0.0 · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose

The hook layer runs around the events of a Claude Code session — start, prompt,
tool use, compaction, stop — to maintain continuity (session records, compaction
salvage, carried-over context), to warn before a credential lands in a file or
commit, and to feed the learning loop once a user opts in. Its defining stance
is restraint: a hook may decline its own job, but it must never take the session
down, never block the user, and never observe them uninvited.

## Scope

- **In scope:** the shipped hook set and its registrations; the fail-open
  contract; the never-deny stance; the privacy gate; critical-path placement.
- **Out of scope:** what the learning loop does with observations
  ([learning](learning.md)); hook implementation and event mechanics
  (`docs/guide/hooks-system.md` teaches the surface; `.claude/rules/plugin.md`
  owns registration mechanics).

## Behavior

### Shape
- **B-1 Six hooks, nine registrations, zero configuration.** The set loads
  automatically with the plugin and unloads with it — nothing to add to
  `settings.json`, no per-hook setup. Session tracking accounts for three
  registrations (`inject-context`, `session-start`, `session-end`), observation
  for two (`observe-pre`, `observe-post`); `user-message-counter`,
  `secrets-guard`, `compact-suggester`, and `pre-compact` complete the set.

### Safety contract
- **B-2 Fail-open, always.** A hook that throws — corrupt state file, full
  disk, permissions — exits quietly and the session continues exactly as it
  would have. Internal diagnostics go to stderr where the harness discards
  them; only deliberate user-facing messages (the credential warning, the
  compact suggestion, the session summary) ever reach the user.
- **B-3 No hook denies anything.** Of the registered events only `PreToolUse`
  could block a tool call, and the one hook there that scans content —
  `secrets-guard` — is deliberately warn-only. The product position: a false
  positive should cost the user a sentence to read, not a blocked edit.
- **B-4 The credential warning cannot itself leak.** `secrets-guard` scans
  edits, writes, and `git commit` content for credential shapes and, on a hit,
  names the *category* of finding — it MUST NOT echo the matched string.
  Test-, example-, and fixture-shaped lines are exempt so routine false
  positives stay quiet.
- **B-5 Hook input is untrusted.** Tool names, paths, and prompts arriving in
  hook events are treated as potentially adversarial — validated and sanitized
  before any filesystem or shell use (`.claude/rules/security.md`).

### Privacy
- **B-6 The opt-in gates the learning capture, not every record.** The two
  observation registrations check for an enabled configuration and exit before
  doing any work when learning is off — the default — so with learning off
  nothing is observed and no pattern is ever mined. Session bookkeeping sits
  outside that gate and runs either way: every session leaves a durable record
  on disk, and a session that passes the activity threshold additionally writes
  a diary draft, stores in that record the recent user messages the draft is
  built from, and hands the draft to a background enrichment run. There is no
  per-hook switch: the single opt-in covers the learning loop, disabling
  learning stops it, and uninstalling the plugin removes everything.

### Performance
- **B-7 The synchronous path stays small.** Observation writes and
  session-record construction are registered async so disk I/O never joins the
  path a tool call waits on. What remains synchronous is bounded: a scan of
  text about to be written, a counter increment, one context injection at
  session start.

### Continuity
- **B-8 The session leaves a record.** Session tracking maintains a durable
  record of each session (duration, activity) that the learning loop and diary
  build from — kept unconditionally, because continuity is not a learning
  feature (B-6 bounds what that record holds); `pre-compact` captures what
  compaction is about to drop so the
  worthwhile part of a long session survives the boundary; `inject-context`
  starts the next session with what carried over — active instincts, pending
  reviews, where the last session left off — and is close to silent when
  learning has never been enabled.

## Data / domain model

Hooks own one durable format: the per-session JSON record that B-8 keeps
unconditionally and B-6 bounds. Its path and its safe read/write belong to
`scripts/lib/utils.js`; the fields are assembled by the three hooks that write it —
`hooks/session-tracker/start.js` opens the record, `hooks/session-tracker/end.js`
closes it with the counts and, above the diary threshold, with the summary
`scripts/lib/transcript.js` parses out of the harness transcript (below it,
`filesModified` is cleared and the other transcript-derived fields are simply not
written), and `hooks/pre-compact/main.js` appends each compaction. The diary is
not a hooks format but learning's ([learning](learning.md)); what this area owns is its
trigger — the threshold gate and background enrichment `scripts/lib/diary-capture.js`
coordinates for both Stop and PreCompact. Everything else a hook handles — tool
names, paths, prompts arriving in an event — is untrusted input with no persistence
of its own (B-5).

## Decisions

The warn-only and fail-open stances predate this log; their rationale is
inline above (B-2, B-3). The error-handling tier that
implements fail-open is pinned in `.claude/rules/coding-standards.md`.
