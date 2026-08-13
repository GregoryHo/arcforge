# Scenario Design

Open this in Phase 2, when you have a claim and need a scenario that can actually
be wrong.

## The baseline-failure sentence

Write this before anything else: *"Given this prompt and these files, an agent
without the instruction will ___, because ___."*

If the blank cannot be filled with a specific wrong action, stop. Every remaining
problem in this file is a variation on failing to fill it honestly.

Then invert it: *"and with the instruction it will ___ instead."* Two concrete,
different, observable actions. If both halves describe the same action, the
scenario measures nothing about the instruction.

## Building the trap

The trap is whatever makes the wrong path attractive. It is not difficulty — a
merely hard task measures capability, not adherence. Useful shapes:

| Trap shape | How it works |
|---|---|
| The plausible shortcut | The wrong path is faster and looks sufficient |
| The buried caveat | The disqualifying detail is mentioned in passing, in a subordinate clause |
| The supplied answer | Someone hands over a diagnosis or a patch that is wrong; accepting it is the failure |
| Pressure | A deadline, a waiting teammate, sunk effort — the discipline is skippable exactly here |
| The missing step | Nothing prompts the step; skipping it produces output that looks complete |
| The false green | A signal that reads as success while the underlying claim is unverified |

Keep the tension intact and the resolution absent. A scenario that both poses the
problem and hints at the shape of the answer has already been solved for the
agent.

## Answer-leak checklist

Every one of these hands the baseline the behavior you meant to measure. Read the
prompt back and check for each:

- [ ] Does it name the discipline, the methodology, or the role? ("audit this",
      "review as a specialist", "systematically")
- [ ] Does it list the steps, or number the things to cover?
- [ ] Does it describe the shape of the correct output, when the shape *is* the
      behavior under test?
- [ ] Does it name the failure mode it is testing for?
- [ ] Does the surrounding context (setup files, comments, fixture names) spell
      out the answer?
- [ ] Would a reader who ignored the files and only read the prompt still produce
      a passing response?

A leaked prompt produces a baseline near the ceiling and a delta near zero. The
result is not "the instruction is unnecessary" — it is "this scenario cannot tell."

## Ground truth that survives grading

Assertions must be settleable from what the scenario provides. Three failures:

- **Hidden convention.** The assertion depends on a norm the agent was never
  shown. Grading it produces disagreement, and the disagreement reads as a
  regression.
- **Circular assertion.** It restates the task rather than describing what a
  passing response contains.
- **Arguable scope.** Two very different responses both defensibly satisfy it, so
  the score tracks interpretation rather than behavior.

Ask of each assertion: could a careful reader, holding only the scenario, agree
on pass or fail without consulting you? If not, either provide the missing
context or split the scenario.

## Environment and response shape

The agent has tools and will use them. An empty directory with no setup and thin
context produces an agent searching for files that do not exist until it times
out — that is a scenario defect, not a harness problem. Provide the files the
claim needs, or provide context rich enough that no files are needed.

Keep the required response small and structured. Long free-form output makes
grading noisier and turns length into a confound: failures start reflecting how
much the agent wrote rather than what it decided.

Do not let the scenario offer an escape hatch. If the agent can redefine the task
so the tension disappears — declaring the requirement out of scope, solving an
adjacent problem — it will, and the trial grades an unrelated success.

## Design mistakes worth recognizing by name

| Mistake | What it produces | Fix |
|---|---|---|
| Scenario written before the claim | One noisy test mixing adherence, capability, and environment | Name the claim and what varies first |
| No trap | Both conditions pass; delta uninformative | Add the bait the untrained response takes |
| Baseline already at ceiling | Tiny delta, repeated runs stay inconclusive | Pilot first; redesign before spending a full A/B |
| Testing generic competence | The instruction gets credit for capability | Ask whether a baseline agent behaves differently at all |
| Prompt leaks the pattern | Baseline follows the template and scores high | Run the leak checklist |
| Artifact-existence assertions | Passes trivially, proves nothing about behavior | Use a unit test for the artifact |
| Grader chosen for convenience | A string match standing in for a judgment | Match grader to the assertion's nature |
| Structure check standing in for quality | Valid shape, wrong content, green score | Split: code-grade shape, model-grade substance |
| Grading the claim instead of the artifact | "I created the file" scores as creating the file | Check the artifact, not the narration |
| Several behaviors in one scenario | Lift cannot be attributed to anything | One behavior per scenario |
| Single trial trusted | No variance information at all | Enough trials for an interval |
| Easiest aspect chosen over meaningful one | Technically correct answer to the wrong question | Identify how the thing affects behavior, then test that |

## Before running

- [ ] The baseline-failure sentence is written and specific.
- [ ] The leak checklist is clean.
- [ ] Exactly one behavior is under test.
- [ ] Every assertion is settleable from the scenario.
- [ ] A shallow answer and an adversarial answer both fail the graders.
- [ ] `arcforge eval lint <name>` passes, then `arcforge eval preflight <name>`
      confirms the baseline is not already at the ceiling.
