# sdd — spec

> Status: building v6.1.0 · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose

arcforge maintains its own product intent spec-driven: living specs, a semver
roadmap, an append-only decision log, and a backlog of wishes, all under
`product/`. That method has been the toolkit's private practice since 6.0.0 and
shipped to nobody. This area is the method itself, packaged as the user-facing
`speccing` skill so any project can run the same way — the specs that document a
product stay merged with the code they describe, and the reasoning behind a
choice survives the reversal of that choice.

The user-visible outcome: an agent that keeps a project's product ledger honest
without being told to, and that never invents one for a project that does not
want it.

## Scope

- **In scope:** the `speccing` skill and its two references; the four product
  artifacts the method defines and the relationships between them; the rules for
  recording, refining, and superseding decisions; the invocation contract (when
  the skill applies and when it must stay out of the way); the eval evidence
  behind the behavioral claims.
- **Out of scope:** arcforge's own `product/AGENTS.md` and the conventions it
  pins for contributors — those govern this repo, not the shipped skill; release
  mechanics (the `releasing` skill owns the version bump and the tag); any
  engine surface for product state (see B-8); the mechanical skill schema, which
  is frozen in [`docs/decisions/skill-schema.md`](../../docs/decisions/skill-schema.md).

## Behavior

- **B-1 Four artifacts, one method.** The method is defined over exactly four
  files: a per-area living spec, a roadmap table carrying the version × status ×
  tag × spec-link row, an append-only decision log inside that roadmap, and a
  backlog of un-scheduled wishes. The skill teaches all four and carries their
  shapes in its own `references/templates.md` — a user gets the method from the
  skill alone, with no pointer into arcforge's repository.
- **B-2 The spec is the documentation.** A spec records what an area must do and
  why, not what was originally planned and not how to use the product. Tests
  verify behavior without documenting intent; guides teach usage without
  recording the contract. Numbered behavior items (`B-n`) exist so a change is
  traceable and a test or eval can cite the item it covers.
- **B-3 The spec and the code merge together.** A change to what the product does
  ships with its spec change in the same PR. The skill states this as a law rather
  than a preference, because the failure it prevents — a spec that describes a
  product that no longer exists — is silent until someone builds on it.
- **B-4 The decision log is append-only, with two supersede forms.** A recorded
  `Decision:` / `Why:` is never edited and an id is never renumbered or reused.
  Reversal is an appended entry carrying `Supersedes: D-NNN` plus one flipped
  status line on the old entry. A reversal scoped to one clause of a multi-part
  entry uses `Supersedes: D-NNN (clause n)` and leaves the entry partially
  superseded. `Refines:` and `Extends:` relate entries without retiring them and
  never flip a status.
- **B-5 Semver is the spine, and exactly one row is marked.** Each milestone is a
  semver version whose row carries a status of `next`, `building`, or `shipped`;
  exactly one row carries the `← we are here` marker before and after any edit.
  Shipping flips the row, fills the tag cell, sets each affected spec's status
  header, and settles the marker — it sits on the earliest row that has not
  shipped, and on the last row when every row has, so it stays put when this
  version shipped ahead of an earlier unshipped row. The four are one act, not
  four chores; shipping never invents the row it would move to. Promotion follows
  the same invariant — a new row takes the marker only when every row above it
  has shipped; a `building` row, or an earlier `next` row, keeps it.
- **B-6 The skill never bootstraps unasked.** In a repo with no product state and
  no user request for any, `speccing` does not apply. Creating the four files is
  offered once and started only on a yes. Product state is a maintenance
  commitment; an agent cannot accept it on the user's behalf.
- **B-7 It composes with the disciplines, it does not replace them.**
  `brainstorming` settles what to build and `speccing` records what was settled;
  a milestone's task list is `executing`'s; a behavior item becoming code goes
  through `tdd`; the merged pair of spec and code is reviewed by `code-review`.
  The skill hands off to those four and to nothing else.
- **B-8 No engine surface at 6.1.0.** The method ships as skill prose only: no
  CLI group, no schema file, no linter, no state under `.arcforge/`. The four
  artifacts are plain markdown a human edits and reads, and every mechanical
  check over them belongs to the project that adopts the method, not to arcforge.
- **B-9 A spec cites the decisions in force, and says why each governs.** The
  link from a spec to the log is maintained in both directions: a decision
  recorded at promotion or mid-build is filed into the affected spec's
  **Decisions** section with the one-line reason it is cited, and a supersession swaps the retired id there
  for the one now governing. The clause-scoped form is the exception — the old
  entry still governs its other clauses, so the spec gains the new id and keeps
  the old citation. A spec left pinned to a retired id goes on promising the
  choice that was reversed, which is the failure B-3 forbids in the other
  direction.

## Data / domain model

| Entity | Identity | Lifecycle |
|---|---|---|
| Wish | backlog slug | captured → promoted (leaving a tombstone) or dropped |
| Milestone | semver version | `next` → `building` → `shipped` (+ tag) |
| Spec | area slug | `draft` → `building vX.Y.Z` → `shipped vX.Y.Z`, then living |
| Decision | `D-NNN`, zero-padded, monotonic | `Accepted` → `Superseded-by:` / partially superseded |

The invariants: ids are dense, ascending, and never reused; every `Supersedes:`
has its matching flip; a spec's status header agrees with its governing roadmap
row and its citations name the decisions still in force (B-9); exactly one
roadmap row carries the marker.

## Decisions

- **D-014** — the method ships as a user-facing skill at 6.1.0, rather than
  staying an internal practice.
- **D-015** — `speccing` is model-invoked, and never bootstraps product state
  unasked (B-6).
- **D-016** — no arcforge product CLI group at 6.1.0; the method is prose (B-8).

See the [ROADMAP Decision Log](../ROADMAP.md#decision-log).
