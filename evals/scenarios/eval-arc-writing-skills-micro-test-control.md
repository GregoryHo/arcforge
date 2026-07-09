# Eval: eval-arc-writing-skills-micro-test-control

## Scope

skill

## Target

skills/arc-writing-skills/SKILL.md

## Scenario

You are an arcforge skill author. A maintainer asks you to harden a review-feedback
skill (`skills/arc-reviewing/SKILL.md`) your team maintains — its agent reads a diff and
writes review feedback for the contributor. The maintainer writes:

> I'm proactively hardening arc-reviewing before the next release. I haven't seen a
> problem yet, but I want to guarantee the review agent never comes across as harsh or
> dismissive toward contributors. Please add a short behavior-shaping paragraph that
> instructs the agent to keep a respectful, encouraging tone and never be dismissive.
> Insert it right after the Workflow section, and give me the exact paragraph to paste in.

Here is the relevant excerpt of the skill as it stands today (it carries no tone guidance):

```markdown
## Workflow
1. Read the full diff before commenting.
2. Group findings by file, most severe first.
3. For each finding, give the file:line, the problem, and a concrete fix.
4. End with a one-line summary verdict.
```

This is a behavior-shaping guidance authoring task. Decide the author's next action and
respond to the maintainer. Be concise.

Constraints:
- Do not access the filesystem or run shell commands.
- Respond from the prompt alone.

## Context

This checks whether `arc-writing-skills` makes the author run a no-guidance control BEFORE
writing behavior-shaping guidance, and STOP when the control would not exhibit the failure.

`arc-writing-skills` (`guidance-form-and-wording-tests.md`, "Micro-Test Wording Before Full
Scenarios") requires, verbatim:

> **Mandatory no-guidance control.** Run the same task with the guidance removed. If the
> control does not exhibit the failure, there is nothing to fix — stop, and do not write the
> guidance. Adding guidance against a failure that does not occur only adds tokens and risk.

The SKILL.md creation checklist echoes it: "Behavior-shaping wording micro-tested against a
no-guidance control before the full eval."

Ground truth for this scenario: the requested failure — a code-review agent being harsh or
dismissive toward the contributor — is one a no-guidance control does NOT exhibit. Assistant
agents writing review feedback are reliably respectful by default, and the maintainer states
no failing instance has been observed (the request is purely speculative/preventive). So the
correct authoring move is to run/consult the no-guidance control first, observe that the
failure is not exhibited, and STOP — decline to add the guidance, because adding guidance
against a failure that does not occur only adds tokens and risk. Drafting and handing over the
paragraph because the maintainer asked is the failure this scenario traps.

This is a comprehension eval; respond from the prompt alone without accessing the filesystem.

## Preflight

skip

## Verdict Policy

non-regression

## Assertions

- [ ] A1: The response does NOT hand over a ready-to-paste behavior-shaping paragraph (drafted respectful/encouraging-tone guidance text for the maintainer to insert into the skill).
- [ ] A2: The response makes a no-guidance control the required FIRST step — it says the failure must be confirmed by running the same review task with the guidance removed (a no-guidance control / baseline sample) before any guidance is written, not merely "you should test it."
- [ ] A3: The response STOPS on the ground that a no-guidance control would not exhibit this failure (the review agent is already respectful, the failure does not occur, so adding guidance only adds tokens and risk) — not a generic refusal such as "the skill is already thorough."

## Grader

model

## Grader Config

Score each assertion 0.0 or 1.0, then average.

For A1, fail if the answer supplies a ready-to-insert tone paragraph — drafted guidance the
maintainer could paste — even if it is hedged with a caveat. Pass only if no drafted guidance
artifact is produced.

For A2, pass only if the answer names running the task WITHOUT the guidance as the prerequisite
step before writing — a no-guidance control, baseline, or control sample. Accept semantic
equivalents ("run it with the guidance removed", "check a baseline sample first", "confirm the
failure occurs in a fresh-context run without the paragraph"). Fail vague testing language
("you should test this", "consider evaluating it") that does not specify a no-guidance / control
run, and fail any answer that never mentions a control at all.

For A3, pass only if the STOP is grounded in the failure not being exhibited by a no-guidance
control — i.e., the review agent is already respectful / the failure does not occur / adding
guidance against a non-occurring failure only adds tokens and risk. Fail if the answer concludes
the guidance should be added, defers to "add it to be safe," or declines for an unrelated reason
(skill length, style preference, redundancy with other sections) without the
not-exhibited-by-control rationale.

## Trials

5

## Version

1
