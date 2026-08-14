---
name: evaluating
description: Measurement discipline for claims about agent behavior. Use when a behavioral claim needs evidence before shipping, when designing or auditing an eval scenario, or when eval numbers have come back and a verdict is about to be read out of them.
---

# Evaluating

An eval settles one question: does this change what the agent *does*? Every
section below protects that question from the ways it quietly becomes a
different, easier question that the same numbers appear to answer.

The engine runs the trials — `arcforge eval list | lint | preflight | ab | run |
compare | report | audit`. What it cannot do is decide whether the thing it
measured is the thing you claimed. That decision is this skill.

## Phase 1 — Name the claim, then name what varies

Write the claim as one sentence about a decision the agent makes: "with this
instruction the agent reproduces the failure before proposing a fix." Vague
claims ("the skill helps") cannot be wrong, so they cannot be measured. Then read
off what has to differ between the two runs:

| The question you are asking | What varies between the runs |
|---|---|
| Does this instruction change behavior? | the instruction — present vs absent |
| Is the agent reliable at this task? | nothing; the same run repeated |
| Does the installed toolkit change outcomes? | the environment — plugins, hooks, project rules |

Vary the wrong thing and the number answers the wrong question. A claim about an
installed workflow, tested by pasting the instruction text into the prompt,
measures the prompt — the installation was never absent in either run.

A claim that bottoms out in an artifact — a file appeared, the exit code was 0,
the JSON parsed — is not behavioral. Nothing in it depends on the agent's
judgment, so a unit test settles it faster and without sampling noise.

- [ ] Done when the claim names one agent decision in one sentence, and you can
      say which row above you are in and what is different between the two runs.

## Phase 2 — Build a trap the baseline falls into

A scenario earns its keep by discriminating. Before running anything, say out
loud why the baseline — same prompt, same files, no instruction — will get this
wrong. If you cannot finish that sentence, you have no eval yet: you have a task
both conditions will pass, and a delta of zero waiting to be misread.

The trap is the bait the untrained response takes: the shortcut that looks
reasonable, the missing step nobody notices, the plausible wrong answer. Put the
tension in the scenario and leave the resolution out.

Three silent ways a scenario loses its power: the **prompt leaks the answer**
(naming the discipline, listing the steps, or describing the repair shape hands
the baseline the behavior you meant to measure); the **behavior is generic
competence**, so capability gets credited to the instruction; the **ground truth
is arguable**, so scores track interpretation instead of behavior.

One behavior per scenario, so a lift is attributable to one instruction. Prefer
three narrow scenarios over one that tests everything and explains nothing.

`references/scenario-design.md` carries the trap-construction patterns, the leak
checklist, and the recurring design mistakes worth recognizing by name.

- [ ] Done when you have written why the baseline fails, and a pilot or
      `arcforge eval preflight <name>` shows the baseline is not already passing.

## Phase 3 — Match the grader to the claim, not to convenience

Deterministic facts are code-graded: the file, the exit status, the value, the
call that happened. Judgment is model-graded: whether the analysis is sound,
whether the reasoning is systematic. Taste and audience response are
human-graded, and only what an LLM genuinely cannot assess belongs there.

**Structure is not quality.** Valid JSON with every required field says nothing
about whether the content is correct. Code-grade the shape, model-grade the
substance, and when a claim has both, split it into two scenarios rather than
letting one grader pretend to cover both.

**A proxy that a bad answer can pass is measuring the wrong thing.** Before
accepting a keyword, regex, or schema check, run it in your head against a
deliberately shallow answer and against an adversarial one that games the
pattern. If either passes, the check is not evidence for the claim — tighten it
with negative fixtures or grade the claim where it actually lives.

Never reshape the assertion to fit the grader you prefer. Rewriting "the
explanation is clear" into "the output exceeds 200 characters" buys reliability
by discarding validity, and the resulting green means nothing.

Model grading is noisy semantic evidence, not proof: one vague preference is not
release evidence. Use a task-derived rubric with concrete anchors, repeat trials,
and check the scores agree with each other before believing them.

- [ ] Done when every assertion is graded by the mechanism its nature requires,
      and you have named what a shallow answer would score.

## Phase 4 — Read the numbers as they are

A direction is not a result. The point estimate moved; whether it moved further
than the noise is the confidence interval's job, not the average's. An interval
including zero reports no measured effect, however encouraging the midpoint looks.
Too few trials produce no verdict at all rather than a weak one — the honest
response is more trials, not a softer reading.

Report behavior and cost separately. A treatment can be more correct and also
slower, longer, and pricier; folded into one verdict, the pass hides the
regression. Say both.

`references/reading-results.md` covers what each result shape licenses you to
claim, how to keep a pool valid, and what to do when the numbers refuse to move.

- [ ] Done when the claim you state out loud is the one the interval supports,
      and any cost regression is reported next to it rather than inside it.

## Keeping the result pool honest

The pool is the evidence. These four rules are what make the comparison mean
anything, and each is easiest to break while telling yourself it is tidier:

1. **One rubric across both conditions.** Edit an assertion and the runs before
   the edit measured something else. Bump the scenario's `## Version` and re-run
   both sides — never compare a baseline graded one way against a treatment
   graded another.
2. **Drop trials only for infrastructure failures, and symmetrically.** A crashed
   harness or an API error is not a result. A score you dislike is.
3. **Never re-roll a trial to get a better number.** Re-running until the answer
   improves selects the answer; whatever k says afterwards, the interval is a
   fiction.
4. **A scenario edit invalidates its own history.** Old results describe the old
   scenario. Pooling across the edit reports an average of two experiments.

Claims surfacing during grading are candidates, not conclusions. Writing your own
eval's observations back into the instruction under test closes a loop — the
instruction trains the eval that then expands the instruction, precision drops,
and nothing outside ever disagrees. Surface them for a human to arbitrate.

## Rationalizations

| What you are about to say | What is actually true |
|---|---|
| "The change is too small to measure" | Size does not predict behavioral effect. One clause can flip a verdict. |
| "No time — measure after shipping" | Measurement after shipping is a postmortem. It cannot gate what already shipped. |
| "The delta is positive, so it works" | A positive midpoint with an interval spanning zero is the shape of noise. |
| "Both conditions passed, so the instruction works" | Both passing means the scenario did not discriminate. You measured nothing. |
| "The baseline already passes — that proves it's unnecessary" | It proves the scenario is too easy. Redesign the trap before concluding anything. |
| "Close enough to the trial minimum" | Below the minimum there is no interval, so there is no verdict to be close to. |
| "The grader flagged weak assertions but the score is fine" | A high score on an assertion that tests the wrong thing is the failure, not the reassurance. |
| "I already tried it by hand and it worked" | One run measures your luck. The claim is about behavior across trials. |
| "It's documentation-only, so no measurement is needed" | An instruction *is* the behavior. Changing what the agent reads changes what it does. |
| "I tightened the assertions, so the old baseline still stands" | It was scored by a different rubric. Re-run both sides. |

## Red flags

Catching yourself doing any of these means stop and go back to the phase named:

- writing assertions before the claim exists — Phase 1
- unable to say why the baseline fails, and running it anyway — Phase 2
- choosing what is easy to check over what the claim is about — Phase 1
- turning a judgment assertion into a string match so it can be code-graded — Phase 3
- quoting a midpoint without the interval — Phase 4
- re-running the run that came back wrong — Keeping the result pool honest
- adding trials to a scenario whose baseline already passes — Phase 2
- lowering a threshold, deleting history, or editing a cached gate result so a
  blocked scenario proceeds — the block is the finding

## When the numbers will not move

A delta that stays at zero through two honest redesigns is itself a result: the
instruction may formalize what agents already do. Say that. A third redesign
aimed at manufacturing a difference is no longer measurement.

## References

- `references/scenario-design.md` — trap construction, the answer-leak checklist,
  response shape, and the design mistakes that waste the most runs (Phase 2).
- `references/reading-results.md` — what each result shape licenses you to claim,
  pool validity, and the redesign-or-abandon decision (Phase 4).
