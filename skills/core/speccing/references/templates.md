# Templates — the four files

Open when bootstrapping product state (step 1) or writing a new spec (step 3).
Copy the shape, not the example content. Every placeholder in angle brackets is
yours to fill.

## Where they live

| File | What it holds |
|---|---|
| `product/ROADMAP.md` | The version table and the append-only decision log |
| `product/BACKLOG.md` | Un-scheduled wishes, one line each |
| `product/specs/<slug>.md` | One living spec per feature area |
| A short maintenance guide beside them | How the other three are kept |

One area, one spec. Split a spec when two halves change on different schedules,
not when it gets long.

## `ROADMAP.md`

```markdown
# Roadmap — <product>

The index and the history. The table is the big picture and links to each
area's living spec; the Decision Log records every decision and every reversal.

## Roadmap

| Version | Tag | Milestone | Status | What & why | Spec |
|---|---|---|---|---|---|
| <X.Y.Z> | `v<X.Y.Z>` | <name> | **shipped** | <one line: what shipped and why> | [<slug>](specs/<slug>.md) |
| <X.Y+1.Z> | — | <name> | **next ← we are here** | <one line> | [<slug>](specs/<slug>.md) |

> Un-scheduled ideas live in the Backlog; a wish graduates into a version
> (row + spec + decision entry) when it is picked.

## Decision Log

Append-only. Never renumber an id; never edit a recorded Decision or Why. To
reverse one, append a superseding entry.

### D-001 — <title>
- Date: <YYYY-MM-DD>
- Version: <X.Y.Z, or "process">
- Status: Accepted
- Decision: <the choice, one committed sentence>
- Why: <the tradeoff, in enough detail that a future reader understands it>
```

Status is one of `next`, `building`, `shipped`. Exactly one row carries
`← we are here`; a row that has not shipped shows `—` for its tag.

## `BACKLOG.md`

```markdown
# Backlog — <product>

The wishing pool: candidates not yet committed to a version. A line here is a
wish, not a spec.

## <theme>

- **<slug>** — <one line describing the wish> · needs: <dependency, optional>.
```

Group by theme so the pool stays scannable. A wish carries no estimate, no
owner, and no version — the moment it gets one it is being promoted, which is
step 3 of the skill.

## `specs/<slug>.md`

```markdown
# <slug> — spec

> Status: <shipped vX.Y.Z | building vX.Y.Z | draft> · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of
> any change in the ROADMAP Decision Log.

## Purpose
What this area is, and the user-visible outcome it delivers.

## Scope
- **In scope:** what this area owns.
- **Out of scope:** explicit non-goals and deferrals, so they are not silently
  dropped and silently re-proposed.

## Behavior
The substantive contract — the rules and the edge cases that matter. Numbered
`B-1`, `B-2`, … so a change is traceable and a test can cite the item it covers.
This is the part the product is maintained from.

## Data / domain model
The key types, values, and invariants — what the area is *about*, structurally.
Omit only when the area genuinely has no state of its own.

## Decisions
The decision-log ids that pin this area's choices, each with the one-line reason
it is cited here.
```

The three statuses in that header line are the ones a spec written from this
template moves through. The fourth is the extension case — an already-shipped spec
that a newly promoted version extends — and it is the compound form in
`references/conventions.md`, set on the existing file rather than on a fresh one.

Make the spec as long as the area needs and no longer. A two-screen feature gets
a two-screen spec; padding it into ceremony and amputating it into a stub fail
the same test — can someone extend this area from the spec alone?

## The maintenance guide

The fourth file is short and says only what a newcomer cannot infer: which files
exist, the status vocabulary, and the playbooks for capturing a wish, promoting
one, building with the spec in sync, recording and reversing a decision, and
shipping. Those playbooks are steps 2–6 of this skill — write them in the
project's own words rather than copying a toolkit's.
