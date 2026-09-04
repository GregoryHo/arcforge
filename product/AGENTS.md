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

A roadmap row carries exactly six cells, and a literal pipe inside a cell is
written `\|` — the only form the table has for one. A row that resolves to any
other number of cells is rejected rather than read from shifted columns.

Those rows sit under a table (C6): the `## Roadmap` section opens on a six-column
header row starting with `Version`, and a delimiter row of the same width sits
directly beneath it. Both are what GFM needs to render a table at all — drop the
delimiter, or narrow it to fewer columns than the header, and every row below
reaches a reader as a paragraph of literal pipes while the checks above would go
on reading it as product state. A wrong-width delimiter is reported as a row of
the wrong arity, not skipped for looking like dashes.

"Directly beneath" is literal, and so is "sit under": GFM ends a table at the
first blank line or block-level structure, so the header, its delimiter and every
row are one table only while they occupy consecutive lines. A blank line, a
paragraph or a fenced block anywhere in that run is reported (C6). Between the
header and the delimiter it costs the whole section — GitHub renders it as one
paragraph of literal pipes; below the delimiter it renders an empty table with
the rows as a paragraph beneath it. Either way the rows are not in a table, which
is the only thing this rule is about.

"Opens on" is literal at both ends of the frame. The header row either opens the
section or carries a blank line directly above it, and anything else sitting
directly above it is reported (C6) — a blockquote or a list item there takes the
pipe lines into itself, so GitHub renders no table at all and every row reaches a
reader as literal text; a plain paragraph directly above still renders one, and is
reported the same way. And the table is the section's first table, so a pipe line
above the header is reported even when the table below it would render. That is
deliberate rather than incidental — a data row written above the frame renders as a
paragraph while the checks would still read it as product state, which is the whole
defect this rule exists to close. Prose above the table belongs above `## Roadmap`,
and the section's note goes below it, where the corpus already puts it.

The run has a tail as well as a head, and it is measured rather than inferred from
the pipes: the rows run from the header down to the first blank line, and every line
in that run must be written as a `|`-delimited six-column row (C6). GFM asks no outer
pipe of a row, so `2.0.0 | v9.9.9 | … |` renders inside the table exactly as a
framed row does, and a pipe-free prose line renders as a one-cell row — while the
checks read only lines opening with `|`, so a marker, a `Tag` or a spec link sitting
on one of them would pass unseen. Such a line is reported rather than read: six
`|`-delimited cells is what a row is, and the fix holds that rather than widening it.
Anything else in the run is reported the same way, whether or not it renders as a row
— a fence or a four-space-indented line there does end the table for a reader and is
reported all the same. So the section's note carries a blank line above it, which is
what ends the run.

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

C3 reads the flipped entry's whole `Status:` as `·`-separated clauses drawn from a
closed vocabulary — `Accepted`, `Proposed`, `Superseded-by: D-NNN`, `partially
superseded by D-NNN` — not as a string that merely contains the flip somewhere. A
totally superseded entry stops being `Accepted`; a partially superseded one keeps
exactly one live clause, because the rest of it still governs. That is what lets one
entry carry two clause-scoped flips from different decisions, or a partial flip
alongside the later total one that finished it off — and what rejects the
self-contradicting `Accepted · Superseded-by: D-MMM`.

An entry carries exactly one `- Status:` line, written in column 1 and counted
wherever it still renders as a bullet — one to three spaces in is no hiding place —
and C3 counts them from both sides: a second one is reported as malformed, and so is
a missing one — an entry with no `Status:` records nothing about whether it still
governs, and leaves a later reversal no line to flip. A line with nothing after the
colon is counted as a line and reported for what it is: it counts toward the second
one, and when it is the only one it gets its own message naming the line rather than
the missing-line message, because the line is there and the value is not. The flip
in step 2 of *Change a decision* **replaces** the existing line rather than being
appended below it — two `Status:` lines are the same contradiction spelled with a
newline instead of a `·`.

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

Fenced code blocks are exempt from all of that: their contents are not read as part
of the log, so an entry may show a worked example — a wrong form, or a whole
illustrative `### D-NNN` — the way the few-shot below does, without the example
being checked as if it were real.

Three rules decide where a block starts and ends. Three or more backticks or tildes
open one, info string and all — ` ```markdown `, as the few-shots here are written —
*unless* the marker is a backtick and the info string carries a backtick of its own,
which opens nothing. Only a line of the same marker, at least as long as the opening
run and carrying nothing but whitespace after it, closes one. And a fence line
indented four spaces or more is no delimiter at all: at that depth it is content,
which is the next exemption.

Three consequences worth knowing before writing an example: a fence line with text
after its backticks closes nothing; an example that itself shows a fenced block needs
a longer outer fence — four backticks around three — or the inner one ends the outer
block and the illustration below it is read as product state; and a prose line that
opens with three backticks and then quotes a `code span` is not a fence, so it opens
no block and hides nothing below it.

Indentation is the second exemption, and a narrower one. A `### D-NNN` heading, a
relation bullet, an entry's `- Status:` line, a spec's `> Status:` header, a roadmap
row and the `<details>` opener of the folded index all sit in column 1; indented four
spaces or more, none is read, so an illustration can be shown as an indented block
rather than a fenced one — including an illustration of the fold move itself, which at
that depth opens no fold and closes none. Both fold delimiters take that four-space
bound, but not the same position on the line: `<details>` has to be the line's first
content, while `</details>` ends the fold wherever on a rendering line it lands — its
own opener's line included, so `<details></details>` opens and closes in place, and a
line ending `that is all </details>` closes the fold above it. That is the shape the
comment rule already takes for `-->`, and it is why an illustration of the closing tag
needs a fence, four spaces, or a code span. One to three spaces is not an exemption —
the line still renders as the heading, the field or the row a reader would trust, so
it is read or reported like any other near-miss. The roadmap row is why this matters
beyond the log: an indented six-cell row read as product state can become a spec's
governing row and force its `Status:` header to a version that exists only in the
illustration.

HTML comments are the third exemption, and the bluntest of the three. A fence and an
indented block still show their contents as literal text; a `<!-- ... -->` block shows
nothing at all, so nothing inside one is product state. A commented `### D-NNN` is not
an entry, a commented roadmap row is not a row, a commented `> Status:` header is not a
header, and a commented `##` heading opens no section and closes none — each is read as
if it were absent. That is the rule; what bounds it is below — which comments
`check:product` sees at all, and the edges where invisible and absent part company.

A comment **opens** on a line beginning `<!--`, at three leading spaces at most, the
same bound the lines above take; at four it is an indented code block and opens
nothing. It **closes** on the first line that *contains* `-->`, wherever on that line
it lands and including the opening line itself, so a one-line `<!-- note -->` opens and
closes in place. Blank lines do not close it, and that is why this exemption had to be
written: a well-formed six-column table wrapped in a comment still carried the blank
line above its header that C6's framing asks for, and passed as a table on nobody's
screen while C1, C4 and C7 read its row. An unterminated `<!--` hides the rest of its
scope the way an unclosed fence does, which for the log means C6's floor reports it as
empty.

Both ends are read from column 1 rather than from inside a block container, so
`check:product` sees a comment only where its opener is the line's first content: any
container prefix ahead of it — a `>`, a list marker, or their nestings — hides the
block from the reader and opens nothing here. Two rules then read what nobody can see.
A spec's `> Status:` header is itself a blockquote line, so a preamble whose three
lines read `> <!--`, `> Status: …`, `> -->` renders as an empty blockquote carrying no
header while C4 reads the hidden line and passes the spec; and a `D-NNN` hidden the
same way inside a spec's `## Decisions` is still scanned as text, so C5 reports a
citation off a line on nobody's screen. A probe that matches a *shape* leaks nothing,
because the prefix defeats it too — a `> |` row and a `> ### D-NNN` heading match
nothing at all, so they read as absent, which is what they look like. Write a comment
at the margin; never wrap one in a container.

Three edges are worth knowing before hiding anything this way. The first is where
invisible and absent part company: the roadmap's rows run from the header to the first
blank line, and GFM ends a table at an HTML block, so a `<!--` opening inside that run
really does move the table's end — C6's framing clause reports the line the way it
reports any other non-row line there, where an absent row reports nothing. Put the
comment below the blank line that closes the table, where the section's note already
sits. The second: the exemption is the comment's alone, not raw HTML's — `<details>`
renders its contents, and the folded index at the bottom of the log is read as live
product state, so fold an entry, don't comment it. The third: it is the block form's
alone — an inline `<!-- note -->` sitting after text on a line leaves that line
rendering, so the line is read whole, comment and all.

All three exemptions apply inside a scope. The Decision Log is the `## Decision
Log` section of `ROADMAP.md`, and `check:product` reads entries only there — a
`### D-NNN` heading in an intro, an appendix, or any other section of the file is
prose or illustration, not an entry, and is not checked as one. Rename or drop the
section and the log reads as empty, which C6's sanity floor rejects.

The scope's own boundaries honour the fence and comment exemptions: a `##` line inside
a fenced block or a comment opens no section and closes none, so a worked example may
show a whole `## Decision Log` — the way the few-shots here do — without standing in
for the log or cutting it short at the entry above it, and a commented-out
`## Appendix` ends nothing. Indentation is not an exemption at this boundary either, at
either end, but the two ends are read at different bounds because they fail in opposite
directions. The heading that **opens** the scope is read at column 1, and an indented
`## Decision Log` therefore leaves the log empty and C6 rejects it, the same way a
renamed one does — fail-closed. The heading that **closes** it is read at one to three
spaces, the same bound a `### D-NNN` heading and a spec's preamble boundary take,
because a heading a reader can see has to end the section: read at column 1, an
indented `## Appendix` left the log running into it, and the appendix's
decision-shaped headings became entries that C2 numbered and a spec's citation
resolved — the fail-open direction the paragraph above forbids. Four spaces or more is
an indented code block at either end, and closes nothing. The `## Decisions` section a
spec's citations live in (C5) is scoped the same way, but without that backstop: no
rule asserts a spec's headings, so a spec whose section is renamed, dropped, or
swallowed by an unclosed fence or an unterminated comment cites nothing and is checked
for nothing. Keep the heading as the template writes it.

The exemptions are not the log's alone. Every section `check:product` reads is parsed
the same way, so a fenced block is an illustration wherever it sits and a comment is
invisible wherever it sits: a `|` row inside either in `## Roadmap` is not a roadmap
row — it adds no second `← we are here`, and it does not stand in for a table that is
not there (C1, C4, C6, C7) — and a `D-NNN` inside either in a spec's `## Decisions` is
an example citation or none at all, not one C5 resolves.

A spec's `Status:` header has a scope of its own: it is read in the preamble above
the spec's first `##` heading, and it honours the exemptions there, so a fenced copy of
the template is an illustration and a commented one is nothing at all — both leave the
header C4 reports as missing. Keep the header where the template puts it,
directly under the H1 — a `> Status:` line below the first `##` is prose, and C4
reports the header as missing.

A spec carries exactly one such header, and C4 counts them the way C3 counts an
entry's `Status:` lines, at the same indent bound: a `> Status:` line one to three
spaces in still renders as a blockquote, so it counts, and so does a `> Status:` with
nothing after the colon. A second one in the preamble is reported rather than losing
silently to the one above it — two headers are the same contradiction the log's two
`- Status:` lines are, spelled in a different scope, and read first-wins the verdict
over one visibly two-state spec was decided by which line was typed first. An empty
header needs no message of its own the way an empty `- Status:` line does: as the
spec's only header it is compared against its governing row like any other value, and
reported as the state it is not.
The header flips in *Build a milestone* and *Ship a version* **replace** that one
line; neither adds a second below it.

That first `##` ends the preamble even when it carries one to three leading spaces —
the same bound a `### D-NNN` heading is read at, and the same one that ends a section
above. Every boundary a heading *ends* takes it, for the same reason: an indented
`## Purpose` read at column 1 would leave the preamble running past it, so a body
blockquote further down could stand in for a header the spec does not have. Of the
boundaries, only the heading that *opens* a scope is read at column 1, where an
indented one empties the scope instead — and C6 catches that for `ROADMAP.md`'s two
sections, though not for a spec's `## Decisions`, which is the exception named above.
Four spaces or more is an indented code block, and an illustrative `##` there does not
end the preamble.

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
