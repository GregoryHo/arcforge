---
name: speccing
description: Spec-driven product state a project is maintained from. Use when the user asks to start that state, or when product/ holds living specs and a decision log and one of these applies — a wish to capture, code about to change, a decision reversed, a version picked up or shipped.
argument-hint: "[milestone, wish, or spec slug]"
---

# Speccing

Some repositories keep their product intent in files: a living spec per area, a
versioned roadmap, an append-only decision log, and a backlog of wishes. Those
files are the product's memory. This skill is how you work without corrupting
it.

## The law

```
THE SPEC AND THE CODE MERGE IN THE SAME PR
A RECORDED DECISION IS NEVER EDITED
```

A spec that lags the code is worse than no spec: the next reader trusts it and
builds on a promise the code stopped keeping. A decision log you edit records
what you currently believe rather than what you chose and why — which is the one
thing it existed to preserve.

## When this does not apply

- The repo keeps no product state and the user did not ask for any. Do not
  create it because it would be tidy — see step 1.
- The design is still open. Settle *what* to build with `/brainstorming`; this
  skill records what was settled.
- The change has no product footprint: a typo, a refactor with identical
  behavior, a dependency bump.

## 1. Bootstrap only when asked

Starting the ledger is a commitment the user makes. Offer once when the fit is
obvious, then wait for a yes.

Once asked, four files: `product/ROADMAP.md` (the version table and the decision
log), `product/BACKLOG.md` (the wishes), `product/specs/<slug>.md` (one per
area), and a short guide saying how the other three are maintained. Shapes for
all four: `references/templates.md`.

## 2. Capture a wish

An idea nobody has committed to is one line in the backlog — a slug, a sentence,
and an optional dependency note. No estimate, no spec, no roadmap row. Friction
here has to stay near zero, or the good ideas go into a chat window instead.

## 3. Promote before building

Promotion is three edits — two, absent a wish — made **before** any code:

1. If it started as a wish, replace its backlog line with a graduation tombstone
   naming where it went (`references/conventions.md`). Work the user asked for
   directly never had a line, and skips this edit alone.
2. Append a decision recording *which version, and why now*.
3. Add the roadmap row and its spec — written from the template for a new area,
   or this version's behaviors added to the area's existing living spec, never a
   second file. An existing spec's header takes the compound form in
   `references/conventions.md` from this edit on, not from the build. The new row
   takes `← we are here` only when every row above it has shipped; a `building`
   row, or an earlier `next` row, keeps it.

The spec goes first because it is what the build gets reviewed against. Written
afterwards it describes whatever got built — a summary, not a contract, and it
agrees with the code no matter what the code does.

## 4. Build with the spec in sync

Starting the build is one edit with two halves: the roadmap row flips `next` →
`building`, and the spec header flips to `building vX.Y.Z` — or to the compound
form in `references/conventions.md` when an earlier version already shipped this
spec. The tag cell stays `—` until the version ships. A row still reading
`next` while implementation merges is a ledger claiming work has not started.

Work the spec's numbered behaviors (`B-1`, `B-2`, …) one at a time;
implementation code goes through `/tdd`. Reality will diverge from some behavior
item, and the divergence is resolved in the same PR:

| What happened | What lands in the same PR |
|---|---|
| A behavior turned out wrong or impossible | Its `B-n` is rewritten, plus a decision saying why |
| A behavior was added along the way | A new `B-n`, plus a decision saying why it was added now |
| Scope was cut | The item moves to out-of-scope, or back to the backlog as a wish, plus a decision saying why it was cut |

Each of those decisions is appended as a `D-NNN`; the spec's **Decisions**
section carries that id and the one-line reason it is cited — a `B-n` never
stands alone there.

"I'll update the spec after it merges" is how a spec dies. The PR is the only
moment a reviewer can see both halves at once.

## 5. Supersede, never overwrite

Reversing a recorded decision is **two edits, and neither is a rewrite**:

1. **Append** a new entry with the next free id, carrying `Supersedes: D-NNN`
   and the reason the direction changed.
2. **Flip one line** on the old entry: `Status: Accepted` becomes
   `Status: Superseded-by: D-MMM`. Its `Decision:` and `Why:` stay byte for byte
   as written.

Ids are never renumbered and never reused, not even for an entry that turned out
wrong. The log then reads top to bottom as *chose X → changed to Y → because Z*;
deleting the X removes the only evidence of what the tradeoff was.

A worked example, the form for reversing one clause rather than a whole entry,
and the entries that refine rather than reverse: `references/conventions.md`.

## 6. Ship

On the merge that releases a version: flip its roadmap row to shipped, fill the
tag cell, reset each affected spec's status header from the **highest row that
links it**, following that row's own status — `shipped v<its version>` once it
has shipped, the compound form in `references/conventions.md` while it has not —
and move the `← we are here` marker onto the next row, or leave it on the row
that just shipped when nothing has been promoted after it yet. Exactly one row
carries the marker, before and after; shipping never invents the row it would
move to.

## Handing off

| Situation | Next |
|---|---|
| The design is not settled yet | `/brainstorming` — this skill records the outcome |
| The version needs a task list | `/executing` |
| A behavior item is about to become code | `/tdd` |
| The PR is ready, spec included | `/code-review` |

## Rationalizations

| What you are about to say | What is actually true |
|---|---|
| "I'll write the spec once it works" | Then it documents what happened and can never disagree with the code. |
| "The old decision was just wrong" | It was made for reasons. Supersede it and the reasons stay readable. |
| "Renumbering keeps the log tidy" | Every id cited from a spec or a PR now points somewhere else. |
| "This one is too small to record" | Then the next person reverses it for free, having never seen it. |
| "The spec is out of date anyway" | An argument for fixing it in this PR, not for skipping it again. |
| "There is no product folder here, I'll start one" | Starting the ledger is the user's call. Offer; do not create. |
| "The code is the real documentation" | Code says what. It has never said why, or what was rejected. |
| "I'll record the decision after this merges" | Nobody reviews a log. Unmerged with the change, it is never written. |

## Red flags

Stop if you catch yourself:

- Editing the `Decision:` or `Why:` of an entry that is already recorded.
- Deleting a decision entry, or reusing an id that was freed.
- Writing implementation code for a version that has no spec and no roadmap row.
- Leaving zero or two `← we are here` markers behind.
- Creating product state in a repo whose user never asked for it.
- Merging a change to behavior with its spec untouched.

## References

- `references/templates.md` — the shapes of the four files, and the spec
  template to write a new one from (steps 1 and 3).
- `references/conventions.md` — decision-entry fields, the two supersede forms,
  backlog graduation, and how a spec header tracks its version (steps 3–6).
