# AGENTS.md — maintaining `product/`

This folder runs the product **spec-driven**: the specs ARE the living documentation
the product is maintained from. This guide says how to keep them — and the roadmap
and the decision history — current. The rule that matters most: **lightweight means
less ceremony and a readable format, NOT less substance.** A spec here is plain
markdown instead of a PRD → XML → DAG → tasks pipeline, but it stays complete enough
to maintain and extend the area from.

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

## Boundaries with the rest of the repo

- **Engineering conventions** live in `.claude/rules/` and are out of scope here.
  Product decisions (what the toolkit does, for whom, in what order) live here.
- **Frozen contracts** (`docs/decisions/`) are the mechanical authorities specs may
  cite, never restate.
- **Release mechanics** are the `releasing` skill's job; the *Ship a version*
  playbook below only records what product state flips at that moment.

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
6. **A norm worth writing is worth checking.** Everything below that *can* be
   mechanically enforced is, by `npm run check:product`
   (`scripts/check-product.js`). Prose-only conventions are labelled as such, so
   nobody mistakes a habit for a gate.

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
- **Out of scope:** explicit non-goals and deferrals, so they are not silently dropped.

## Behavior
The substantive contract — numbered (`B-1`, `B-2`, …) so a change is traceable and a
test or eval scenario can cite it. This is the part the product is maintained from.

## Data / domain model
The key types, on-disk formats, enums, and invariants this area owns — the structural
contract. Name the format's owner in `scripts/lib/` rather than restating the schema
where a frozen contract in `docs/decisions/` already holds it.

## Decisions
The `D-id`s in the ROADMAP Decision Log that pin this area's choices.
```

Make it as long as the area needs and no longer: a one-screen area gets a one-screen
spec. Don't pad it into ceremony; don't amputate it into a stub. An area with no
interesting domain model says so in one line rather than deleting the section.

## Status vocabulary

- `next` — chosen as the upcoming version; not yet being built.
- `building` — implementation in progress.
- `shipped` — merged and tagged; the `Tag` column holds its `vX.Y.Z` (C7).

A non-shipped row shows `—` in `Tag` (C7). Exactly one row carries
`← we are here` (C1) — the check counts markers; *which* row deserves one is a
judgment it does not make.

## The three mechanical rules

These three are pinned in exactly this form because `npm run check:product` reads
them, as it reads the `Tag` and marker rules above (C7, C1). Change a rule here and
the check changes with it, in the same commit.

**1. Row status → spec header (C4).** A roadmap row's Status maps to the `Status:`
header of every spec it links:

| Row status | Spec header |
|---|---|
| `next` | `draft` |
| `building` | `building vX.Y.Z` |
| `shipped` | `shipped vX.Y.Z` |

**2. The governing row (C4).** A spec must be linked from at least one roadmap row,
and every spec a row links must exist. Where more than one row links a spec, its
**governing row** is the highest-version one:

- A `shipped` governing row collapses the header to `shipped v<that version>` — the
  earlier rows are history, and the roadmap already carries it.
- An unshipped governing row over an already-shipped spec takes the **compound
  form**, naming the last shipped version and the one extending it:
  `shipped v6.0.0 · extended by 6.1.0 (building)`.
- With no shipped row at all, the header is just rule 1 applied to the governing row.

**3. The two supersession forms (C3).** A reversal is two edits — the new entry and
one flipped line on the old one — and which flip depends on how much died:

| New entry carries | Old entry's `Status:` becomes | Meaning |
|---|---|---|
| `Supersedes: D-NNN` | `Superseded-by: D-MMM` | the whole decision is replaced |
| `Supersedes: D-NNN (clause 2)` | `Accepted · partially superseded by D-MMM` | only that clause died; the rest still governs |

C3 reads the flipped entry's whole `Status:` as `·`-separated clauses drawn from a
closed vocabulary — `Accepted`, `Proposed`, `Superseded-by: D-NNN`, `partially
superseded by D-NNN` — not as a string that merely contains the flip somewhere. A
totally superseded entry stops being `Accepted`; a partially superseded one keeps
exactly one live clause, because the rest of it still governs. That is what lets one
entry carry two clause-scoped flips from different decisions, or a partial flip
alongside the later total one that finished it off — and what rejects the
self-contradicting `Accepted · Superseded-by: D-MMM`.

The two forms are exclusive *per pair*, though: one decision either replaces another
whole or reverses one of its clauses, never both, so `Superseded-by: D-MMM · partially
superseded by D-MMM` is rejected however many `Supersedes:` lines D-MMM carries. What
the cross-decision cases above allow, the same-decision case does not.

C3 checks that pairing from both ends. A `Supersedes:` with no flip on its target is
rejected, and so is a flip with nothing behind it — a `Superseded-by:` or `partially
superseded by` clause whose named entry carries no `Supersedes:` back, or that names a
`D-id` the log does not have. Both are the same half-done reversal seen from opposite
sides, and only one of them is the edit people remember to make.

A bullet whose label is one of the three relations but whose form misses the canonical
one — a space before the colon, a lowercase label, a `*` bullet — is reported as
malformed rather than skipped, because `Supersedes :` and `Supersedes:` render
identically and a dropped line is a reversal that quietly left the checked history. A
label spelled differently enough (`Superseds:`) is not recognized at all, so the
canonical spelling is the one that gets checked.

`Refines:` and `Extends:` never require a flip — they sharpen or widen a decision
that stays in force. Use them instead of a supersede when nothing is being reversed.

All three relations point backwards: the named decision must already be in the log,
so its `D-id` is lower than the entry naming it. The log is append-only — an entry
cannot reverse or refine a choice that was not recorded yet, nor relate to itself —
and `check:product` (C3) rejects both. Folding a superseded entry into the
`<details>` index is unaffected: the rule compares `D-id`s, not positions.

## Conventions

Fields beyond the base template, and where they are enforced. Everything marked
*prose* is a habit this repo keeps, not a gate — don't assume CI will catch it.

| Form | Where | What it means | Enforced by |
|---|---|---|---|
| `Symptom:` | decision entry | the observable failure that forced the decision — what a reader would have *seen*, not the abstraction | prose |
| `Verification:` | decision entry | how the decision was proven to have landed: the command, test, or eval that fails if it regresses | prose |
| `Residual:` | decision entry | what the decision knowingly leaves unsolved, so the next reader doesn't file it as a bug | prose |
| `Cost accepted:` | decision entry | the price paid, stated up front — a decision that admits its cost survives review; one that hides it gets re-litigated | prose |
| `Refines:` / `Extends:` | decision entry | narrows or widens an earlier decision without reversing it; the named decision must exist and be earlier, and the relation itself adds no flip to it | `check:product` (C3) |
| `Supersedes: D-NNN (clause N)` | decision entry | clause-scoped reversal — only that clause dies | `check:product` (C3) |
| `Status: Proposed` | decision entry | the choice is recorded but still open; it must resolve to `Accepted` or be superseded before its version ships | prose |
| graduation tombstone | `BACKLOG.md` | a promoted wish leaves one struck-through line naming the version and `D-id` that took it, so a reader can tell "picked up" from "quietly dropped" | prose |
| `Tracks:` | spec header | optional line naming the code the spec tracks (`scripts/lib/…`, `hooks/…`), so a reader lands in the right file | prose |

## Playbooks

### Capture a wish
Drop a one-line idea into `BACKLOG.md` under the fitting theme group at any time — a
slug + one line (+ an optional `· needs:` dependency note). It is a wish, not a spec:
no estimate, no commitment. Low friction is the point.

### Promote a backlog item
1. Replace its line in `BACKLOG.md` with a graduation tombstone:
   `- ~~**<slug>**~~ — graduated into <X.Y.Z> (D-NNN).`
2. Record a Decision Log entry (next `D-id`) — *which version, why now*.
3. Add the roadmap row: next free `X.Y.Z`, `Status: next`, `Tag: —`, a one-line
   "what & why", and a link to its spec. Move `← we are here` onto it.
4. Write `specs/<slug>.md` from the template **before building**.

### Record a decision
Append to the Decision Log with the next free `D-NNN` (zero-padded, monotonic,
never renumbered):
```markdown
### D-NNN — <title>
- Date: YYYY-MM-DD
- Version: <X.Y.Z, or "process">
- Status: Accepted          (use "Proposed" while the choice is still open)
- Decision: <the choice, one committed sentence>
- Why: <the rationale — enough that a future reader understands the tradeoff>
```
Add any of the optional fields from *Conventions* that carry real information, then
cite the `D-NNN` from the relevant spec's **Decisions** section. The citation carries
the same zero-padded `D-NNN` shape as the entry, and a spec may only cite a `D-id`
the log actually carries (C5).

### Change a decision — the supersede move
Requirements change; that is normal. **Never delete or rewrite the old entry.**
1. **Append** a new entry with the next free `D-id` and a `Supersedes:` line in one
   of the two forms above.
2. **Flip one line** on the old entry, per the form used. Leave its `Decision` and
   `Why` exactly as written.
3. Optionally move the superseded entry, verbatim, into a folded `<details>` index at
   the bottom of the log — `check:product` ignores the fold when checking order.

The log then reads top-to-bottom as *chose X → changed to Y → because Z*, original
rationale intact. A pivot is two small edits, not a rewrite.

### Build a milestone (`building`)
Implementing a spec is ordinary disciplined development — this system bookends it, it
does not add ceremony.
1. Flip the row to `Status: building` **and** the spec header to `building vX.Y.Z`
   (or the compound form, per mechanical rule 2). One edit, both halves; C4 in
   `npm run check:product` proves you did both (the `Tag` stays `—` either way).
2. Branch from `main`. Build the spec's **Behavior** items test-first — a failing
   test per `B-id` → make it pass → refactor. Keep the 5 runners and the 6 static
   checks green.
3. **Keep the spec in sync as you build.** If reality diverges from a `B-` item,
   update the spec in the same PR and record the *why* as a decision. The merged
   spec must match the merged code — that is "Docs Are the Contract" in
   `.claude/rules/architecture.md`, not an aspiration.
4. Add each mid-build decision's `D-id` to the spec's **Decisions**.
5. Open a PR and review the code against the spec: every Behavior item present,
   nothing out-of-scope crept in.
6. On merge, run *Ship a version*.

### Ship a version
Run the `releasing` skill — it owns the mechanics and the ordering. Product-side, one
commit flips all four things at once: the roadmap row to `shipped`, the `Tag` column
to `vX.Y.Z`, every spec header the row governs, and the `← we are here` marker onto
whatever is next. `npm run check:product` is green before the flip and green after —
what it catches is a *half-done* flip, which is the failure mode that actually
happens. Three of the four edits are gated: the row's Status, its `Tag` cell, and
every spec header the row governs all have to agree. The fourth is not — C1 counts
markers, it does not know which row deserves one, so a marker that should have moved
and didn't passes green. Re-read that one yourself.

## Few-shot — a decision and its later reversal

```markdown
### D-007 — Image storage
- Date: <date-1>
- Version: 6.2.0
- Status: Superseded-by: D-011
- Decision: Store uploaded images in <service-X>.
- Why: cheapest tier at the expected volume; one fewer vendor to run.

### D-011 — Move image storage off <service-X>
- Date: <date-2>
- Version: 6.3.0
- Supersedes: D-007
- Status: Accepted
- Decision: Store uploaded images in <service-Y>.
- Why: <service-X> egress exceeded budget once albums grew; <service-Y> consolidates
  onto the platform already deployed to.
- Cost accepted: one migration of the existing objects, and a week where both
  buckets are readable.
```

Placeholders stand in for whatever the real choices are — the **shape** is what
matters: the original entry keeps its text and gains one `Superseded-by:` line; the
new entry carries `Supersedes:` and the reason for the change. Had only part of D-007
died, the new entry would read `Supersedes: D-007 (clause 2)` and D-007's status would
become `Accepted · partially superseded by D-011`.
