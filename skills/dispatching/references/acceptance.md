# Accepting Dispatched Work

Two checks, dispatched to two fresh contexts, run per piece as it completes —
not batched until the end. A defect found while one piece has landed is cheap;
the same defect found after three more pieces landed on top of it is not.

## Check 1 — Does the delivery satisfy the criteria

```
Judge one piece of delivered work against its acceptance criteria. It has been
merged into <branch> at <commit-sha>.

Acceptance criteria:
<pasted verbatim>

For each criterion:
1. Find the code that implements it. Do not infer it from a test name, a commit
   message, or a filename — locate the code.
2. Decide whether that code does what the criterion requires.
3. Report PASS or FAIL with file:line evidence.

Classify every failure as Missing (not implemented, or implemented as something
else), Extra (present in the code, absent from the criteria), or Misunderstood
(a different problem solved). Report only what you read. Change nothing.
```

## Check 2 — Does it pass from an empty context

```
Verify one piece of work independently. Its author reported the tests passing;
I need that reproduced with none of their state.

From <absolute path to the main checkout>, not from a worktree:
1. Run <project test command>.
2. Report the raw output, the pass/fail counts, and the exit code.

Do not summarize and do not change code.
```

Run it from the main checkout. Repeating the command inside the author's own
worktree reproduces their environment, which is exactly the variable under test:
a stale cache, an uncommitted file, or a warm module registry can make a suite
pass there and nowhere else.

## Reading the two reports

| Outcome | Do |
|---|---|
| Both PASS | Accept. Record both, with counts. |
| Either FAIL | Reject. Quote the failing report verbatim as the feedback. |
| One PASS one FAIL | Reject. The failing report names the problem. |
| A check errored rather than reporting | Re-dispatch it once, then fall back to an inline check and label the acceptance degraded. |

Recording the counts is not decoration — it is what makes a skipped check
visible. If you cannot fill in concrete numbers from a report, you did not
dispatch the check.

## Defects worth looking for

Drawn from real deliveries that passed their own tests:

- **A field missing from the return shape.** Criteria list four fields, the code
  returns three, and the test only asserts on the three.
- **A flag parsed but not handled.** The option is registered; its branch is
  empty or logs and returns.
- **An error path that does not exist.** "Return 404 when absent" is implemented
  as returning 200 with an empty body, or as an unhandled throw.
- **Atomicity in name only.** "All or nothing" implemented as sequential writes
  with no rollback, leaving partial state on failure.
- **A test that names the criterion and asserts nothing.**
  `it("handles the breakdown", () => expect(result).toBeDefined())`.
- **A fixture that happens to match.** The expected value is hardcoded to what
  the wrong formula produces.

Calibration: this is a compliance check, not a code review. A criterion
implemented in a style you would not have chosen is met. Reject only when the
criterion is not actually implemented. When genuinely unsure after a second read,
accept — a false rejection costs a whole retry cycle, a false acceptance costs a
bug report.

## What a rejection has to contain

Four parts per item, or the retry is guesswork:

1. **Which criterion** — by number, id, or position, so it can be found.
2. **Its text, verbatim** — not your paraphrase.
3. **What the code does now** — concretely, with file and function names.
4. **What it must do** — stated as the delta from what it does now.

```
Rejected. One issue:

1. Criterion 5 — per-collection breakdown missing.
   Criterion says verbatim:
     "for each collection, its name and its document count, sorted by
      document count descending"
   Now:
     - src/store.ts: StatsResult has no perCollection field; getStats() does
       not compute one.
     - src/cli/stats.ts prints totals only.
     - test/stats.test.ts has no assertion on it.
   Required:
     - Add perCollection: Array<{name, docCount}> to StatsResult.
     - getStats() computes and sorts it descending.
     - Both the human and --json outputs carry it.
     - A multi-collection fixture asserts shape and sort order.
```

## When the criterion is what is wrong

Sometimes the check fails because the criterion is wrong — it names a file that
does not exist, or contradicts a convention the codebase follows everywhere. The
signal is several pieces independently making the "same mistake", or a failure
that is about a name or a path rather than a behavior.

Then: confirm it independently with `grep` or a file listing, quote what you
found, accept the piece over the failed check, and record the defective criterion
for the user to fix. Do not spend a retry on something the agent cannot fix.

This override looks identical to rationalizing from the outside. The difference is
evidence: command output distinguishes it, "I think" and "probably" and "they
likely meant" identify it as rationalizing. If your reasoning contains those
words, re-read the report and send the rejection.

## Retry budget

Three retries per piece, four attempts total, counted in this session. After the
last one, mark it failed, keep its worktree, and report it as failed rather than
retrying again.

Not every failure spends a retry. A mid-work question, a merge conflict escalated
for arbitration, and a defective criterion are all arbitration — answer them and
the same attempt continues. A retry is spent only when a piece was reported
complete, checked, and found wanting.

If attempt two fails the same criterion in the same way as attempt one, stop
retrying and look at the criterion instead: it is ambiguous, out of reach for this
codebase, or your feedback is unclear. A third mechanical retry will produce a
third variation of the same failure.
