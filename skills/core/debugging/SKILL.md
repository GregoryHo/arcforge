---
name: debugging
description: Root-cause discipline for a failure you cannot yet explain. Use when a test fails, a bug is reported, behavior surprises you, a build or CI step breaks, or a fix you already tried did not hold.
---

# Debugging

## The Iron Law

```
NO FIX BEFORE THE CAUSE IS NAMED
```

A change that makes a symptom disappear without explaining it is a mask, not a
fix: the defect stays and the evidence is gone. Naming the cause means saying
which line produced the wrong value and why. "It passes now" is not a cause.

The law binds hardest where it feels most skippable — under a deadline, when the
fix looks obvious, when someone hands you the patch to apply, and after two
attempts have already failed.

## Phase 1 — Reproduce

Run the failing thing yourself and read the whole output: the error text, the
stack frames, the line numbers. A reported symptom is secondhand; the run is
evidence.

Then narrow it. What makes it happen, what makes it stop, and what changed
recently (`git log`, `git diff`) on the code path it touches.

- [ ] Done when you have triggered the failure yourself and can state the exact
      command, the exact error, and whether it happens every time.

Not reproducible on demand → that is a finding, not a blocker. Open
`references/intermittent-failures.md` when identical runs disagree.

## Phase 2 — Locate the origin

Where the error surfaces is rarely where the defect lives. Take the wrong value
and walk backward — who passed it here, who computed it there — until you reach
the code that first produced it from correct inputs. That producer is the origin.

Open and read the files along that path. A module you never opened has not been
ruled out, and "that part is fine" is a claim about the past, not about this run.

Crossing a component boundary (service to service, CI to build to sign) blinds
the walk: instrument each boundary, run once, and read where the value stops
being right. Both techniques in full: `references/finding-the-origin.md`.

- [ ] Done when you can point at the line that produced the wrong value and say
      why it produced it.

## Phase 3 — Test one hypothesis

Write it as one sentence: "X is the cause, because Y." Then make the smallest
change that would tell you whether you are right.

- [ ] Done when the hypothesis is written down and one experiment has confirmed
      or refuted it.

Refuted → form the next hypothesis from what the experiment just taught you.
Never stack a second change on an unconfirmed first: two changes at once destroy
your ability to say which one mattered.

Do not know → say so. "I don't understand why X happens" is a usable report; a
guess presented as a diagnosis costs the next hour.

## Phase 4 — Fix at the origin

Change the line Phase 2 identified, and only that. Defensive guards at the
symptom site, adjacent cleanups, and "while I'm here" refactors belong in a
separate change; bundled in, they hide whether the fix actually worked.

Reproduce the bug as a failing test first whenever a test can reach the code —
`/tdd` covers writing it.

Then look at the result itself, not only at the check. A passing suite reports
that an assertion stopped firing; it says nothing about whether the value is now
right. Read what the code actually produces, and when that is still wrong the
investigation is not over — go back to Phase 2 carrying what the wrong value
tells you.

- [ ] Done when you have seen the corrected output with your own eyes, the rest
      of the suite still passes, and the change landed at the origin rather than
      where the error appeared.

## After three failed fixes

Stop. Three fixes that each exposed a new problem elsewhere are not a run of bad
hypotheses — that is the signature of a wrong design. Say so plainly and put the
structural question to your human partner before attempting a fourth.

## Rationalizations

| What you are about to say | What is actually true |
|---|---|
| "Simple bug, the process is overkill" | Simple bugs have causes too, and this one costs minutes to find. |
| "No time — this ships today" | Guess-and-check is the slow path. It spends the same hours later, with interest. |
| "The user told me exactly what to change" | They reported a symptom and proposed a patch. A patch is a hypothesis, not a diagnosis. |
| "Patch it now, investigate afterwards" | The patch deletes the evidence, and "afterwards" arrives as a reopened bug. |
| "It can't be that module — nothing there changed" | Unchanged code meets changed callers. Unread code is unruled-out code. |
| "The test is green now" | Green means that assertion stopped firing, not that the value is right. |
| "Let me try a few things and see what sticks" | Simultaneous changes cannot be attributed to anything. |
| "One more attempt" (after two failures) | Three failures indict the design, not the hypothesis. |

## Red flags

Catching yourself doing any of these means stop and return to Phase 1:

- reaching for a guard, a default, a retry, or a swallowed exception whose only
  effect is to make the failure quiet
- editing the file the error message named without having read what feeds it
- proposing a fix in the same breath as first hearing the symptom
- writing "this should fix it" where "this is the cause" belongs

## When there is no root cause

Investigation sometimes ends at a genuinely external cause: a flaky network, a
provider outage, a race inside a dependency. That is a finished investigation,
not an exemption — record what you ruled out, handle the condition explicitly
(retry, timeout, an error message that names it), and leave the trail behind.
This ending is only available after Phase 2 actually failed to find an origin.

## References

- `references/finding-the-origin.md` — backward tracing through a call chain,
  and boundary instrumentation across components. Open it in Phase 2 when the
  walk stalls or crosses a process boundary.
- `references/intermittent-failures.md` — failures that come and go between
  identical runs. Open it in Phase 1 when you cannot reproduce on demand.
