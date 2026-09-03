# Conventions — decisions, supersession, graduation

Open when recording or reversing a decision (step 5), when a spec's status has
to move (steps 4 and 6), or when a wish leaves the backlog (step 3).

## Decision entry fields

Five fields are the floor. The rest are optional and earn their place by being
the thing a future reader would otherwise have to reconstruct.

| Field | When to use it |
|---|---|
| `Date:` `Version:` `Status:` `Decision:` `Why:` | Always — the five that make an entry readable on its own |
| `Symptom:` | The observed failure that forced the decision, in the terms it was observed in |
| `Verification:` | How anyone can check the decision actually took effect |
| `Cost accepted:` | The price paid on purpose, named so nobody relitigates it as a bug |
| `Residual:` | What the decision knowingly leaves unfixed |
| `Supersedes:` / `Refines:` / `Extends:` | The relationship to an earlier entry (below) |

Write `Decision:` as one committed sentence in the present tense. An entry whose
decision needs a paragraph is usually two decisions.

## Three ways an entry relates to an earlier one

| Line | Meaning | Does the old entry's status flip? |
|---|---|---|
| `Supersedes: D-NNN` | The old choice is reversed | Yes — `Status: Superseded-by: D-MMM` |
| `Refines: D-NNN` | Same choice, sharpened or bounded | No |
| `Extends: D-NNN` | The old choice now covers more ground | No |

Only supersession flips a status. Using `Supersedes:` where `Refines:` was meant
retires a decision that is still in force, and the next reader stops trusting
the log's status column — which is the only fast way to read it.

## The worked reversal

```markdown
### D-007 — Image storage
- Date: <date-1>
- Version: <X.Y.Z>
- Status: Superseded-by: D-011
- Decision: Store uploaded images in <service-X>.
- Why: cheapest tier at the expected volume; one fewer vendor to run.

### D-011 — Move image storage off <service-X>
- Date: <date-2>
- Version: <X.Y.Z>
- Supersedes: D-007
- Status: Accepted
- Decision: Store uploaded images in <service-Y>.
- Why: <service-X> egress exceeded budget once albums grew; <service-Y>
  consolidates onto the platform already deployed to.
```

Two edits in the log. D-007 keeps its text and gains one line; D-011 carries the
new choice and the reason it changed. Nothing was deleted, and the pair reads as
a story.

The spec that cited D-007 moves with them — its **Decisions** section swaps the
retired id for the one now in force:

```markdown
- **D-011** — image storage is <service-Y>.
```

## Reversing one clause, not a whole entry

An entry that made three choices rarely has all three go wrong. Scope the
supersession to the clause:

```markdown
- Supersedes: D-007 (clause 2)
```

The old entry's status then reads `Status: Accepted · partially superseded by
D-011`. The `Accepted` clause is what records that its other clauses still
govern; the clause marker stays on the new entry's `Supersedes:` line. Without
it you have quietly retired two decisions nobody re-made. A clause-scoped
reversal is the exception to that swap: the entry still governs its other
clauses, so the spec gains the new id and keeps the old citation.

## Backlog graduation leaves a tombstone

When a wish is promoted, its line does not vanish — it becomes one struck line
naming where it went:

```markdown
- ~~**<slug>**~~ — graduated into <X.Y.Z>, see [<slug>](specs/<slug>.md).
```

A wish that silently disappears gets re-wished six months later by someone who
searched the backlog and found nothing. The tombstone costs one line and answers
the search.

## A spec header tracks its version

The status header is the fastest question a spec answers: is this describing
what runs, or what is being built?

| Header | Means |
|---|---|
| `Status: draft` | Written ahead of any committed version |
| `Status: building vX.Y.Z` | The version in flight is implementing this spec |
| `Status: shipped vX.Y.Z` | Merged and tagged; this describes what runs |

A spec that a later version extends says both — `shipped vX.Y.Z · extended by
X.Y+1.Z (next)` from the promotion that adds the extending row, then
`shipped vX.Y.Z · extended by X.Y+1.Z (building)` once that row starts — so a
reader knows the shipped half is still true while the next half is not yet. The
parenthetical is the extending row's own status, which is why the header and its
roadmap row always agree; when they disagree, one of the two flips was forgotten
at ship time.

The header is read off the **highest** row linking the spec, never off whichever
version is being worked on, and it follows that row's own status: `shipped
v<its version>` once the highest linking row has shipped, the compound form
while it has not. So shipping collapses a header only when the version that
shipped is the highest row linking that spec; ship one while a later row still
links it and the header stays compound — its shipped half naming the highest row
that has already shipped, its extended-by half naming the highest linking row and
that row's own status: `shipped vX.Y.Z · extended by X.Y+1.Z (next)`. Shipping a
backport under a later version that already shipped does not move the shipped
half. Collapsing the header anyway retires a row that has not shipped.

Name the code the spec tracks in its own header block when the mapping is not
obvious from the slug. A spec nobody can connect to a directory gets updated by
nobody.
