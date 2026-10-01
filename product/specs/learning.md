# learning — spec

> Status: shipped v6.1.2 · extended by 6.2.0 (building) · [ROADMAP](../ROADMAP.md)
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
  the user's own words are stored: **the two outbound paths — diary
  enrichment and the curator's analysis (B-9) — run only under the opt-in**,
  so with learning off a draft keeps its unfilled sections permanently, no
  observation left behind by an earlier opt-in is analyzed, and that stub is the contract rather than a
  failure to report. Turning learning back on does not reach back: only
  observations recorded after the effective opt-in are analyzed, and those left
  on disk from before an opt-out stay unanalyzed (D-023). Nothing invites the user into the loop from that state
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
  accepted — retiring an instinct is its own explicit deactivation (B-12).
- **B-12 Deactivation is a command, not only a dashboard button.**
  `learn instinct deactivate <id>` takes an activated instinct of the project
  it is run in out of the injected set. It dispatches the same canonical
  `deactivate` transition as the dashboard's Deactivate, so it passes the same
  matrix, and its result — done or refused — lands in the audit log naming the
  instinct, the candidate it came from and who asked (B-5). Like
  `learn activate`, the typed command is the deliberate act: it prints that
  future sessions will no longer receive the instinct and carries its own
  acknowledgement. The active file moves to the deactivation archive rather
  than being deleted, so the candidate can be materialized or activated again
  from `deactivated`. An id that names no activated instinct of this project is
  refused with nothing moved (D-020).
- **B-13 A saved instinct is a note, not a behavior change.** An instinct
  written by `learn instinct save` — by hand, or from reflection with
  `--source reflection` — creates no candidate, so it never enters the
  activation set: it is not activatable and it is never injected (B-3, B-4).
  The product says so wherever a user would assume otherwise: the save
  command's output states that the instinct will not reach future sessions,
  and the `learning` skill's "remember this" wording says the same before it
  saves, so no one is left believing a rule they stated will take effect.
  Cost accepted: a rule the user states outright does not reach a future
  session through this path (D-038).

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
  changes. Scope is a refusal class the engine does not model, and so one the
  CLI decides alone and leaves unaudited: neither `--global` nor an id this
  project does not own — another project's, a global one, or one naming no
  project at all — is a gate the engine models, so there is no refusal of its
  own to dispatch and render; dispatching would *accept* the action and move a
  candidate this project may not touch. An id that names no candidate anywhere
  is not a scope question: that refusal the engine does model, so a transition
  naming one is dispatched, refused and audited like every other. Its reach is
  what the engine can actually build — the instinct artifact. That narrowing is
  the curator's own refusal, which the CLI renders rather than re-decides, so
  it too is audited; every single-step command renders that refusal rather than
  pre-empting it. `accept`, the one compound command, is the exception that
  proves the rule, and refuses unaudited too — for the opposite reason, since
  the engine does model both of its checks: it would approve before meeting the
  refusal, and the queue is append-only, so it decides for itself the two
  things that no re-run clears — the artifact type, and whether the candidate's
  name is one the draft writer can use as a filename — and refuses before its
  first move: nothing applied, nothing recorded, the candidate untouched.
  Hand-editing state files is the
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
- **B-10 Decay charges each period once, and never retires an activated
  instinct.** Confidence decays with the time since an instinct was last
  confirmed. Running the decay cycle any number of times over the same
  interval MUST give the result of running it once. Decay MUST NOT archive an
  activated instinct — it leaves the injected set only through the user's
  deactivation (B-4) — and every archive decay does perform MUST write an
  audit record naming the instinct and stamp the archived file with the
  reason it was archived, so a later reader can tell a decay archive from a
  contradiction archive (D-022).
- **B-11 The way back from the archive is a command.** `learn instinct
  restore` moves an archived instinct back out of the archive, whatever
  archived it — the user's explicit command outranks both decay and an earlier
  contradiction — and records the restore in the audit log, naming the
  instinct, the file it returned to, and the archive reason when the file
  carries one; files archived before that stamp existed carry none and are
  restorable all the same. When an active instinct of the same name already
  exists, restore MUST refuse and name both files rather than overwrite either.
  Hand-editing state stays out of contract (B-5), so this is the only
  supported route back; like every change to what may be
  injected, it is audited (D-040).
- **B-14 A candidate name is checked at the door, once.** Layer 5 ingestion
  rejects a candidate whose `name` the draft writer could not use as a
  filename, or that the redactor would alter, and records the rejection with
  its reason in `rejections.jsonl` like any other declined proposal. The check
  is the draft writer's own path policy plus the redactor run over the name, so
  a candidate the queue accepts is never refused `path_policy_rejected` at
  materialization, and every stored name is one the product can show as it is
  — in a card, a draft filename, a draft body and an activated instinct. Names
  are never normalized at materialization: one candidate has one name.
  Candidates queued under such a name before this check existed are not
  rewritten; they leave `approved` through the dismiss exit of B-15 (D-035).
- **B-15 No lifecycle state is a dead end.** Besides the transitions of B-3,
  the Action × Status matrix lets an `approved` candidate be dismissed —
  retiring a verdict that cannot proceed, such as a non-instinct artifact type
  or a name from before B-14 — and a `materialized` candidate be materialized
  again, which rewrites its draft from the stored record so the reviewed
  content and the file agree after a hand edit or a deletion. Both exits are
  offered on the dashboard and on the CLI (`learn reject`, the CLI's name for
  dismiss, and `learn materialize`), pass the same gate and land in the same
  audit log (B-5). The frozen Layer-5 contract carries both cells in its
  canonical matrix, and its version is bumped with them, so a reader can tell
  this matrix from the one before (D-036).
- **B-16 A transition is checked and recorded under one lock.** The legality
  check a transition passes reads the candidate's current state inside the
  same store lock that appends the transition — on the dashboard, on the CLI,
  and on the contradict path that deactivates. Two writers acting on one
  candidate at once are serialized: the second sees the first's result and is
  refused if its move is no longer legal, so replaying the queue never yields
  an order the matrix forbids (#178, D-020).
- **B-17 Declined proposals are kept, and shown.** `rejections.jsonl` rotates
  to an archive file once it passes any of the Layer-5 contract's retention
  limits — 30 days, 5,000 records or 10 MB, whichever comes first. Rotation
  moves records and never deletes one, so the record of what the curator
  declined and why survives. The dashboard shows the rejections, each with its
  reason, through the same sanitized view it serves for a card — never a raw
  proposal body — and no rejection is ever read back as learning evidence
  (D-041). Residual: the archive itself is unbounded, and `queue.jsonl`
  rotation stays deferred.
- **B-7 One session, one record.** When a diary draft exists, it *is* the
  entry — finalizing renames the draft rather than merging, and writing a
  second diary alongside a draft would orphan one of them. The `/learning`
  skill owns knowing when a session is worth recording at all.
- **B-8 Reflection does not overclaim.** Only an enriched diary counts: a
  diary whose sections still carry the draft's unfilled `TO BE ENRICHED`
  placeholders — a stub written with learning off, or one whose enrichment
  never ran — counts toward neither the three-diary threshold nor the
  readiness the scan and the reflection nudge report (D-042). Under three
  enriched diaries the scan reports not-ready rather than generalizing from
  noise. Findings are split into
  **patterns** (three or more diaries agree) and **observations** (one or two,
  labelled as such), every finding cites the diaries it came from, and
  processed diaries are marked so the same ground is not re-mined.

### Privacy
- **B-9 Local, legible, scoped.** All state stays on the user's machine:
  arcforge has no telemetry and no service of its own to report to. Two
  paths carry content to a model, both under the opt-in (B-1), and nothing
  else does. Diary enrichment runs the host tool over a parsed summary of the
  session — so that summary reaches the model the way any turn of the session
  does, and nowhere else. The curator's analysis sends a batch of sanitized
  observations to the host tool with no tools at all, so the run can read what
  it was handed and return a proposal, and can touch nothing on the machine;
  the manifest it writes records the tool access the run actually had (D-023).
  Enrichment no longer runs with permissions switched off: it gets two tools, `Read` and `Write`,
  and it starts in the draft's own directory — also added explicitly to the
  ones it may work in — rather than inheriting the project it was spawned
  from. What it no longer carries is the blanket bypass of every check, or the
  user's project as its working directory. Residual: it is not a sandbox, and
  the spec does not claim one. Edits inside the draft's directory are
  auto-approved rather than prompted, because a detached run has nobody to
  answer a prompt, and that directory also holds the same day's other diaries,
  so a prompt-injected draft can rewrite them. What keeps the run out of
  everything else is the host tool's own permission check on a run nobody can
  answer, not an operating-system boundary — the child runs as the user. The
  working directory is verified against a stub of the host CLI, not a live
  run. State
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
- **B-18 A project is its directory's name.** Observations, instincts,
  candidates and the project-root record are all keyed on the sanitized
  basename of the project directory — the name `--project` matches and each
  card prints. Residual: two project directories with the same name share one
  observation store, one instincts tree and one candidate set, and nothing in
  the product tells them apart, `learn --project` included; the learning guide
  states the collision where it explains scope. Separating them is a keyspace
  redesign that migrates every user's learning data, not a filter (D-037).

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

The observer daemon finds a project's root through one record per project,
`~/.arcforge/learning/project-roots/<project>.json`, shaped
`{ project, project_root }`. Its single owner is `scripts/lib/learning.js`:
SessionStart and the observation hook both write it through that owner, the
daemon's enablement check reads it, and a malformed record is rejected rather
than guessed at. `<project>` is the same sanitized directory basename as the
rest of the keyspace, so the record shares the collision D-037 records: two
same-named projects share one record.

One daemon runs per machine, held by `~/.arcforge/instincts/.observer.lock`; it
stops itself after 30 idle minutes or 2 hours. The lock records the directory
of the daemon script that took it, and starting the daemon replaces a live one
started from a different directory — after a plugin upgrade, the previous
version's — instead of leaving that version's behavior running until it stops
on its own. A lock written before the lock recorded its script counts as
different. Nothing is signaled unless the lock's PID is a process running the
daemon script: a daemon that died without removing its lock leaves a PID the
system can reuse, and a lock whose PID belongs to any other process is stale —
it is reclaimed, and that process is left alone, by start and stop alike.
Residual: a daemon that does not exit within about 2 s of being
stopped — one waiting on a curator model call — is left running, and the next
start tries again; and two installed copies of the plugin used in alternation
replace each other at each session start.

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
- **D-018** — 6.1.1 carries the learning repairs that undo a choice the user
  already made: repeated decay, the daemon after an opt-out, the dashboard's
  refused activation, and `learn enable` erasing config (B-1, B-3, B-4).
- **D-022** — decay is idempotent and never archives an activated instinct
  (B-4, B-6).
- **D-023** — the curator is a second outbound path — tool-less,
  under the opt-in, and named in B-9 (B-1, B-9).
- **D-020** — 6.2.0 carries the new instinct commands and every change that
  moves learning state on disk (B-12, B-16).
- **D-035** — a candidate name Layer 7 cannot use is rejected at ingestion
  (B-5, B-14).
- **D-036** — `approved` may be dismissed and `materialized` may be
  materialized again (B-3, B-5, B-15).
- **D-037** — the keyspace stays the project directory's basename, collision
  recorded as a Residual (B-5, B-9, B-18).
- **D-038** — manually saved instincts are not activatable, and the product
  says so (B-3, B-4, B-13).
- **D-040** — `learn instinct restore` brings back a decay-archived instinct,
  audited (B-5, B-11).
- **D-041** — rejections rotate to an archive, never deleted (B-5, B-17).
- **D-042** — reflection counts only enriched diaries (B-8).
