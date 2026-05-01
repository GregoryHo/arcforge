# Optional Automatic Learning

Design / implementation plan for ArcForge's session-learning pipeline.
This document records the product contract and implemented MVP lifecycle
for optional learning.

## Product Contract

Learning remains optional to enable, automatic once enabled, and conservative at the point of behavior change.

Learning is **optional, but automatic once enabled.**

- **Optional**: a fresh ArcForge install does no learning. Users opt in
  per project (and, separately, globally) before any pattern extraction
  or skill materialization happens.
- **Automatic once enabled**: after opt-in, the user should not have to
  remember to run `/learn-from-session`, `/diary`, or any other command
  to feed the pipeline. Observation, candidate extraction, and queueing
  happen in the background. The only user-visible touchpoint is a
  lightweight authorization step before a candidate can produce drafts,
  plus explicit activation before those drafts become active behavior.

This rules out "learning only happens if the user remembers to invoke it"
(too easy to forget) and "learning happens silently by default" (too
intrusive, surprises users with new behavior).

## Pipeline Overview

```
observe daemon
   ↓
pattern analyzer
   ↓
candidate queue
   ↓
lightweight user authorization
   ↓
materializer
   ↓
read-only draft review
   ↓
explicit activation
   ↓
future skill routing (next session that matches the trigger)
```

Each stage is a small, testable component. Stages communicate through
files on disk (consistent with ArcForge's file-based-state architecture)
— no shared in-memory daemon state across stages.

### 1. Observe Daemon

Background observer that watches the user's sessions while learning is
enabled. This may be implemented as a long-lived daemon, a hook-driven
worker, or a hybrid, but it must behave like a daemon from the user's
perspective: once enabled, observation happens without manual commands.

Responsibilities:

- Capture turn-level signals: prompts, tool use, files touched, commands
  run, errors, fixes, user corrections, approvals, and repeated command
  sequences.
- Scrub secrets before persistence: tokens, API keys, credentials,
  authorization headers, passwords, and obvious `.env` values must not be
  written to learning storage.
- Emit normalized **observation records** to
  `.arcforge/learning/observations/{date}/{sessionId}.jsonl`.
- Rotate or expire raw observations so learning does not become an
  unbounded transcript archive.
- Avoid self-observation loops: analyzer/materializer sessions must not
  be fed back as ordinary user work.
- Fail open for coding: if learning breaks, normal ArcForge/Claude Code
  work continues and the user gets a concise notice.
- Stop emitting when the user disables learning, project- or globally.

The user **should not need to call `/learn-from-session`** — the daemon
covers what that command would have collected, automatically.

### 2. Pattern Analyzer

Reads observation records and looks for repeated structures: the same
sequence of tool calls across multiple sessions, recurring corrections,
recurring success paths, recurring failure modes.

- Runs on a debounced schedule (every N session ends, or daily,
  whichever comes first).
- Output: zero or more **candidates** written to the candidate queue.
- Each candidate carries provenance (which sessions it came from), a
  proposed name, a proposed scope (project vs global), and a confidence
  score.

### 3. Candidate Queue

A simple on-disk queue at
`.arcforge/learning/candidates/queue.jsonl` (project-scoped) and
`~/.arcforge/learning/candidates/queue.jsonl` (global-scoped).

- Append-only.
- Each entry: id, proposed skill name, scope, summary, evidence
  (session ids), status (`pending` | `approved` | `rejected` |
  `materialized` | `activated`).
- The queue is the durable interface between the analyzer and the
  authorization step. Nothing further happens to a candidate until the
  user reviews it.

### 4. Lightweight User Authorization

A small, low-friction review step. Implementation can be a
`/learn-review` skill or an inline prompt at session start when
candidates are pending — exact UX is open, but the requirements are:

- **Lightweight.** One-line yes/no per candidate, with the option to
  open detail.
- **Batched.** Show up to a small number of pending candidates at once;
  do not nag every turn.
- **Reversible.** A rejected candidate can be re-surfaced if new
  evidence appears later.

Approval flips `status` to `approved`. Rejection flips it to `rejected`
and suppresses future re-emission of the same candidate for a cooldown
window.

### 5. Materializer

Turns approved candidates into inactive project-skill draft files (and any supporting
artifacts: tests, references, hooks). Mirrors the methodology in
`arc-writing-skills`:

- RED: write a failing test capturing the pattern.
- GREEN: write the skill content.
- REFACTOR: tighten triggers, remove loopholes.

Output:

- Inactive project-skill draft at `skills/arc-<name>/SKILL.md.draft`.
- Inactive test draft at `tests/skills/test_skill_arc_<name>.py.draft`.
- Queue entry flipped to `materialized` with a reference to the draft
  files.

The MVP materializer is project-scope only. Global materialization fails
closed until global promotion has a safer product model.

### 6. Read-only Draft Review

Before activation, users can inspect materialized candidates without
opening queue JSONL or reading draft files manually:

```bash
arcforge learn inspect <candidate-id> --project|--global [--json]
arcforge learn drafts --project|--global [--json]
```

These commands are review affordances only. They do not mutate queue
state, write artifacts, rename files, or activate behavior. Review
output is allowlisted: it summarizes candidate metadata, safe evidence
fields, next actions, and project-scope artifact existence. It does not
embed draft file contents, raw observation payloads, unexpected candidate
fields, or stored path fields from the queue. Global review does not
probe project-local artifact paths.

### 7. Explicit Activation

Once the user has reviewed a materialized draft, activation is an
explicit behavior-change step:

```bash
arcforge learn activate <candidate-id> --project [--json]
```

Activation is the point where `.draft` files become active skill/test
files and normal skill discovery can route to them in a later matching
session. Activation must fail closed if the candidate is malformed, not
`materialized`, has scope mismatch, has unexpected draft paths, is missing
draft files, or would overwrite existing active files.

Global activation is not in MVP and fails closed.

## Scope Rules: Project-Level vs Global-Level

ArcForge supports two learning scopes:

- **Project-level** — patterns specific to one repo (e.g., a release
  flow, a deploy procedure, a test layout). Stored under
  `.arcforge/learning/` and `skills/` inside the project.
- **Global-level** — patterns that apply to the user across every
  project (e.g., a personal coding style, a recurring shell habit).
  Stored under `~/.arcforge/learning/` and the user-global skills
  directory.

Rules:

- **Default to project.** Every new candidate starts as project-level
  unless the analyzer has explicit signals that it generalizes.
- **Global requires explicit user intent and a future global promotion
  model.** The analyzer may *propose* global scope, but MVP
  materialization and activation are project-scope only and fail closed
  for global candidates.
- **Promotion candidate**: when the same pattern has been observed in
  **2+ projects**, the analyzer flags it as a promotion candidate from
  project to global. The user still authorizes the promotion — it is
  not automatic — but the analyzer surfaces it explicitly so the user
  doesn't have to spot the duplication themselves.

## Out of MVP

The following are explicitly **out of MVP / not in MVP** and should not
block the first shippable version:

- **Import/export** of learned skills between users or machines.
  Sharing, packaging, and re-importing learned skills is a future
  feature; the MVP only persists learned skills locally for the user
  who approved them.
- Automatic editing of *existing* skills based on new observations
  (the materializer only creates new skills in MVP).
- Cross-user pattern aggregation.
- A web UI for the candidate queue.

## Golden Path: Release Flow

The release flow is the **golden path** target for the learning
pipeline — the first concrete pattern we expect the system to surface
and materialize end-to-end. It exercises every stage and gives us a
realistic eval.

### Why release flow

Releases are repetitive, decision-dense, and currently captured by
hand-maintained skills. They are an ideal candidate for automatic
learning: the daemon can observe the steps, the analyzer can recognize
the recurring sequence, and the materializer can produce a skill that
replays it.

### Shape of the proposed artifact

The materialized artifact is an inactive **project skill draft** at
`skills/arc-releasing/SKILL.md.draft`, plus its draft quality-gate test.
Project skill, not global, because the exact release procedure is
project-specific (commands, version-bump files, changelog conventions all
differ). After explicit activation, the reviewed draft is promoted to the
active `skills/arc-releasing/SKILL.md` path.

The skill must support **natural language** invocation. Users say
"ship vX.Y.Z", "cut a release", "bump version", "ready to release",
"準備發版" — not a fixed command. The skill's `description` and trigger
section must enumerate enough natural-language phrasings that the
router fires reliably.

### Quality gate / tests

The materialized draft must include:

- A **quality gate** test asserting that the skill is invoked when the
  user uses any of the natural-language release phrasings.
- Tests covering the canonical pre-flight checks the release procedure
  requires (lint, full test suite, version-bump consistency,
  CHANGELOG entry, tag).
- A failing-first test (per ArcForge's Iron Law) before the skill body
  is written.

The quality gate is non-negotiable: a release-flow skill that triggers
unreliably or skips pre-flight checks is worse than no skill at all,
because it lulls the user into trusting an incomplete procedure.

### Walkthrough through the pipeline

1. **Observe** — daemon captures sessions where the user runs the
   release procedure manually: version bump, changelog edit, commit,
   tag, push, PR.
2. **Analyze** — after 2+ such sessions in this project, the analyzer
   emits a candidate `arc-releasing` (scope: project).
3. **Authorize** — user reviews the candidate, sees the proposed
   trigger phrasings and the pre-flight checklist, approves.
4. **Materialize** — pipeline writes
   `skills/arc-releasing/SKILL.md.draft` plus the quality-gate test
   draft; no active skill exists yet.
5. **Inspect** — user runs `arcforge learn inspect` or
   `arcforge learn drafts` to review safe summary, evidence, next action,
   and project-scope artifact existence.
6. **Activate** — after explicit user authorization,
   `arcforge learn activate` promotes the reviewed `.draft` artifacts to
   active files. On the next matching request such as "ship v2.2.0", the
   skill can fire and walk through the canonical release flow.

## PR Readiness / Lifecycle Checklist

- Product contract appears verbatim:
  `Learning remains optional to enable, automatic once enabled, and conservative at the point of behavior change.`
- Fresh installs and fresh projects keep learning disabled by default.
- Project and global enablement are separate.
- Observe/analyze may run automatically only after enablement.
- Candidate queue records preserve safe provenance/evidence and suppress
  duplicates.
- Approve/reject are explicit lifecycle transitions.
- Materialization writes inactive `.draft` artifacts only.
- `learn inspect` and `learn drafts` are read-only and review-safe.
- Activation is explicit and fails closed before any behavior change.
- Global materialize/activate remain unsupported in MVP.
- Import/export remains out of MVP.

## Open Questions

- Exact UX of the authorization step (skill vs inline prompt vs
  dedicated command) — to be decided once the queue format is stable.
- Cooldown duration for rejected candidates.
- Confidence threshold the analyzer should require before emitting a
  candidate at all (vs. emitting and letting the user reject).
- Storage retention policy for raw observation records — do they age
  out, and on what schedule?

These do not block the contract above; they are tuning decisions for
the implementation phase.
