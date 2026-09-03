# learning — spec

> Status: shipped v6.0.0 · [ROADMAP](../ROADMAP.md)
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
  bookkeeping: the durable session record, and the diary an active enough
  session produces, are continuity features that run either way
  ([hooks](hooks.md) B-6). Enabling is an explicit, scoped act (`--project` or
  `--global`), and status is always inspectable.
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
- **B-5 Transitions go through the engine, and are audited.** Curator-proposed
  candidates live in one canonical queue and the dashboard is their surface: it
  offers only the transitions legal from a candidate's current state, and every
  action — accepted or rejected — lands in an audit log with its reason. The
  CLI's candidate commands are a second, project-scoped path over the project's
  own queue, not a front-end onto the canonical one; a global transition is
  refused rather than written behind the curator's back. Hand-editing state
  files is the one path with no checks and no record; the product treats it as
  out of contract. The on-disk formats are append-only or atomically
  overwritten, owned by the engine per the curator schema (cited above).
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
  of the session does, and nowhere else. State follows its scope: home-global
  state under
  `~/.arcforge/`, project-scoped state under the project's own
  `.arcforge/learning/`, and materialized artifacts in the project tree itself,
  as drafts the user reviews and commits. Commands print the absolute path
  of anything they write. Candidate-transition commands are project-scope
  only — a global flip of behavior-changing state is refused by the engine.

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
`scripts/lib/learning-schemas.js`. The second, project-scoped CLI queue of B-5
carries its own narrower vocabularies in `scripts/lib/learning.js` —
`VALID_SCOPES`, and a `VALID_STATUSES` whose first state is `pending`, not
`pending_review`; that divergence is why it is not a front end onto the canonical
queue.

The invariants: state is only ever advanced through the engine (B-5), scope decides
location (B-9), and one session yields one diary (B-7).

## Decisions

The conservative trust design — default-off, three gates, bounded injection,
audit trail — predates this log; its rationale is inline above. The mechanical
data contracts live in `docs/decisions/learning-curator-schema/`.
