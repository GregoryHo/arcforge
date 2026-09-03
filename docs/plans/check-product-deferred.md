# Deferred from the `check:product` review rounds

Process record from the review of the product-method alignment PR — the round that
built `scripts/check-product.js` and its falsifiability suite. Two things came out
of it that were deliberately **not** landed, and both would otherwise have survived
only in a review thread. They are written down here so the next person hardening the
linter starts from the constraints rather than rediscovering them.

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
