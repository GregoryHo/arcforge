# Audit Workflow Reference

The audit workflow governs what happens to eval results after a verdict is reached — specifically, how established claims get promoted to canonical skill knowledge, and how outdated or disproven claims get retired. This document defines the full promotion and retirement arbitration process.

## What Audit Covers

The `arc eval audit` command processes the eval result corpus and surfaces two categories for human review:

1. **Promotion candidates** — `discovered_claims` from grading.json entries where `passed: true` across multiple trials. These are behaviors the eval harness has observed consistently. A promotion candidate has passed the empirical bar but not yet been validated by a human and canonicalized into the skill.

2. **Retirement candidates** — Claims currently in the skill body that the eval corpus contradicts, or `weak_assertions` patterns that indicate the assertion no longer tests meaningful behavior. These require a human to decide whether to remove, revise, or escalate the claim.

## How Promotion Works

Promotion is the process of moving a discovered claim from eval evidence into the skill's canonical instruction set. The steps:

1. **Candidate surfaces** — The audit command identifies a discovered claim with sufficient evidence (passed in 3+ trials, across 2+ distinct scenarios, with no contradicting trials).
2. **Human review** — A human reads the claim text, the supporting evidence, and the scenarios where it appeared. They assess: is this claim generalizable? Is it distinct from existing skill content? Is the evidence reliable?
3. **Arbitration** — If the claim is worth promoting, the human decides where it belongs in the skill body (trigger conditions, routing table, Red Flags, or a reference file). If the claim is narrow or scenario-specific, it may stay as eval evidence rather than being promoted.
4. **Canonicalization** — The human or their agent writes the claim into the skill body and updates the skill version. The promoted claim is marked in the audit log with the commit hash and promotion date.

**Why human-arbitrated?** Automated promotion creates a feedback loop where the skill trains the eval which then expands the skill. Without human review, low-confidence or scenario-specific claims accumulate as canonical instructions, degrading skill precision. The human provides the judgment that distinguishes "this is a generalizable pattern worth teaching" from "this is a coincidence of this scenario's setup."

An agent cannot promote a discovered claim on its own. Doing so bypasses the arbitration step and corrupts the canonical knowledge base. If you observe a compelling claim in the grading output, surface it to the human via `arc eval audit` — do not write it directly into the skill.

## How Retirement Works

Retirement removes or revises claims that are no longer supported by eval evidence. The steps:

1. **Candidate surfaces** — The audit command identifies claims in the skill body that consistently appear as `weak_assertions` entries, or where the eval corpus shows the opposite behavior from what the claim predicts.
2. **Human review** — A human assesses: is the weak assertion pattern a scenario design problem, or does it indicate the claim is incorrect or obsolete? Is the contradiction consistent across multiple scenarios and models?
3. **Arbitration** — If the claim is wrong or outdated, the human revises or removes it. If the weak assertion pattern is a scenario quality issue, the human redesigns the scenario rather than retiring the claim.
4. **Canonicalization** — The human or their agent removes or revises the claim in the skill body and logs the retirement decision.

**Why human-arbitrated?** Automated retirement risks removing valid skill content because a poorly designed scenario produced weak assertions. The human distinguishes "this scenario doesn't test the claim well" from "this claim is wrong." Retiring a valid claim because one scenario underperformed is a false negative that degrades the skill without cause.

## Why Audit Is Not Automatic

The audit workflow is human-arbitrated rather than automated for three reasons:

**1. Generalizability requires judgment.** A discovered claim that passes 5 trials in one scenario may not generalize. A human can read the scenario context and assess whether the behavior reflects a real skill effect or a scenario-specific artifact.

**2. Claims interact.** Promoting one claim can make another redundant, or create ambiguity when both apply. A human reads the full skill body when adding a claim; an automated system would add claims in isolation.

**3. Retirement requires domain knowledge.** Deciding whether a weak assertion is a scenario design problem or a genuine claim failure requires understanding both the scenario and the skill's intent. This is judgment that the eval harness cannot replicate.

## Operational Notes

- Run `arc eval audit` to generate the current promotion and retirement candidate lists.
- Audit reads from `evals/benchmarks/latest.json` and the grading.json entries in `evals/results/`.
- Promotion candidates appear with their evidence count, scenario list, and claim text.
- Retirement candidates appear with the `weak_assertions` pattern summary and the contradicting trial count.
- The audit output is a review document, not an action — a human must take action based on it.
- After promotion or retirement, run `arc eval run` to verify the updated skill still passes its evals before committing.

## Relationship to the Grader Output

The audit workflow consumes two grader output fields (see **REQUIRED BACKGROUND:** references/grading-and-execution.md for their schemas):

- `discovered_claims[]` — behaviors observed during grading, categorized as factual, process, or quality. Promotion candidates come from `discovered_claims` where `passed: true`.
- `weak_assertions[]` — assertions flagged during grading as poorly designed, ambiguous, or non-discriminative. Retirement candidates come from patterns across `weak_assertions`.

Both fields are populated by the eval-grader agent during the grading phase. They accumulate across trials and scenarios into the audit-visible corpus.
