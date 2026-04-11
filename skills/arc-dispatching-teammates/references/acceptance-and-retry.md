# Acceptance Check & Retry Loop

This reference expands SKILL.md Steps 6–8. SKILL.md keeps the decision
logic; everything procedural and example-heavy lives here.

## Why acceptance cannot be implicit

Baseline behavior of a naive lead: on teammate completion SendMessage,
implicitly accept. Continue monitoring other teammates. Defer any
"is this right?" check to a single aggregate `arc-verifying` after the
whole dispatch. This fails in two ways:

1. **Aggregate `arc-verifying` only catches what tests cover.** If the
   teammate's own tests were incomplete (e.g., forgot to test a
   required acceptance criterion), both the teammate's own verify AND
   the aggregate verify will pass while the epic silently fails the
   spec. Tests are not spec compliance.
2. **By the time aggregate verify runs, all teammates are done.** If
   epic A fails the spec but is discovered only after epics B and C
   also completed (on top of epic A's merge), debugging and retry
   becomes expensive — the dev branch has layered commits from other
   epics that the retry has to navigate around.

Per-completion acceptance checks catch defects early, while the retry
cost is low.

## Spec compliance check — how

The check compares **what the spec says** against **what the merged
code actually does**. The unit of comparison is the acceptance
criterion, not the test.

### Procedure

1. Open the epic's top-level spec: `epics/<epic-id>/epic.md`
2. Open each feature spec it references: `epics/<epic-id>/features/*.md`
3. Collect every numbered/bulleted acceptance criterion across all
   features. Write them out if that helps you track.
4. For each criterion, find the corresponding code in the merged dev
   branch. Start from the files the spec mentions (if any), then grep
   for the behavior described.
5. Ask: *does the code actually do what this criterion requires?*
   - Return shape: does the code's return type / response body
     include every field the criterion lists?
   - Behavior: does the code path for this criterion execute the
     required action, or is it stubbed / no-op / TODO?
   - Edge cases: if the criterion names specific edge cases (empty
     input, null, >N items, --clear flag), does the code handle them?
   - Test coverage: does a test exist that would catch a regression
     on this criterion? (A missing test is not automatic rejection,
     but it's a warning flag.)
6. If any criterion is missing, stubbed, superficial, or contradicted
   by the code — mark it failed.

### Common defect patterns

These are the patterns to watch for, drawn from real teammate output:

- **Return shape missing a field.** Spec says the result includes
  `{a, b, c, perCollection}`; code returns `{a, b, c}`. Teammate's
  tests pass because they only assert on `a, b, c`. Lead catches it
  by reading the spec.
- **CLI flag registered but branch empty.** Spec says `--clear`
  should wipe history; code registers the flag in `parseArgs` but
  the handler's branch for `values.clear` is empty or just `console.log`.
  Look for the flag's usage, not just its declaration.
- **Error path unhandled.** Spec says "return 404 when not found";
  code returns 200 with empty body or throws an unhandled exception.
  Grep for the error condition and see what happens.
- **Superficial atomicity.** Spec says "atomic: all-or-nothing";
  code does the operations in sequence without a transaction or
  rollback, leaving partial state on failure. Look for transaction
  boundaries.
- **Hardcoded test values.** Spec requires computing X from Y; test
  passes a fixture where X happens to match, but the computation
  formula is wrong and would fail on other inputs. Read the
  computation, not just the test assertion.
- **Test references criterion by name but asserts nothing.** `it("handles
  per-collection breakdown", () => { expect(stats).toBeDefined(); })`.
  The test name is aspirational; the assertion is hollow.

### Calibration

The check is not a full code review. You are looking for **clear
non-compliance**, not style issues. If the code addresses the
criterion but uses a pattern you would not have chosen, that's not a
rejection — that's teammate autonomy. Reject only when the criterion
is **not actually implemented**.

If you're unsure whether a criterion is addressed, read the code once
more, then decide. If still unsure, err on the side of accepting — a
false accept creates a bug report; a false reject creates a full retry
cycle which is more expensive.

## Fresh-eyes verification — why it's not redundant

The teammate ran `arc-verifying` / project tests in their own context
and reported green. The lead runs the same command in a fresh context.
Why is this valuable?

- **Different environment state.** Teammate's context has stale
  caches, in-memory state, partially-staged files, or uncommitted
  changes that made tests pass locally but wouldn't survive a fresh
  clone. Lead's context has none of that.
- **Different import-cache shape.** Node's module cache, Python's
  import cache, Rust's incremental compilation — all can mask issues
  that reappear on a fresh process.
- **Different git state.** If teammate's worktree had uncommitted
  changes at verify time (bug, but happens), their verify was on the
  uncommitted state while the merge is on the committed state.
- **Different time.** CI flakiness, network-dependent tests, timezone
  edge cases can flip green/red between runs.

Running the same command twice is not redundant when the two contexts
differ. Treat the lead's verify as a **second opinion**, not a rerun.

## Formulating rejection feedback

Feedback quality determines retry quality. Vague feedback produces
worse retries than no feedback at all, because it encodes the lead's
uncertainty into the teammate's prompt.

### Required components of every feedback item

1. **Which acceptance criterion failed** — reference it by its number,
   ID, or position in the spec file so the retry teammate can find it
2. **Verbatim quote of the spec text** — not paraphrased; the exact
   words the teammate needs to match
3. **Current behavior** — what the implementation does today, stated
   concretely with file/function references
4. **Required behavior** — what the spec demands, stated as a delta
   from current

### Example — good feedback

```
Epic epic-stats rejected. Issues:

1. fr-stats-001 AC #5: per-collection breakdown missing
   Spec says verbatim:
     "Per-collection breakdown — for each collection, its name and
      its document count, as a list sorted by document count
      descending"
   
   Current implementation:
     - src/store.ts: StatsResult interface has no perCollection field;
       getStats() does not compute it
     - src/cli/stats.ts: human-readable table prints index size,
       totalDocs, docsWithEmbeddings, embeddingCoveragePct,
       collectionCount. No per-collection section.
     - --json output reflects StatsResult, so it also lacks
       perCollection.
     - test/stats.test.ts has no assertion on perCollection
   
   Required:
     - Add perCollection: Array<{name: string, docCount: number}> to
       StatsResult
     - getStats() queries per-collection counts, sorts descending
     - Both human-readable and JSON outputs include the breakdown
     - test/stats.test.ts asserts on perCollection shape and sort
       order with a multi-collection fixture
```

### Example — bad feedback (do not write this)

```
Epic epic-stats rejected. The stats implementation looks incomplete,
please review the spec and make sure everything is covered. I think
there might be something missing in the output.
```

No criterion name. No quote. No concrete current vs. required. The
retry teammate reads this and has to guess, which is roughly the same
as no feedback.

## Retry mechanics

### Fresh worktree via `cli.js expand`

On rejection, call `node scripts/cli.js expand --epic <epic-id>`. The
CLI creates a new worktree at the canonical path. The new worktree's
starting commit is the current dev-branch HEAD — which already
contains the rejected attempt's merge commits.

This is **intentional fix-forward**. The retry teammate cd's into the
new worktree and sees the previous attempt's work already in place.
Based on your feedback, they either:

- **Build on top** — append fixes to the existing code (preferred
  when the rejected attempt was mostly right but missed specific items)
- **Revert and redo** — use `git revert` or `git reset` to undo the
  previous commits within their worktree, then implement fresh (use
  when the feedback indicates the rejected approach was wrong
  direction)

The teammate decides which based on the feedback. The lead does not
need to specify "revert first" unless the previous attempt was so
wrong that building on top would be harder than starting fresh.

### Retry counter

Tracked in the lead session's working memory. No file persistence.
Simple counter per epic-id: `retry_count[epic_id] = N`. Increment on
each rejection. Give up when `N == 3` (meaning attempts 1, 2, 3, 4
have all been rejected).

If the lead session itself dies mid-retry, manual intervention is
acceptable. This is a transient dispatch session, not a durable state
machine.

### When retries are NOT applicable

Three events look like "teammate failed" but are NOT retry-triggering:

1. **Mid-work blocker escalation.** Teammate SendMessages "I'm stuck
   on X, need guidance." This is an arbitration flow — lead responds
   with guidance, teammate continues the same attempt. Retry counter
   does not increment.
2. **Merge conflict at finishing time.** Teammate SendMessages using
   the Merge Conflict (Multi-Teammate) format from arc-finishing-epic.
   Lead arbitrates the conflict, teammate continues the same attempt.
   Counter does not increment.
3. **Teammate gives up voluntarily.** Teammate SendMessages "I can't
   do this, giving up." This is not an acceptance failure — it's a
   direct failure. You can treat it as a rejection that consumes a
   retry slot, OR you can skip retry and mark permanently failed
   depending on whether you think a fresh teammate would do better.
   Judgment call.

Retries are specifically for: **teammate reported completion, lead
inspected the delivery, delivery did not meet the spec.**

## Edge cases

### Retry introduces a regression in another epic

Unlikely if epics are independent, but possible on shared files. If
the retry teammate's fix breaks a previously-accepted epic's tests,
you have a dev-branch conflict. Options:

- Revert the retry and formulate feedback explaining the regression
- Accept the regression and re-dispatch the previously-accepted
  epic as a retry itself (counter starts at 0 for that epic, since
  it's the "regressed epic", not the one that caused the regression)
- Give up on both and mark them permanently failed

No clean answer. Document whatever you chose in the final report.

### Teammate keeps rejecting on the same criterion across retries

If retry 1 fails criterion X, retry 2 also fails criterion X (in a
different way), and retry 3 also fails criterion X — the problem is
usually one of:

- **Spec is ambiguous** — the criterion is under-specified, and each
  teammate interprets it differently. Consider revising the spec
  before retry 3.
- **Spec is under-scoped** — the criterion requires capability the
  codebase doesn't have. No amount of retry will fix it.
- **Feedback is unclear** — you've been giving vague feedback that
  the teammates keep misreading.

Don't just retry 3 times mechanically. If retry 2 fails the same
criterion in the same way as retry 1, pause and investigate before
retry 3.

### Retries run out before all teammates finish

If epic A goes through 4 attempts and fails while epic B is still on
its initial attempt, that's normal. Mark A permanently failed, keep
monitoring B. The final report will show A failed and B's actual
outcome.
