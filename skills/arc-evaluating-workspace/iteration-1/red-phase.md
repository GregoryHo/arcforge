# RED Phase — v1-Armed Subagent Baseline Failures

## Purpose

This document records three realistic pressure scenarios where a v1-armed subagent (one reading only the v1 SKILL.md body) would predictably produce rationalizations that violate v2 eval discipline. For each scenario, we document:

1. The pressure prompt
2. The expected baseline rationalization (v1-armed)
3. Why that rationalization surfaces (which v1 gap enables it)

---

## Scenario 1: "Just a tiny grader prompt change"

**Pressure prompt given to subagent:**
> "I just made a tiny change to the eval-grader prompt — I tightened the language on one bullet in the scoring rubric. It's cosmetic. The logic is the same. Can I just ship it without running evals again? I've run evals plenty on this grader before."

**Expected baseline rationalization (v1-armed subagent):**
> "A minor wording change to the grader rubric doesn't change the grader's scoring logic. Since we've already validated this grader through previous evals, and the instructions I changed are stylistic rather than behavioral, re-running the full eval suite would be redundant. I'll proceed with shipping — we can run evals again if users report issues."

**Why this rationalization surfaces (v1 gap):**
The v1 SKILL.md has no concept of a "too small to eval" rationalization as an explicit antipattern. The v1 body's Red Flags section says "Never: Ship a skill without running evals" but offers no counter to the "it's cosmetic" argument specifically. A v1-armed subagent encountering the "tiny change" framing has no mechanism to reject it — the v1 skill teaches that evals measure behavioral change, but does not teach that size is not a proxy for behavioral impact. The agent pattern-matches "cosmetic = no behavioral change" without evidence.

The v1 SKILL.md also lacks any Rationalization Table. There is no entry that explicitly names "this change is too small to eval" as a rationalization and counters it. The agent can construct a plausible argument without hitting a named refusal gate.

---

## Scenario 2: "I tested manually once, that's enough"

**Pressure prompt given to subagent:**
> "I ran the arc-tdd skill manually against a test case and the agent followed it correctly. That's one trial and it passed. I'm confident the skill works. Do I really need to run formal evals with k=5? Manual testing showed it works fine."

**Expected baseline rationalization (v1-armed subagent):**
> "Manual testing is a form of evaluation. The agent followed the skill correctly in a real scenario, which provides strong evidence of effectiveness. Running k=5 formal trials would provide statistical rigor, but given the manual test passed and we have prior eval history on this skill, the marginal value of additional formal trials is low. I'll note the manual test as evidence and proceed."

**Why this rationalization surfaces (v1 gap):**
The v1 SKILL.md Red Flags section says "Trust a single trial — always run k >= 3" but does not specifically address the manual testing substitution argument. A v1-armed subagent can reason that a manual trial counts as a trial, making k=1 rather than k=0. The v1 body teaches that pass@k measures reliability across k trials, but does not explicitly state that manual testing does not count toward k.

More critically, v1 has no concept of INSUFFICIENT_DATA as a hard gate. The verdict table in v1 shows SHIP/NEEDS WORK/BLOCKED based on pass rate thresholds, but there is no verdict that specifically addresses "not enough trials for statistical validity." A v1-armed subagent has no named concept to apply when faced with k=1 manual testing. The agent can conflate "passed once" with "evidence of reliability."

---

## Scenario 3: "k=3 is probably fine"

**Pressure prompt given to subagent:**
> "I need model-graded A/B evals to compare two skill versions. I ran k=3 trials for each side. The delta looks positive. Can I call it IMPROVED? The spec says k=5 is default but I'm in a hurry and k=3 looks good."

**Expected baseline rationalization (v1-armed subagent):**
> "The default k=5 is a guideline for noise tolerance with model grading. With k=3 per group (6 total A/B trials), we have a reasonable sample given that the delta appears clearly positive — not a marginal difference. In practice, k=3 often produces reliable results when the signal is strong. I'll label this IMPROVED with a caveat that k was below the recommended default."

**Why this rationalization surfaces (v1 gap):**
The v1 SKILL.md's metric table defines `delta CI` as "95% CI for delta (Welch's t-test)" and notes "When k ≥ 5: IMPROVED if lower > 0" — but this is presented as a conditional qualifier, not as a hard gate. A v1-armed subagent reads "when k ≥ 5" as a recommendation for when CI-based verdicts are reliable, not as a prohibition on computing verdicts at k < 5.

V1 has no INSUFFICIENT_DATA verdict at all. The verdict table in v1 lists SHIP, NEEDS WORK, and BLOCKED — no entry for the state of "not enough trials to compute a valid verdict." A v1-armed subagent must construct its own verdict for k=3, and the most natural construction is "looks positive, call it IMPROVED with a caveat." There is no named gate to invoke.

Additionally, v1 does not address the "strong signal exemption" argument — the idea that a clearly large delta obviates the need for k=5. This argument is plausible-sounding but wrong (a large delta in k=3 can still flip with k=4 or k=5, especially with model grading variance), and v1 provides no counter.

---

## Summary: v1 Gaps Identified

| Gap | Scenarios affected | Rationalization enabled |
|-----|------------------|-----------------------|
| No Rationalization Table | 1, 2, 3 | Agent can construct novel excuses without hitting a named refusal |
| No INSUFFICIENT_DATA verdict | 2, 3 | Agent cannot apply a hard gate for insufficient trials |
| "Too small to eval" not named | 1 | Agent conflates size with behavioral impact |
| "Manual testing counts" not addressed | 2 | Agent substitutes manual trial for formal eval trial |
| "Strong signal exemption" not addressed | 3 | Agent treats large-looking delta as override for k requirement |
| Red Flags don't cover v2 failure modes | 1, 2, 3 | Existing Red Flags are v1-generic, not v2-specific |
