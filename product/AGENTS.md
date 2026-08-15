# AGENTS.md — maintaining `product/`

This folder runs the product **spec-driven**: the specs ARE the living documentation
the product is maintained from. This guide says how to keep them — and the roadmap
and the decision history — current. The rule that matters most: **lightweight means
less ceremony and a readable format, NOT less substance.**

## What lives here

- **`specs/<slug>.md`** — one living spec per feature area, always kept in sync with
  the shipped behavior. This is the documentation the product is maintained from —
  *not* the tests (tests verify behavior; they don't document intent), and *not*
  `docs/guide/` (guides teach a user how to use it; specs record what it must do and
  why).
- **`ROADMAP.md`** — the index + history: a roadmap table (version × status × tag ×
  spec link) and an append-only **Decision Log** (every product decision and
  reversal, with the *why*).
- **`BACKLOG.md`** — the wishing pool: un-scheduled candidate ideas, one line each,
  that graduate into a version when picked.
- **`AGENTS.md`** — this guide.

Nothing here is "frozen." A shipped feature keeps its spec as living documentation —
read and update it whenever you touch that area.

**Migration state:** `specs/` starts empty. The candidate areas are the skill system
(router + 15 skills), the CLI engine, the hook layer, the learning system, the eval
harness, the obsidian pair, and worktrees/loop. Write an area's spec the next time
that area changes — spec first, then build — rather than backfilling all of them in
one sitting.

## Boundaries with the rest of the repo

- **Engineering conventions** live in `.claude/rules/` and are out of scope here.
  Product decisions (what the toolkit does, for whom, in what order) live here.
- **Frozen contracts** (`docs/decisions/`) are the mechanical authorities specs may
  cite, never restate.
- **Release mechanics** are the `releasing` skill's job; the *Ship* playbook below
  only records what product state flips at that moment.

## Core principles

1. **Spec-driven.** Change the product → change its spec in the same PR. The spec
   describes the *current* product, not the original plan.
2. **Lightweight ≠ thin.** Cut ceremony, not content. A spec must stay substantive
   enough to onboard from and extend from.
3. **Big picture first.** `ROADMAP.md` answers "where are we, what's next" at a
   glance and links to each spec.
4. **Append, never overwrite (history).** A recorded decision's text is immutable;
   change direction by *adding* a decision that supersedes the old one.
5. **Semver is the spine.** Each milestone is a semver version; shipped → an
   annotated `vX.Y.Z` tag, with the version string synced across the locations
   `npm run check:versions` enforces.

## The spec template — `specs/<slug>.md`

```markdown
# <slug> — spec

> Status: <shipped vX.Y.Z | building vX.Y.Z | draft> · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose
What this area is and the user-visible outcome it delivers.

## Scope
- **In scope:** what this area owns.
- **Out of scope:** explicit non-goals and deferrals.

## Behavior
The substantive contract — numbered (`B-1`, `B-2`, …) so a change is traceable and a
test or eval scenario can cite it.

## Decisions
The `D-id`s in the ROADMAP Decision Log that pin this area's choices.
```

Make it as long as the area needs and no longer.

## Status vocabulary

- `next` — chosen as the upcoming version; carries the `← we are here` marker.
- `building` — implementation in progress.
- `shipped` — merged and tagged; the `Tag` column holds its `vX.Y.Z`.

Exactly one row carries `← we are here`.

## Playbooks

### Capture a wish
Drop a one-line idea into `BACKLOG.md` at any time — a slug + one line (+ an
optional `· needs:` dependency note). No estimate, no commitment.

### Promote a backlog item
1. Remove its line from `BACKLOG.md`.
2. Record a Decision Log entry (next `D-id`) — *which version, why now*.
3. Add the roadmap row and write `specs/<slug>.md` **before building**.

### Record a decision
Append to the Decision Log with the next free `D-NNN` (zero-padded, monotonic,
never renumbered):
```markdown
### D-NNN — <title>
- Date: YYYY-MM-DD
- Version: <X.Y.Z, or "process">
- Status: Accepted
- Decision: <the choice, one committed sentence>
- Why: <the rationale — enough that a future reader understands the tradeoff>
```

### Change a decision — the supersede move
Never delete or rewrite the old entry. Append a new one with `Supersedes: D-NNN`,
and flip exactly one line on the old entry: `Status: Superseded-by: D-MMM`. The log
then reads top-to-bottom as *chose X → changed to Y → because Z*.

### Ship a version
Run the `releasing` skill (it owns the mechanics). Product-side, on the tag:
flip the roadmap row to `shipped`, fill the `Tag` column, set the spec's `Status:`
header, and move `← we are here`.
