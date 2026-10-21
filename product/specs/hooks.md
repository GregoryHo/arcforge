# hooks — spec

> Status: shipped v6.5.1 · [ROADMAP](../ROADMAP.md)
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
- **B-1a The registry is named for its host, not by convention.** The nine
  registrations live in `hooks/claude-code.json`, loaded because
  `.claude-plugin/plugin.json` declares it. The conventional `hooks/hooks.json` <!-- doc-ref-lint: ignore R1 names the path that must NOT exist; its absence is the guard (check:hooks) -->
  stays empty: it is the path a second harness auto-discovers plugin hooks at,
  and these hooks are Claude Code's alone (see
  [codex-harness](codex-harness.md)). `npm run check:hooks` gates both halves —
  the declaration and the emptiness.

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
  edits, writes, and the text of a `git commit` command — not the content the
  commit stages, which no hook reads (D-029) — for credential shapes and, on a
  hit, names the *category* of finding — it MUST NOT echo the matched string.
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
  | Diary draft (renders row 1 and the paths from row 2) | yes | yes |
  | Verbatim recent user messages, in the session record | **no** | yes |
  | Background enrichment run over a session summary | **no** | yes |
  | Reflection nudge ("N diaries ready for reflection") | **no** | yes |

  The last row is why the nudge and the diary-ready notice split: diary-ready
  points at a continuity artifact that exists and can be read now, while
  reflection is the learning loop itself, which [learning](learning.md) B-1
  keeps off. Left ungated it would re-queue at every threshold hit, forever,
  over diaries the user never authorized anything to be made of. The nudge is
  gated at both ends — queue and delivery — so an opt-out between them retracts
  a nudge already queued instead of spending it on the next session start.

  So with learning off the draft is written but never filled in: its unfilled
  sections are the contract, not a failed enrichment, and the hooks do not
  report them as one. What the draft does fill in is the counts and the paths
  of the files the session touched, plus a tool-usage aggregate — the only
  place tool names appear — whenever an observations log already exists for the
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
  last-write alone. The floor cuts the other way once, and it is a silence
  rather than a false alarm: a draft first written before the opt-in and
  rewritten in place afterwards keeps its original creation time, so a genuine
  post-opt-in enrichment failure over it is never reported. Disabling the
  scope that carries the earliest opt-in — global on, then project on, then
  global off — does not advance the floor while the other scope stays on, when
  a 6.3 engine recorded that disable: "the opt-in took effect" means the start
  of unbroken any-scope authorization, which each scope's `enabled_at` keeps
  through such a disable. A disable an older engine recorded is not counted,
  so there the floor does advance ([learning](learning.md) B-19, D-051,
  D-053). There is no per-hook switch: the
  single opt-in covers the learning loop in either scope, disabling learning
  stops it, and uninstalling the plugin removes everything.

### Performance
- **B-7 The synchronous path stays small.** Observation writes and
  session-record construction are registered async so disk I/O never joins the
  path a tool call waits on. What remains synchronous on every event is
  bounded: a scan of text about to be written, a counter increment, one context
  injection at session start. Above the diary threshold — 10 user messages or
  50 tool calls since the last draft — Stop and PreCompact add two costs on top:
  a parse of the whole session transcript, and the subprocess that renders the
  diary draft, which is killed after 5 s. The transcript parse is not bounded:
  it reads and decodes every line of the transcript, however long the session
  has run, although what it keeps is a capped tail — about 5 ms per MB on real
  transcripts. From 6.5.1 the parse reads at most the last 8 MiB of the
  transcript, starting at the first whole line in that window, and marks its
  result truncated when it did; above the bound the diary's tool and file
  lists are the window's, not the whole session's (#172, D-065).
- **B-9 The diary threshold counts every tool call (6.4.0).** The per-session
  tool count behind B-7's 50-call threshold gains exactly one for every
  PostToolUse, however many of those hooks run at the same moment, so a session
  with many tool calls and few prompts reaches the threshold at the Stop that
  crossed it — not one Stop later, and not never when that was its last Stop.
  The increment stays on B-7's bounded synchronous path (#260, D-055).

### Continuity
- **B-8 The session leaves a record, and the next one is told where the
  newest archive is (6.5.0).** Session tracking maintains a durable record of
  each session (duration, activity) that the learning loop and diary build
  from — kept unconditionally, because continuity is not a learning feature
  (B-6 bounds what that record holds); `session-start` opens it, and
  `pre-compact` captures what compaction is about to drop so the worthwhile
  part of a long session survives the boundary. What a new session starts
  with is `inject-context`'s. From learning and pending-action state the
  model receives up to five activated instincts — only ids the user
  activated, ranked and capped by confidence — the queued notices (a diary
  draft ready, a finished loop run, and the reflection nudge under the
  opt-in only, B-6), and, once learning is on, the stale-draft warning. From
  6.5.0 it also receives one line of continuity: on a SessionStart whose
  source is `startup` or `clear`, the line names the project's newest
  session archive ([cli](cli.md) B-9) — by an alias that points at it, or by
  its file when none does — with the date it was saved, and the command that
  reads it, `arcforge session resume <alias|path>`. The line reads
  `Previous session archive: <alias>, saved <YYYY-MM-DD>. Read it: arcforge
  session resume <alias>`; when no valid alias points at the newest archive,
  its file name stands in for the alias and its absolute path is what the
  command is given, written as one shell word — single-quoted when it holds
  a space or a shell metacharacter — so the command runs as printed; a path
  that holds a control character yields no line. "Newest" is the newest engine-written archive by the
  stamp in its file name (`archive-<alias>-<YYYYMMDDTHHMMSSZ>[-n].md`); a
  hand-named file under the sessions directory is not considered, and the
  saved date is the UTC date of the archive's directory. A `resume` or
  `compact` start gets no such line, since that is the same session going
  on, a project with no archive gets none, and neither does a session
  arcforge spawned itself — the diary enricher, a loop task — the same skip
  `inject-context` already applies to pending actions. The line is all that crosses over: the
  archive's five sections are never injected, and nothing is read from the
  previous session's record, so reading the archive stays something the
  session does, not something done to it (D-061). The line does not wait on
  the learning opt-in, because an archive holds none of the user's words
  ([learning](learning.md) B-20). Finding the archive stays on B-7's bounded
  path: the lookup reads names only — the date directories, the archive
  file names, which carry the save stamp, and the project's alias index —
  and never opens an archive. "The project" is the sanitized directory
  basename, so two same-named projects share one newest archive (D-037). An
  alias index that cannot be parsed, or one edited by hand so that its keys
  are not valid aliases, yields the path form of the line, not the alias. The
  user sees a one-line summary of the same, plus counts of session aliases
  and of patterns promoted to global in the past week. With learning never
  enabled and no archive saved, no instinct, nudge, warning or pointer
  appears, so the injection is close to silent.

## Data / domain model

Hooks own one durable format: the per-session JSON record that B-8 keeps
unconditionally and B-6 bounds. Its path and its safe read/write belong to
`scripts/lib/utils.js`; the fields are assembled by the three hooks that write it —
`hooks/session-tracker/start.js` opens the record, `hooks/session-tracker/end.js`
closes it with the counts and, above the diary threshold, with the summary
`scripts/lib/transcript.js` parses out of the harness transcript (with no parsed
transcript — below the threshold, or above it with none to read — a Stop clears
`filesModified` while `toolsUsed` is neither written nor cleared, so a record an
earlier parse filled keeps that turn's tool list until a later parse refreshes it;
`userMessageContent` follows a different lifetime, because the opt-in governs how
long it may stay and not only whether it is written — every Stop, and every
compaction that stamps the record, removes it whenever learning is off, so prose
captured under the opt-in does not outlive it), and
`hooks/pre-compact/main.js` appends each compaction and, above that same
threshold, stamps the compaction's own counts and parsed summary *before* the
draft is generated — the draft is rendered from the record, so a compaction that
reaches the threshold before any Stop has closed it would otherwise report the
previous turn's numbers and none of the paths it touched. A compaction stamps
only what it can read: with no parsed transcript it leaves the record's paths as
an earlier Stop wrote them rather than clearing them. The diary is
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
- **D-029** — B-4 says the guard scans the commit command, not the
  committed content; a staged-content scan waits as a wish (B-4).
- **D-031** — B-8 stopped promising where the last session left off;
  superseded by D-061 (B-8).
- **D-061** — from 6.5.0 SessionStart names the project's newest session
  archive and the command that reads it, in one line, on `startup` and
  `clear` only, never the archive's contents (B-7, B-8).
- **D-051** — the stale-draft floor no longer advances when an overlapping
  scope is disabled (B-6).
- **D-053** — only a disable a 6.3 engine recorded keeps the floor; one an
  older engine recorded is not counted (B-6).
- **D-055** — 6.4.0 stops the diary tool counter losing increments under
  concurrent PostToolUse hooks (B-9).
- **D-065** — from 6.5.1 the diary transcript parse reads at most the
  transcript's last 8 MiB (B-7).
