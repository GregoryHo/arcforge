# hooks — spec

> Status: shipped v6.0.0 · extended by 6.1.0 (building) · [ROADMAP](../ROADMAP.md)
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
  outside that gate and runs either way, but *depth* is split by what the field
  is: metadata about the session is continuity, the user's own words and
  anything handed to a model are not.

  | Recorded on a threshold hit | Learning off | Learning on |
  |---|---|---|
  | Session record: duration, message and tool counts, compactions | yes | yes |
  | Tool names used, files modified (paths) | yes | yes |
  | Diary draft (renders the two rows above) | yes | yes |
  | Verbatim recent user messages, in the session record | **no** | yes |
  | Background enrichment run over a session summary | **no** | yes |
  | Reflection nudge ("N diaries ready for reflection") | **no** | yes |

  The last row is why the nudge and the diary-ready notice split: diary-ready
  points at a continuity artifact that exists and can be read now, while
  reflection is the learning loop itself, which [learning](learning.md) B-1
  keeps off. Left ungated it would re-queue at every threshold hit, forever,
  over diaries the user never authorized anything to be made of.

  So with learning off the draft is written but never filled in: its unfilled
  sections are the contract, not a failed enrichment, and the hooks do not
  report them as one. What the draft does fill in is the two rows above — the
  counts, the tool names, and the paths of the files the session touched — plus
  a tool-usage aggregate whenever an observations log already exists for the
  project; since observation is itself gated, with learning off that aggregate
  can only be residue of a period when learning was on, and nothing new is
  observed to build it. The stale-draft healthcheck counts only drafts written
  since the opt-in took effect, so turning learning on reports what the enricher
  has since failed to fill in, rather than the backlog of stubs from before it
  was ever asked to. The floor is the earlier of the draft's creation and
  last-write times, so hand-editing or touching a pre-opt-in stub does not lift
  it above the floor. Two things still do, and are reported: a copy that
  preserves neither stamp — a sync re-download or a naive unzip, where ordinary
  restore tooling keeps the modification time and so stays below the floor — and
  a filesystem that records no creation time, which leaves the floor resting on
  last-write alone. There is no
  per-hook switch: the single opt-in covers the learning loop in either scope,
  disabling learning stops it, and uninstalling the plugin removes everything.

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
`scripts/lib/transcript.js` parses out of the harness transcript (with no parsed
transcript — below the threshold, or above it with none to read — `filesModified`
is cleared while `userMessageContent` and `toolsUsed` are neither written nor
cleared, so a record an earlier parse filled keeps that turn's prose and tool list
until a later parse refreshes them), and
`hooks/pre-compact/main.js` appends each compaction. The diary is
not a hooks format but learning's ([learning](learning.md)); what this area owns is its
trigger — the threshold gate and background enrichment `scripts/lib/diary-capture.js`
coordinates for both Stop and PreCompact. Everything else a hook handles — tool
names, paths, prompts arriving in an event — is untrusted input with no persistence
of its own (B-5).

## Decisions

The warn-only and fail-open stances predate this log; their rationale is
inline above (B-2, B-3). The error-handling tier that
implements fail-open is pinned in `.claude/rules/coding-standards.md`.

- **D-010** — session capture depth: counts always, verbatim user prose only
  under the opt-in (B-6).
- **D-009** — the enrichment run that B-6 gates is also unprivileged
  ([learning](learning.md) B-9).
