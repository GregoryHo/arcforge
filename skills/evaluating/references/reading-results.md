# Reading Results

Open this in Phase 4, when trials have finished and someone is about to state a
conclusion.

## What each result shape licenses you to claim

The engine computes the verdict; `arcforge eval compare <name>` prints it. What
follows is what that verdict permits you to *say*, which is the part that goes
wrong.

| What came back | What you may claim | What you may not claim |
|---|---|---|
| Interval entirely above zero | The instruction changed behavior, by about the point estimate | That the effect size is exact — the interval is the finding |
| Interval spanning zero | No effect was measured at this trial count | That it "trends positive" or "shows promise" |
| Interval entirely below zero | The change made behavior worse | That it is noise, or that more trials will rescue it |
| Too few trials for an interval | Nothing yet | Any verdict — a small sample is absence of evidence, not weak evidence |
| Both conditions at the ceiling | The scenario did not discriminate | Anything at all about the instruction |
| Treatment green, baseline never run | The treatment satisfies the assertions | That the instruction caused it |

The last row is the most common overclaim: a passing treatment with no comparison
is evidence about the scenario, not about the instruction.

## The point estimate is not the result

A positive average with an interval crossing zero is the ordinary appearance of
noise, not a weak positive. This matters because the two are reported side by
side and the average is the more quotable number. Quote the interval.

Likewise, a wide interval on the right side of zero is a real finding with an
imprecise size. Report it as such rather than picking the midpoint and presenting
it as the effect.

## Behavior and cost are separate axes

Preserve duration, token, and cost figures alongside the behavioral verdict. A
treatment that is more correct and three times slower has a pass on one axis and
a regression on the other; a single verdict line reports the pass and buries the
regression. The reader who has to decide whether to ship needs both.

This applies in the encouraging direction too. A treatment that is cheaper but
behaviorally indistinguishable has not been shown to improve behavior.

## Pool validity

A result pool is only comparable if every row measured the same thing.

**One rubric per comparison.** Changing an assertion changes the measurement.
Rows recorded before the change describe a different experiment; bump the
scenario's `## Version` and re-run both conditions. The version bump is what
separates the epochs — without it, old and new rows pool silently into one
average of two experiments.

**Symmetric, cause-based exclusion.** A trial may leave the pool because the
harness crashed, the API errored, or the run was cut off before the agent
finished — infrastructure, not behavior. Apply the same rule to both conditions.
Excluding a completed trial because its score was inconvenient is selecting the
result.

**No re-rolls.** Re-running a trial until the number improves makes the reported
interval a fiction: the sample is no longer the sample. If a trial must be
replaced for an infrastructure reason, replace it before looking at the score, and
record that you did.

**Provenance.** Note which scenario version and which model produced a number.
Cross-model and cross-version comparisons are different experiments, and a pooled
average across them describes nothing.

When a pool has been contaminated, the repair is to exclude the affected runs
symmetrically and re-run, and to write down what was excluded and why. An
undocumented exclusion is indistinguishable from cherry-picking by the next person
to read it — including you.

## Discovered claims are candidates, not conclusions

Grading surfaces behaviors nobody wrote an assertion for, and assertions that turn
out not to test anything. Both are useful, and neither is a decision.

The failure mode is an automated loop: the eval observes something, the
observation is written into the instruction under test, the next eval observes the
instruction being followed, and confidence rises with nothing outside the loop
ever disagreeing. Precision drops while every number improves.

So: surface candidates for a human to arbitrate. The arbitration asks whether the
pattern generalizes beyond this scenario, whether it is already covered, and
whether the evidence is reliable. `arcforge eval audit` collects them; ranked
highest are the ones that recur *and* fail, since a behavior that always passes
teaches nothing by being written down.

Retirement takes the same care in reverse. An assertion repeatedly flagged as weak
may mean the claim is wrong — or that the assertion is badly built and the claim is
fine. Those have opposite repairs, and choosing between them requires reading the
scenario, not just the counts.

## Redesign, or abandon the claim

A blocked gate is a finding. When the baseline is at or near the ceiling, the
scenario has stopped discriminating; the repair is a harder trap, a narrower
scope, or a prompt with the answer removed. Lowering a threshold, deleting
history, or editing a cached gate record so the run proceeds converts the gate
into a formality and the results into decoration.

When two honest redesigns still produce no effect, consider that the claim may be
false: the instruction formalizes what agents already do. That is a legitimate,
reportable outcome, and the appropriate response is to say so — not to add trials
until the interval clears zero by chance, and not to keep redesigning until a
scenario is found that flatters the instruction. If the behavior matters but the
instruction is not what produces it, measure the environment instead, or measure
reliability on the task directly.

## Before stating a conclusion

- [ ] The sentence you are about to write is the one the interval supports.
- [ ] Cost and latency are reported next to the behavioral verdict, not inside it.
- [ ] Every excluded trial has a recorded infrastructure reason, applied to both
      conditions.
- [ ] No row in the pool predates a rubric or scenario change.
- [ ] Nothing discovered during grading has been written back into the instruction
      under test without a human deciding it should be.
