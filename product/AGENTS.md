# AGENTS.md — maintaining `product/`

This folder runs the product **spec-driven**: the specs ARE the living documentation
the product is maintained from. This guide says how to keep them — and the roadmap
and the decision history — current. The rule that matters most: **lightweight means
less ceremony and a readable format, NOT less substance.** A spec here is plain
markdown, complete enough to maintain and extend the area from.

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
2. **Big picture first.** `ROADMAP.md` answers "where are we, what's next" at a
   glance and links to each spec.
3. **Append, never overwrite (history).** A recorded decision's text is immutable;
   change direction by *adding* a decision that supersedes the old one.
4. **Semver is the spine.** Each milestone is a semver version; shipped → an
   annotated `vX.Y.Z` tag, with the version string synced across the locations
   `npm run check:versions` enforces.
5. **A norm worth writing is worth checking.** Everything below that *can* be
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

A roadmap row carries exactly six cells, and a literal pipe inside a cell is
written `\|` — the only form the table has for one. A row that resolves to any
other number of cells is rejected rather than read from shifted columns.

Those rows sit under a table (C6): the `## Roadmap` section opens on a six-column
header row starting with `Version`, with a delimiter row of the same width directly
beneath it, and the rows run from the header down to the first blank line. The frame
is checked at both ends. At the head, the header row either opens the section or has
a blank line directly above it — a blockquote, a list item, a paragraph or a closing
fence sitting directly above it is reported, whether or not the table below it still
renders, and so is a pipe line above the header. Inside the run, every line must be a
`|`-delimited six-cell row: a blank line, a paragraph, a fenced block or any other
non-row line *anywhere* in the run of pipe rows is reported, not only between the
header and its delimiter, and so are a wrong-width delimiter and a four-space-indented
line (a row at one to three spaces is read as a row, not reported).
Each of those either stops the table rendering while the checks go on reading rows,
or hides a row from the checks while it still renders. Prose above the table belongs
above `## Roadmap`; the section's note goes below the blank line that ends the run.

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

**2. The governing row (C4).** Every roadmap row links at least one spec, every spec
a row links must exist, and every spec must be linked from at least one row. A patch
row is not exempt: a patch changes an area that already has a spec, and the row links
that spec — the point of the rule is that no version is ever built without one. The
`Spec` cell links by carrying a whole inline link, `[text](specs/<slug>.md)`: a
destination with no opening bracket, an opening bracket escaped as `\[`, or a link
wrapped whole in a code span renders as literal text and links nothing, so the row is
reported as linking no spec. An image, `![text](specs/<slug>.md)`, renders as written
but embeds the spec rather than navigating to it, and is reported the same way. A link
whose *label* is code-styled is still a link.
Where more than one row links a spec, its **governing row** is the highest-version
one:

- A `shipped` governing row collapses the header to `shipped v<that version>` — the
  earlier rows are history, and the roadmap already carries it.
- An unshipped governing row over an already-shipped spec takes the **compound
  form**, naming the last shipped version and the one extending it, with that row's
  own status in the parentheses: `shipped v6.0.0 · extended by 6.1.0 (building)`,
  or `… (next)` while the extending row has not started.
- With no shipped row at all, the header is just rule 1 applied to the governing row.

Each version occupies **exactly one row** (C4), which is what makes "the
highest-version one" name a row. A version listed twice — a shipped row and a
`building` one for the same `X.Y.Z`, say — leaves the governing row decided by
which is typed first, so the same pair of rows would accept both
`shipped v1.0.0` and `shipped v1.0.0 · extended by 1.0.0 (building)`. Record an
extension as the next version, never as a second row for the one that shipped.

**3. The two supersession forms (C3).** A reversal is two edits — the new entry and
one flipped line on the old one — and which flip depends on how much died:

| New entry carries | Old entry's `Status:` becomes | Meaning |
|---|---|---|
| `Supersedes: D-NNN` | `Superseded-by: D-MMM` | the whole decision is replaced |
| `Supersedes: D-NNN (clause 2)` | `Accepted · partially superseded by D-MMM` | only that clause died; the rest still governs |

C3 reads the flipped entry's whole `Status:` as `·`-separated clauses from a closed
vocabulary — `Accepted`, `Proposed`, `Superseded-by: D-NNN`, `partially superseded by
D-NNN`. A totally superseded entry stops being `Accepted`; a partially superseded one
keeps exactly one live clause. That is what lets one entry carry two clause-scoped
flips from different decisions, or a partial flip beside the later total one that
finished it off — and what rejects the self-contradicting `Accepted · Superseded-by:
D-MMM`. An entry carries exactly one `- Status:` line — the flip in *Change a
decision* **replaces** it — and a second, missing, or empty one is reported. The two
forms are exclusive per pair (`Superseded-by: D-MMM · partially superseded by D-MMM`
is rejected), and the pairing is checked from both ends: a `Supersedes:` with no flip
on its target, and a flip whose named entry carries no `Supersedes:` back or does not
exist, are the same half-done reversal. A relation bullet in a non-canonical form
(`Supersedes :`, a lowercase label, a `*` bullet) is reported as malformed; a
misspelled label is not recognized at all.

`Refines:` and `Extends:` never require a flip — they sharpen or widen a decision that
stays in force. All three relations point backwards: the named `D-id` is lower than the
entry naming it, and an entry never relates to itself (C3). Folding a superseded entry
into the `<details>` index is unaffected — the rule compares `D-id`s, not positions.

## How `check:product` reads these files

- **Scope.** Decision entries are `### D-NNN` headings inside the `## Decision Log`
  section of `ROADMAP.md` and nowhere else; roadmap rows are the six-cell lines under
  the `## Roadmap` header and delimiter, down to the first blank line; a spec's
  `> Status:` header is read in the preamble above its first `##`, directly under the
  H1, and the spec carries exactly one — the header flips in *Build a milestone* and
  *Ship a version* **replace** that line, never add a second; a spec's citations (C5)
  are read inside its `## Decisions` section. An emptied scope fails in one of two
  directions: rename, indent or drop `## Decision Log` or `## Roadmap`, or let an
  unclosed fence or an unterminated `<!--` swallow the rest of one, and C6 reports the
  section empty (fail-closed); do the same to a spec's `## Decisions` and the spec
  cites nothing and is checked for nothing (silent, fail-open) — keep the heading as
  the template writes it.
- **Indent bounds.** Only the `##` that *opens* a scope is read at column 1; indented,
  it opens nothing and the scope is empty. Everything else — `### D-NNN`, `- Status:`,
  `> Status:`, roadmap rows, relation bullets, the `<details>` opener, the `<!--`
  opener, and the `##` that closes a scope or ends a preamble — is read at zero to
  three leading spaces: a line a reader still sees as a heading, a field or a row is
  read or reported, never skipped. Four spaces or more is an indented code block for
  every line in that list — none of them is read there, and nothing there opens or
  closes a scope or a fold, or opens a comment; `-->` is the one exception, closing a
  comment on any line that contains it, at any indent. Separately from indent, `<details>` and `<!--` must be the line's *first
  content*: behind a `>`, a list marker or any nesting of them, neither opens
  anything.
- **Illustration, not state.** Fenced blocks and block-form HTML comments are not
  read anywhere `check:product` looks. Four-space indentation exempts only the
  structural lines listed above. A `D-NNN` citation in a spec's `## Decisions` is
  still scanned at any indent (C5), so an illustration of a citation needs a fence or
  a comment rather than indentation. The roadmap run admits no illustration in any
  form: C6's head and tail clauses read raw lines at any indent, and its adjacency
  clause reads the gap a hidden line leaves, so a fenced, commented or
  four-space-indented line inside the run is reported alike. An illustrative row goes
  below the blank line that ends the run, where a fence, a comment or four spaces
  each keep it from being collected as a pipe row — a bare pipe line at zero to three
  spaces there is still collected and reported as breaking the table. A fence is
  three or more backticks or tildes at zero to three spaces — a backtick run whose
  info string carries a backtick opens nothing, and a fence line indented four or
  more spaces is content, not a delimiter. It closes only on a same-marker run at
  least as long with nothing but whitespace after it: a closing fence with trailing
  text closes nothing, and the unclosed block swallows the rest of its scope. An
  example that itself shows a fence needs a longer outer fence. A comment closes on
  the first line containing `-->`, its own opener's line included, and blank lines do
  not close it. An inline `<!-- note -->` after text leaves the line read whole.
- **Folds.** `<details>` is not an exemption — the folded index's contents are live
  product state; fold an entry, don't comment it out. Its opener takes the bounds
  above, but `</details>` closes the fold wherever on a rendering line it lands, its
  own opener's line included: `<details></details>` opens and closes in place, and a
  line ending `that is all </details>` closes the fold above it. A code-span-wrapped
  `` `</details>` `` does not close one, so an illustration of the closing tag needs
  a fence, four spaces, or a code span.
- **Comments and containers.** A comment is seen only when `<!--` is the line's first
  content; behind a `>` or a list marker it hides the block from the reader while C4
  and C5 still scan the text, so a header or a citation inside it passes unseen. A
  `<!--` inside the roadmap run ends the table and is reported by C6. Write comments
  at the margin, below the blank line that closes the table.
- **Near-misses are reported, not skipped.** Two or zero `Status:` lines, an empty
  one, a wrong-arity row, a non-row line anywhere in the table run, a fence or comment
  opening inside it, a non-blank line directly above the header, a second `> Status:`
  header, a malformed relation label.

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
   "what & why", and a link to its spec. Move `← we are here` onto it only when
   every row above it has shipped; a `building` row, or an earlier `next` row,
   keeps it.
4. Write the spec **before building** — `specs/<slug>.md` from the template for a
   new area, or this version's behaviors added to the area's existing living spec,
   never a second file for one area. An existing spec's header follows rule 2 from
   the moment the new row links it: the compound form `shipped vX.Y.Z · extended
   by <this version> (next)` once a lower row has shipped, and plain `draft` while
   none has.

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
The `### D-NNN` heading starts in column 1. An indented one still renders as a
heading, so `check:product` reports it (C2) rather than leaving the entry silently
out of the log.

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
1. Flip the row to `Status: building`, then re-read the spec header off the
   **highest row linking that spec**, per mechanical rule 2. When the row that
   just started is that highest row, the header becomes `building vX.Y.Z` — or
   the compound form. When a later row is, the header does not move: promotion,
   or that later row's own ship, already wrote what it says. C4 in
   `npm run check:product` reads the header against the governing row either
   way, so the no-op passes and a half-done flip does not (the `Tag` stays `—`
   throughout).
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
to `vX.Y.Z`, every spec header the row governs, and the `← we are here` marker, which
sits on the earliest row that has not shipped and on the last row when every row has
— so it stays put when this version shipped ahead of an earlier unshipped row.
`npm run check:product` is green before the flip and green after —
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
matters: the original entry keeps its `Decision:` and `Why:` text and has the value of
its one `Status:` line replaced — `Accepted` becomes `Superseded-by: D-011`, never a
second `Status:` line beside it; the new entry carries `Supersedes:` and the reason for
the change. Had only part of D-007 died, the new entry would read
`Supersedes: D-007 (clause 2)` and D-007's status would become
`Accepted · partially superseded by D-011`.
