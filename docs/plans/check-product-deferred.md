# Deferred from the `check:product` review rounds

Process record from the review of the product-method alignment PR — the round that
built `scripts/check-product.js` and its falsifiability suite. Seven things came out
of it that were deliberately **not** landed — five widenings and carry-forwards the
rounds argued down, plus two standing constraints on the linter's own code, two of
which have since been taken — and each would otherwise have survived only in a review
thread. They are written down here so the next person hardening the linter starts
from the constraints rather than rediscovering them.

Nothing here is a promise. `product/ROADMAP.md`'s D-006 is the entry that records
what `check:product` actually asserts, and its `Residual:` points at this file.

## 1. What C3 knowingly does not cover

All four were probe-confirmed green against the branch that introduced C3. Each is a
*widening* of the rule, not a bug in it — closing any of them changes what
`product/AGENTS.md` promises, so they belong to one decision rather than to whoever
next reads the code.

**The closed status vocabulary is victim-scoped.** `checkSupersededStatus` reads an
entry's whole `Status:` only when some other entry names it in a `Supersedes:` line,
so a decision nobody supersedes may carry `Status: banana` unremarked. The mirror
pass added later sharpens the asymmetry rather than closing it: a *well-formed*
unpaired flip is now rejected, while a *malformed* flip clause on a non-victim is
still ignored.

**A trailing separator is tolerated.** `statusClauses()` splits on `·` and drops
empties with `filter(Boolean)`, so `Accepted · partially superseded by D-002 ·`
passes.

**Clause identity is not tracked.** `parseDecisions()` reduces `(clause N)` to a
boolean, so two decisions may both assert `Supersedes: D-001 (clause 1)` and pass.
The hole is on the *superseding* side only — a victim carrying two
`partially superseded by` clauses is deliberately valid (`product/AGENTS.md`, and
the positive test in `tests/scripts/check-product.test.js` for one entry carrying
two clause-scoped flips from different decisions).

Two constraints on any rule that closes it:

- Key on `{target, clauseNumber}` with **bare** supersessions excluded from the key.
  Include them and the documented-legal "partially superseded entry that a later
  decision then killed outright" case (D-002 clause 1 + D-003 bare, same victim)
  turns red.
- It needs new convention prose first. Nothing in `product/` defines what numbers a
  decision's clauses, so there is currently no fact for the rule to check against.

**A `Refines:` / `Extends:` target's liveness is not tested.** `D-003` may refine a
`D-001` that reads `Status: Superseded-by: D-002`. This is deliberate as of the
review: every surface promises existence and backward direction only
(`product/AGENTS.md`, D-005's "exempt from any flip", D-006's "naming an earlier
decision that exists"), and both readings are now pinned by positive tests.

Two constraints on any rule that hardens it:

- It must be **order-sensitive**: reject only when the total flip's superseder
  carries a *lower* `D-id` than the refiner. A `Refines:` written while its target
  was live stays a correct record after a later decision kills the target, and the
  log is append-only (`product/AGENTS.md`), so it cannot be edited in hindsight.
- It must leave a **partial** flip and a `Proposed` target legal. A partially
  superseded entry still governs the rest of itself, which is exactly what a
  refinement would sharpen.

## 2. `hooks/session-tracker/end.js` — the carry-forward, for the learning-gates PR

Not this PR's to fix: the branch that gates session capture behind the learning
opt-in already rewrites the block, and the product-method PR is process-only.
Recorded here so the direction is not lost between the two.

`main()` reloads the existing session record, assigns the three transcript-derived
fields only when the diary threshold fired **and** a transcript actually parsed, and
otherwise clears `filesModified` alone. Stop fires once per turn and the diary
capture resets the counters on a hit, so the very next turn is below threshold by
construction: fresh counters end up beside the previous turn's `userMessageContent`
and `toolsUsed`, and `scripts/lib/session-utils.js` reads exactly those fields as
the fallback for the diary's "Tools Used" and "Conversation Trail" sections. The
record is internally inconsistent rather than newly leaky — the text was written
legitimately above the threshold — but a later render can label a previous turn's
prose as this turn's.

Gating only the `userMessageContent` *assignment* does not close it. Once the gates
PR promises that verbatim user text is absent from the session record with learning
off, a record written while learning was on keeps re-serializing that text on every
subsequent Stop. The direction, in `end.js` `main()` — the gate here stands in for
whichever opt-in helper that PR settles on (`isLearningEnabled` in
`scripts/lib/learning.js` today):

```js
if (learningGateOn) {
  session.userMessageContent = transcriptData.userMessages;
} else {
  delete session.userMessageContent;
}
```

plus `delete session.userMessageContent; delete session.toolsUsed;` in the
no-transcript branch alongside the existing `filesModified = []`, so the three
transcript-derived fields have one lifetime instead of three.

Two cases to add in `hooks/__tests__/session-tracker-end.test.js` — its existing
cases all start from *no* session file and therefore cannot see this:

- An above-threshold Stop followed by a below-threshold one with no counter reseed,
  asserting `userMessageContent` and `toolsUsed` are `undefined` after the second.
- An above-threshold Stop with learning enabled followed by one with learning
  disabled, asserting the field is gone rather than stale.

`product/specs/hooks.md`'s domain-model section describes today's behavior; whichever
PR lands the change owns that sentence and the decision entry that covers capture
depth — either its text says the three fields share one lifetime, or it carries a
`Residual:` recording that a pre-opt-out record keeps its prose. Delete this section
once that lands.

## 3. `docs/guide/eval-system.md` — the verdict table has no `PASS` row

Not this PR's to fix, and deliberately so. The PR rewrote `product/specs/eval.md`'s
verdict vocabulary — the spec now enumerates `PASS` as the A/B token a
`non-regression` scenario gets, and distinguishes it from the preflight `PASS` of
B-3. The guide's own "read the verdict" table predates that rewrite and still lists
only the four delta-CI tokens (`IMPROVED`, `REGRESSED`, `INCONCLUSIVE`,
`INSUFFICIENT_DATA`); the prose under it describes the non-regression policy without
naming the token it produces.

Both surfaces are now *accurate* — the prose was corrected in the same round the
spec was — so this is a completeness gap, not a mismatch. It stayed out because the
spec's `## Scope` delegates authoring practice to that guide, and widening a
user-facing table is a call about what the guide teaches rather than a correction the
review turned up.

The row, if someone lands it, goes after `INSUFFICIENT_DATA`:

```
| `PASS` | Every treatment trial that produced a score passed — the verdict a `non-regression` scenario gets instead of a delta |
```

The paragraph below the table then names `PASS` where it currently says "it passes",
so the table and the prose introduce the token together.

## 4. `scripts/lib/product-lint.js` sits one line under the size ceiling — **TAKEN in round 11**

`.claude/rules/coding-standards.md` puts the hard limit at 700 lines. The file ended
round 9 at **699**, and nothing counts lines in CI, so the next C-rule to land here
would breach the standard silently instead of failing a check. Round 9's three fixes put
+41 on it net (50 added, 9 removed); the rule code in them is a handful of lines each,
and what grows alongside it is the C1–C7 docblock — some 80 lines before any code
runs.

Round 11 is the rule that forced it: C4's duplicate-`Version` clause. The extraction
below landed first, as its own commit with the suite green across it, and
`product-lint.js` came out at 617 lines. The section stays as the record of what moved
and why; nothing here is left to do.

The extraction was mechanical, and no rule moved:

- **Out** — the markdown primitives that know nothing about product state:
  `FENCE_RE`, `section()`, `unfenced()` and `stripCodeSpans()`, with the fence and
  code-span comments that document them (~85 lines, `FENCE_RE` included — nothing
  else in the file matched a fence), into a sibling
  `scripts/lib/product-markdown.js`. All four are pure, and nothing outside
  `product-lint.js` called them.
- **Stayed** — the C1–C7 docblock, the parsers, every `check*` rule, `validateProduct`
  and `module.exports`, so `scripts/check-product.js` and
  `tests/scripts/check-product.test.js` import exactly what they imported before
  (617 lines: still past the 400-line soft limit, as most of `scripts/lib/` is, but with
  room for the rule that forced the split).
- **The suite was the proof.** `check-product.test.js` requires only `validateProduct`,
  so a green `npm run test:scripts` across the move showed the split changed no
  behaviour, and the C-rule docblock gained one paragraph naming where the primitives
  went — the only prose the move touched.

Not taken in round 9 on purpose: at 699 the standard was met, and a file split with no
rule forcing it is churn a reviewer then has to re-read against no behaviour change.
Round 11 had the rule.

**Round 13 bound the same ceiling a second time**, which is the evidence that this
section is a standing constraint rather than a one-off. C6's framing clause (§6) put
`product-lint.js` at **772** — over the hard limit, and still nothing counts lines in
CI. The cut this time is by *format* rather than by markdown-versus-product-state:
`scripts/lib/product-roadmap.js` takes the roadmap table's reader — `parseRoadmapRows`,
`rowCells`, `checkRoadmapFraming`, `roadmapSection` and the table's constants — so one
on-disk format has one owner, and the two rules about the table's own shape (C4's arity
check, C6's framing clause) travel with it. `product-lint.js` came out at 635 and keeps
every rule that reads the parsed state. The same proof applied: the suite requires only
`validateProduct`, so a green run across the move showed no behaviour changed.
`scripts/check-product.js` now imports `parseRoadmapRows` from the new module directly
rather than through a re-export, per the no-barrel rule in
`.claude/rules/coding-standards.md`.

**Round 19 bound it a third time**, and the third cut exhausts the formats. The rule
that forced it is round 18's fold-tag fix — `FOLD_OPEN_RE` ending where an HTML tag
name ends, so `<details-open>` no longer opens the fold. `FOLD_OPEN_RE` lives here, and
the fix put `product-lint.js` at **703** from 696, three lines over. Round 18's other
rule, C6's row-run clause, landed wholly in `product-roadmap.js` and left this file
untouched — worth naming, because the crossing looks like the larger rule's and is not.
Nothing counts lines in CI, so all six gate commands passed green over a file that
breached the standard. The cut follows round 13's axis exactly:
`scripts/lib/product-decisions.js` takes the Decision Log's reader — `parseDecisions`,
`checkDecisionNumbering`, `checkStatusPresence`, `statusClauses`,
`checkSupersededStatus`, `checkFlipsAreClaimed`, `checkRelations` and the log's
constants (the `### D-NNN` and relation forms, the `<details>` delimiters, the status
vocabulary, the two flip patterns and `DECISION_LOG_HEADING_RE`) — so the second of
`ROADMAP.md`'s two formats has one owner, and the rules about the log's own shape
(C2's numbering invariants, C3's relation and status coherence) travel with it.
`product-lint.js` came out at **400** and keeps C1, C4's row↔spec pairing, C5, C6's
sanity floor, C7 and `validateProduct`. `product-decisions.js` is 343 lines,
`product-roadmap.js` 312 and `product-markdown.js` 208. Same proof, same import rule:
the suite requires only `validateProduct`, so a green run across the move showed no
behaviour changed, and `scripts/check-product.js` now imports `parseDecisions` from the
new module directly — `product-lint.js` stopped re-exporting it rather than keeping a
barrel.

The standing constraint, stated once so the fourth crossing does not need re-deriving:
**nothing mechanically counts lines**, so this ceiling is invisible to every gate and
is caught only by a reviewer running `wc -l`. A size lint would close that, and is not
this round's to land — it needs a grandfathered-file allowlist for the engine files
`.claude/rules/coding-standards.md` already says exceed the limit, and that allowlist
is a maintainer call about which files stay exempt. The proposal is written up in the
review handoff for the controller.

## 5. `stripCodeSpans()` is escape-blind, and empties code-styled link text

C4 reads a `Spec` cell with its code spans removed, and a span is dropped whole —
contents included. `` [`alpha`](specs/alpha.md) `` reaches `SPEC_LINK_RE` as
`[](specs/alpha.md)`.

The emptying itself still costs nothing, and is pinned from both sides in
`tests/scripts/check-product.test.js` ("does not count a link wrapped in a code span
as a link", "still reads a link whose text is code-styled"): the pattern anchors on
`](specs/<slug>.md)` and never looks at the link text, so an emptied label is invisible
to it.

What the strip does cost is a *neighbour*, and §8's tightening made the cost real.
A span is dropped whole, so whatever preceded it lands against whatever followed it, and
`SPEC_LINK_RE` disqualifies a link's opening bracket on a character CommonMark never put
against it. Both characters its prefix rejects arrive that way.

The backslash needs the escape-blindness as well. A run of backticks opens a span here
wherever it appears, while CommonMark's `` \` `` opens none — so a cell writing an
escaped backtick has a span cut out of it that no renderer ever opened, and the text
either side is joined. `` A\`x`[alpha](specs/alpha.md) `` reaches `SPEC_LINK_RE` as
`A\[alpha](specs/alpha.md)`, where the stray backslash now sits against a real link's
opening bracket and the unescaped-bracket prefix reads it as escaping that bracket.

The `!` needs nothing but the drop, and arrived with round 14's image-form fix.
`` !`x`[alpha](specs/alpha.md) `` is a literal `!`, an ordinary code span and a real
link — every part of it rendering as written — and it reaches `SPEC_LINK_RE` as
`![alpha](specs/alpha.md)`, the image form that fix rejects.

Both make C4 report a row a reader can navigate from as linking no spec. Confirmed
against the shipped reader rather than reasoned, in both cases: the pattern before each
tightening matched the cell, the one after does not.

It is recorded rather than fixed on three grounds. It fails **closed** and loudly —
a wrong "links no spec" is a message someone reads, not the phantom governing row §8's
direction produces. No authoring form yields either: a `Spec` cell has no reason to
carry an escaped backtick, or a code span wedged between a `!` and a link. And the fix
is not in `SPEC_LINK_RE` at all — the pattern is right about the text it is handed, and
what would have to change is the handing: the strip would have to leave the join it
makes readable, by keeping a span's contents rather than dropping them, and read an
escape while it is at it. That is a change to what `stripCodeSpans()` means, owed to
whoever writes a rule that needs it, which is the same conclusion this section reached
in round 9.

The tightening this section warned about has, so far, only half arrived. The rule it
anticipated was one requiring **non-empty link text** — to reject `[](specs/alpha.md)`,
a link a reader cannot see — which would start rejecting the code-styled label, a
legitimate authoring form. That rule is still unwritten; §8 tightened the *bracket*
instead, which is why the pins above still hold and why neither fix below has come due.
Whoever tightens `SPEC_LINK_RE`'s link text owns one of them:

- keep the span's contents rather than dropping them — replacing with `$2` from
  `` /(`+)([^\n]*?)\1/g `` — which then needs its own answer for a *fully* spanned
  link, the case the current form gets right for free, and is the natural place to make
  the strip escape-aware while the file is open; or
- ban the code-styled label in `product/AGENTS.md` and say so in the C4 docblock,
  which makes the emptying intended rather than incidental — and leaves the
  escape-blindness above untouched, since it is a separate read.

No code was written for this in round 9, none when §8 exposed the neighbour, and none
when round 14 widened it: the emptying is still correct under today's rules, both
neighbours are fail-closed and unwritable, and changing what `stripCodeSpans()` means
with no rule asking for it trades a latent coupling for a live one.

## 6. The roadmap table's framing is not asserted — **TAKEN in round 13**

Every rule that reads the table — C1, C4, C6, C7 — reads a *row*: `parseRoadmapRows`
accepted any six-cell pipe line inside `## Roadmap` and nothing above it was
required. Three inputs therefore linted green:

- a `## Roadmap` holding only a data row, with no header row and no delimiter;
- a header row plus a data row, with no delimiter between them;
- a header row, a two-column delimiter, and a six-cell data row — `parseRoadmapRows`
  skipped an all-dash line unconditionally, and that `continue` ran *before* the
  arity check, so an off-arity delimiter was dropped rather than reported.

It stayed out for several rounds because GFM renders none of the three as a table. A
delimiter row is required, and one whose arity differs from the header's
un-recognizes the table, so each input reaches a reader as a paragraph of literal
pipes — loud corruption rather than the plausible-looking lie the linter exists to
catch. **That half of the reasoning stands and is why this waited; the other half was
wrong and is corrected here.** Round 11 called the rule an *eighth* one, needing a
decision refining D-006 — whose recorded text enumerates seven — and parked it beside
`check-product-spec-sections` as a backlog wish. But framing is not a widening of
what the linter promises: it is the unchecked precondition of one it already made.
C6's floor is stated over "the roadmap table", and the rows it counts are rows only
while a table frames them, so an unframed row already stood in for a table the same
way a fenced one did — the case C1's own docblock says it must not.

Landed in round 13 as a **clause of C6**, the way round 11's duplicate-`Version` rule
landed as a clause of C4, so the rule count stays at seven:
`checkRoadmapFraming()`, the framing paragraph in `product/AGENTS.md`'s roadmap-row
section, and four cases in `tests/scripts/check-product.test.js`. The rule pushed
`product-lint.js` past the 700-line hard limit, so the roadmap table's reader moved to
`scripts/lib/product-roadmap.js` in a follow-up commit with no behaviour change — §4
records that.

Both recorded constraints held. One was satisfied differently than written:

- It must assert a `Version` header row **and** a delimiter whose arity matches it. A
  bare "some header exists" check still passes the third input above. Taken as
  written: the frame is the section's first two pipe lines, read the way GFM reads
  one — a six-cell header opening on `Version`, then a delimiter of the same width
  directly beneath it.
- The unconditional all-dash `continue` must move *after* the arity check, so an
  off-arity delimiter is reported instead of skipped. Taken, and the third input is
  now reported twice over — once by C6 as a frame that renders no table, once by C4
  as a row of the wrong arity. The delimiter predicate widened from `-{2,}` to `-+`
  in the same change: `|-|-|` is a legal GFM delimiter, and a rule whose job is to
  reject has to accept every frame a renderer draws.

D-006's C6 clause caught up to the frame in `e40c862`; a further one-clause
amendment naming the adjacency below is in the review handoff for the controller to
apply, because `product/ROADMAP.md` is not a file this work owns.

**Round 15 — "the first two pipe lines" was a shorthand, and taking it literally was a
hole.** The rule collected the section's pipe lines and read the frame off *that*
list, so every non-pipe line between them was erased before the check ran. GFM ends a
table at the first blank line or block-level structure, so four more inputs linted
green while rendering as prose — verified through GitHub's own GFM endpoint rather
than argued from the spec:

- a blank line between the header and the delimiter, and the same with a paragraph or
  a fenced block in that gap: GitHub renders the entire section as one paragraph of
  literal pipes, and the linter reported nothing;
- a blank line between the delimiter and the rows: GitHub renders an empty table with
  the rows as a paragraph beneath it, while C1 still counted the detached row's
  `← we are here` and C4 still let it govern a spec.

It is the same defect as a missing delimiter, reached one line later, so it landed the
same way — a clause of C6, no new `D-id`, the rule count still seven. The fix is
positional: `unfencedEntries()` in `scripts/lib/product-markdown.js` hands each
surviving line its index in the section slice (a fenced line is dropped rather than
renumbered, so a fenced block reads as the break it is), `checkRoadmapFraming()`
asserts the collected pipe lines sit at consecutive indices before it judges their
shape, `product/AGENTS.md`'s framing paragraph says "directly beneath" is literal, and
four mutation-checked cases in `tests/scripts/check-product.test.js` pin each input.
The prose above keeps the shorthand it was written with; this paragraph is what it
means.

**Round 18 — the run has a tail, and the pipe scan was reading it as one.** The
adjacency clause above measures the run's *breaks*; nothing measured its *end*. The
collector is `if (!/^ {0,3}\|/.test(raw)) continue;`, so a line appended under the
last row without outer pipes was skipped — and GFM asks no outer pipe of a row.
Verified two ways rather than argued: driving `validateProduct` against a canonical
table plus a row written `2.0.0 | v9.9.9 | m | **frobnicated ← we are here** | why |
[ghost](specs/ghost.md)` yields zero errors, and the same input through GitHub's own
`/markdown` endpoint comes back as a `<table>` with two `<tbody>` rows. A second
`← we are here`, a `Status` outside the vocabulary, a `Tag` against the wrong version
and a link to a spec that does not exist all sat in the rendered table unread by C1,
C4, C6 and C7. A line with no pipe at all is the same hole — the endpoint renders it
as a one-cell row.

"Explicitly reject" beat "parse the optional outer pipes": `product/AGENTS.md` already
defines a roadmap row as six `|`-delimited cells, so reading a row the corpus does not
write that way would widen the format, while rejecting it makes the engine match the
doc. It landed the way rounds 13 and 15 did — a clause of C6, no new `D-id`, the rule
count still seven. The clause measures the run positionally, from the header down to
the first blank line, and reports any line in it the pipe scan did not collect. It
runs **last**: ahead of the adjacency check it would steal
`'rejects a fenced block between the header and its delimiter'`, whose fence lines
`unfencedEntries()` drops and which is the adjacency clause's to report.

Blunt in one direction, and priced: a fence or a four-space-indented line directly
under the last row *does* end the table for a reader — confirmed against the same
endpoint, alongside the blockquote, ATX heading and list item that end it too — and is
reported all the same, because what the rule asks for is the blank line the corpus
already writes above its note. The adjacency message widened in the same change: a
pipe-less row *between* two canonical rows was already reported there, and the message
named only causes that end the table, which is the one thing that input does not do.

The silent sibling of this family was fixed rather than deferred, and is not part of
the rule above: `parseRoadmapRows` trimmed before testing for a leading `|`, with no
indent bound, so a four-space-indented six-cell row — an indented code block, i.e. an
illustration — was read as product state and could become a spec's governing row. That
one needed no decision: it made the linter's own indentation exemption cover rows the
way it already covered `### D-NNN` headings and relation bullets. The scan now spans
` {0,3}`, `product/AGENTS.md`'s indentation paragraph names the roadmap row as the
third form it covers, and two cases in `tests/scripts/check-product.test.js` pin both
directions of the bound.

## 7. `section()`'s two indent bounds stay different — the widening argued down in round 14

Round 14 widened the heading that **closes** a slice from column 1 to ` {0,3}`
(`SECTION_END_RE`). The obvious tidy-up that follows — widening the heading that
**opens** one to match, so one bound serves both ends — was argued down, and stays
argued down.

The two reads fail in opposite directions:

- The **closing** read fails *open* at column 1. An indented `## Appendix` never ended
  `## Decision Log`, so the appendix's `### D-NNN` headings became entries C2 numbered
  and a spec's citation resolved — the plausible-looking lie the linter exists to
  catch. That is why it was widened.
- The **opening** read fails *closed* at column 1. An indented `## Decision Log` yields
  an empty slice, and C6 rejects a corpus with no decisions the same way it rejects a
  renamed heading. Widening it deletes that live rule and buys nothing, because a
  reader of the rendered file sees the heading either way.

The asymmetry has one exception, and it is why the "and C6 catches it" half must never
be written unqualified — which it twice was, and was twice corrected. A spec's
`## Decisions` (`SPEC_DECISIONS_HEADING_RE`) is read at column 1 like the other two,
but **no rule asserts a spec's headings**: an indented one empties the slice, C5
resolves nothing, and the spec is checked for nothing — the fail-closed slice reaching
the fail-open outcome. `product/AGENTS.md` states the exception once, and the two
docblocks that make the C6 claim qualify it against that statement rather than
restating it. Whoever adds a rule over a spec's headings is the one who gets to delete
the qualification.

## 8. An escaped closing bracket is still read as a link

`SPEC_LINK_RE` now requires an opening bracket a reader sees — `\[alpha](specs/alpha.md)`
is an escaped bracket, renders as literal text, and is reported as linking no spec. The
sibling one character to the right is not closed: `[a\](specs/alpha.md)` escapes the
*closing* bracket, so CommonMark renders the cell as literal text too, but the pattern's
`[^\]]*` link-text class stops at that backslash-escaped `]` and matches all the same.
C4 records the spec as linked and grants it a governing row off a cell that navigates
nowhere — the same fail-open the opening-bracket fix removed, in the direction the fix
does not reach.

It stays open because every closure tested buys it with a *real* link priced as
fail-closed, which is the worse trade for a gate the whole repo has to pass:

- excluding `\` from the link text (`[^\]\\]*`) rejects `[a\b](specs/alpha.md)` — an
  escaped non-bracket inside link text, which CommonMark renders as a link;
- a `(?<!\\)` before the closing bracket rejects `[a\\](specs/alpha.md)` — a literal
  backslash ending the link text, also a real link, and the same parity problem the
  opening-bracket prefix had to solve, now needing its own run-length read;
- the escape-aware class `(?:[^\]\\]|\\.)*?` matches this one, but silently flips
  `[a\]b](specs/alpha.md)` from missed to matched — and that miss is a trade the
  `SPEC_LINK_RE` docblock already prices as deliberate, one of the two fail-closed
  forms it names. Reversing a documented trade as a side effect of closing a different
  hole is exactly the kind of change this file exists to slow down.

So the choice is not "fix or don't" but "how wide is a `Spec` cell allowed to be" —
whether the linter reads link text as CommonMark does, or keeps the bracket-blind class
and its two named misses. That is a maintainer decision about the format, not a review
fix, and whoever takes it owns the docblock's fail-closed paragraph along with it.
