# Deferred from the `check:product` review rounds

Process record from the review of the product-method alignment PR — the round that
built `scripts/check-product.js` and its falsifiability suite. Six things came out
of it that were deliberately **not** landed — four widenings and carry-forwards the
rounds argued down, plus two standing constraints on the linter's own code, one of
which has since been taken — and each would otherwise have survived only in a review
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

## 5. `stripCodeSpans()` empties code-styled link text

C4 reads a `Spec` cell with its code spans removed, and a span is dropped whole —
contents included. `` [`alpha`](specs/alpha.md) `` reaches `SPEC_LINK_RE` as
`[](specs/alpha.md)`.

Harmless as the rules stand, and pinned from both sides in
`tests/scripts/check-product.test.js` ("does not count a link wrapped in a code span
as a link", "still reads a link whose text is code-styled"): the pattern anchors on
`](specs/<slug>.md)` and never looks at the link text, so the emptied label costs
nothing.

It turns into a bug the moment the pattern is tightened. A rule that required
non-empty link text — to reject `[](specs/alpha.md)`, a link a reader cannot see —
would start rejecting the code-styled label, which is a legitimate authoring form.
Whoever tightens `SPEC_LINK_RE` owns one of two fixes:

- keep the span's contents rather than dropping them — replacing with `$2` from
  `` /(`+)([^\n]*?)\1/g `` — which then needs its own answer for a *fully* spanned
  link, the case the current form gets right for free; or
- ban the code-styled label in `product/AGENTS.md` and say so in the C4 docblock,
  which makes the emptying intended rather than incidental.

No code was written for this in round 9: the behaviour is correct under today's
rules, and changing what `stripCodeSpans()` means with no rule asking for it trades a
latent coupling for a live one.

## 6. The roadmap table's framing is not asserted

Every rule that reads the table — C1, C4, C6, C7 — reads a *row*: `parseRoadmapRows`
accepts any six-cell pipe line inside `## Roadmap` and nothing above it is required.
Three inputs therefore lint green:

- a `## Roadmap` holding only a data row, with no header row and no delimiter;
- a header row plus a data row, with no delimiter between them;
- a header row, a two-column delimiter, and a six-cell data row — `parseRoadmapRows`
  skips an all-dash line unconditionally, and that `continue` runs *before* the arity
  check, so an off-arity delimiter is dropped rather than reported.

It stayed out because GFM renders none of the three as a table. A delimiter row is
required, and one whose arity differs from the header's un-recognizes the table, so
each input reaches a reader as a paragraph of literal pipes — loud corruption rather
than the plausible-looking lie the linter exists to catch. Neither D-006 nor
`product/AGENTS.md` promises framing: a roadmap row is defined there as a six-cell
pipe line, and C6's "the roadmap table has no rows" is the only surface that implies a
table at all.

Closing it is an **eighth rule**, which needs a decision refining D-006 — whose
recorded text enumerates seven. That is the same gate `check-product-spec-sections`
sits behind (no rule asserts a spec's headings either), and the reason both are
backlog wishes rather than half-landed code.

Two constraints on the rule, if someone lands it:

- It must assert a `Version` header row **and** a delimiter whose arity matches it. A
  bare "some header exists" check still passes the third input above.
- The unconditional all-dash `continue` must move *after* the arity check, so an
  off-arity delimiter is reported instead of skipped.

The silent sibling of this family was fixed rather than deferred, and is not part of
the rule above: `parseRoadmapRows` trimmed before testing for a leading `|`, with no
indent bound, so a four-space-indented six-cell row — an indented code block, i.e. an
illustration — was read as product state and could become a spec's governing row. That
one needed no decision: it made the linter's own indentation exemption cover rows the
way it already covered `### D-NNN` headings and relation bullets. The scan now spans
` {0,3}`, `product/AGENTS.md`'s indentation paragraph names the roadmap row as the
third form it covers, and two cases in `tests/scripts/check-product.test.js` pin both
directions of the bound.
