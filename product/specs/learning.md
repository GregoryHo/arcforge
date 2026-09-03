# learning — spec

> Status: shipped v6.0.0 · extended by 6.1.0 (building) · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose

Learning is arcforge's opt-in memory: it watches how a user works, proposes
patterns worth keeping, and — only with explicit authorization — lets those
patterns shape future sessions. The product's core asset here is the trust
design, not the extraction: everything is off by default, every step that could
change behavior waits for a person, and the user can always read exactly what
was recorded about them.

## Scope

- **In scope:** the loop (session → diary → pattern → instinct → activation);
  the trust gates; confidence semantics; scoping; storage and privacy.
- **Out of scope:** the observation hooks' event mechanics ([hooks](hooks.md));
  the candidate/curator data contracts — frozen in
  [`docs/decisions/learning-curator-schema/`](../../docs/decisions/learning-curator-schema/README.md);
  operating instructions (`docs/guide/learning-dashboard.md`).

## Behavior

### Consent
- **B-1 Off until turned on.** With learning disabled — the default — the
  observation hooks exit before doing any work, so nothing is observed and no
  candidate is ever proposed. What the opt-in does not gate is session
  bookkeeping: the durable session record, and the diary draft an active enough
  session produces, are continuity features that run either way
  ([hooks](hooks.md) B-6). The line falls where content leaves the machine or
  the user's own words are stored: **diary enrichment — the one outbound path
  (B-9) — runs only under the opt-in**, so with learning off a draft keeps its
  unfilled sections permanently, and that stub is the contract rather than a
  failure to report. Nothing invites the user into the loop from that state
  either: the reflection nudge waits for the same opt-in, because a permanent
  offer to analyze diaries is itself a way of not taking "off" for an answer.
  Enabling is an explicit, scoped act (`--project` or
  `--global`) but *being* enabled is not scoped: either scope authorizes
  capture. Status is always inspectable.
- **B-2 Exactly one automatic step in the candidate pipeline.** Once enabled,
  observations become review-queue candidates automatically — and that is the
  *only* step of that pipeline that happens by itself. Every subsequent arrow
  is a decision the user makes. (Diary drafting is the separate always-on path
  of B-1; it produces nothing a user must decide about.)
- **B-3 Three gates before behavior changes.** A candidate moves
  `pending_review → approved → materialized → activated`, and every state stays
  separate and inspectable: *approved* records agreement with nothing on disk;
  *materialized* writes a draft the user can read, still inert; *activated*
  takes effect. A convenience may collapse the two inert transitions — the
  CLI's `accept` approves and materializes in one call — but never the one that
  changes behavior: activation is always its own decision, because agreeing a
  pattern is real, seeing exactly what would be written, and accepting a
  behavior change are different decisions. Activation and deactivation
  additionally require an explicit acknowledgement that behavior is changing.
- **B-4 Injection is bounded and reversible.** Only activated instincts are
  injected, at SessionStart, capped at the top five by confidence. Disabling
  learning stops accumulation but MUST NOT silently undo what the user
  accepted — retiring an instinct is its own explicit deactivation.

### Integrity
- **B-5 One queue, one gate, one audit trail.** Every candidate lives in one
  canonical queue, and both surfaces onto it — the dashboard and the CLI's
  `learn` candidate commands — are front ends over that one store. Neither
  keeps its own state machine: both offer only the transitions legal from a
  candidate's current state, both name the behavior change before anything that
  changes future behavior takes effect, and every action either takes —
  accepted or refused — lands in the same audit log with its reason and with
  who asked for it. Where the two differ is who supplies the acknowledgement
  that gates activation: the dashboard collects it from the reviewer, while on
  the CLI the typed `learn activate <id>` **is** the deliberate act, so the
  warnings print and the command carries its own acknowledgement. A scripted
  activation therefore has no second human in the loop — the typed command was
  the human. What the CLI adds is scriptability, not a second store. It works
  the candidates of the project it is run in — the queue is machine-wide, so
  `--project` means *this* project, matched on the project name each card
  prints — and refuses `--global`: a candidate that would apply to every
  project on the machine is reviewed where the reviewer can see what it
  changes. Its reach is what the engine can actually build — the instinct
  artifact. That narrowing is the curator's own refusal, which the CLI renders
  rather than re-decides, so it too is audited; every single-step command
  renders that refusal rather than pre-empting it. `accept`, the one compound
  command, is the exception that proves the rule: it would approve before
  meeting the refusal, and the queue is append-only, so it decides the
  narrowing itself and refuses before its first move — nothing applied,
  nothing recorded, the candidate untouched. Hand-editing state files is the
  one path with no checks and no record; the product treats it as out of
  contract. A draft is the exception that is still owed a report, because
  reviewing one is what the product asks of the user: no surface names a draft
  as ready to review, hands its path back as a success, or offers the
  activation that would refuse, when the draft it would name is not there —
  the file missing, changed since it was written, or no usable record of it
  left. The on-disk formats are append-only or atomically overwritten, owned
  by the engine per the curator schema (cited above).
- **B-6 Confidence sorts and caps — it never activates.** The confidence
  score orders instincts and bounds injection; no threshold ever flips one on.
  Its ceiling depends on source: a rule the user stated outright can climb
  higher than one inferred from reflection, because an inference about the
  user is weaker evidence than their own words. Users can `confirm` or
  `contradict` any instinct; enough contradiction archives it.
- **B-7 One session, one record.** When a diary draft exists, it *is* the
  entry — finalizing renames the draft rather than merging, and writing a
  second diary alongside a draft would orphan one of them. The `/learning`
  skill owns knowing when a session is worth recording at all.
- **B-8 Reflection does not overclaim.** Under three diaries the scan reports
  not-ready rather than generalizing from noise. Findings are split into
  **patterns** (three or more diaries agree) and **observations** (one or two,
  labelled as such), every finding cites the diaries it came from, and
  processed diaries are marked so the same ground is not re-mined.

### Privacy
- **B-9 Local, legible, scoped.** All state stays on the user's machine:
  arcforge has no telemetry and no service of its own to report to. The one
  outbound path is diary enrichment, which runs the host tool over a parsed
  summary of the session — so that summary reaches the model the way any turn
  of the session does, and nowhere else. It is opt-in (B-1), and it no longer
  runs with permissions switched off: it gets two tools, `Read` and `Write`,
  and the draft's own directory is added to the ones it may work in. It is not
  a sandbox, and the spec does not claim one — the run still inherits the
  directory it was started from, which is the project, and edits inside those
  directories are auto-approved rather than prompted, because a detached run
  has nobody to answer a prompt. What it no longer carries is the blanket
  bypass of every check. State
  follows its scope: the candidate queue, the audit log, the drafts
  materialization writes and the activated instincts are all home-global under
  `~/.arcforge/`, and the project's own `.arcforge/learning/` holds that
  scope's opt-in. Nothing in the review loop writes into the user's repository,
  so a half-finished review never turns up in their `git status`. Commands
  print the absolute path of anything they write. The candidate commands are
  project-scope only — reads as well as transitions — and scoped to the project
  they are run in, so a machine-wide store never lets one project list or
  activate another's candidates; what they print is
  the same allowlisted view the dashboard serves: never the hashed project id,
  never a raw proposal body. A `--global` read would have printed the canonical
  queue's records as they sit on disk; a global transition would have flipped
  behavior-changing state for every project at once. Both are refused.

## Data / domain model

The area's formats are frozen layer by layer in
`docs/decisions/learning-curator-schema/`, and each has a single owner in
`scripts/lib/` that validates what its writer emits rather than restating the
shape. The entities are the observation, the candidate, the instinct, the diary,
and the audit record.

The candidate is the one with a lifecycle — `pending_review → approved →
materialized → activated`, the three gates of B-3. That canonical status
vocabulary is `LIFECYCLE_STATUS` in `scripts/lib/learning-curator/lifecycle.js`,
frozen in
`docs/decisions/learning-curator-schema/layer-5-candidate-queue-lifecycle.md`; the
queue record carrying it — including the `project` / `global` scope kind — is
owned by `scripts/lib/learning-curator/schema.js` and appended only by
`scripts/lib/learning-curator/queue-writer.js`. The instinct file, the diary path,
and the operation record are the three formats pinned by
`scripts/lib/learning-schemas.js`. There is no second candidate vocabulary:
`scripts/lib/learning.js` retains only the opt-in config and its `VALID_SCOPES`,
so the statuses above are the ones both the dashboard and the CLI speak (D-012).

The invariants: state is only ever advanced through the engine (B-5), scope decides
location (B-9), and one session yields one diary (B-7).

## Decisions

The conservative trust design — default-off, three gates, bounded injection,
audit trail — predates this log; its rationale is inline above. The mechanical
data contracts live in `docs/decisions/learning-curator-schema/`.

- **D-009** — diary enrichment is opt-in, and the enricher loses its blanket
  permissions (B-1, B-9).
- **D-010** — session capture depth: counts always, verbatim user prose only
  under the opt-in ([hooks](hooks.md) B-6).
- **D-011** — the CLI's candidate read commands fail closed on `--global`
  (B-5, B-9).
- **D-012** — the `learn` candidate commands are a front end onto the canonical
  queue; the project-scoped queue is gone (B-5, B-9).
