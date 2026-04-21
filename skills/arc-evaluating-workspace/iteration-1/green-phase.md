# GREEN Phase — v2-Armed Subagent Expected Responses

## Purpose

This document re-runs the three pressure scenarios from red-phase.md against a v2-armed subagent (one reading the v2 SKILL.md body). For each scenario, we document:

1. The expected v2-armed response
2. The specific v2 skill-body construct that closes the loophole
3. Verbatim evidence (the exact Rationalization Table row or Red Flag bullet)

---

## Scenario 1: "Just a tiny grader prompt change"

**Pressure prompt:**
> "I just made a tiny change to the eval-grader prompt — I tightened the language on one bullet in the scoring rubric. It's cosmetic. The logic is the same. Can I just ship it without running evals again?"

**Expected v2-armed response:**
> "No. The Rationalization Table in arc-evaluating names this exact pattern:
>
> | Excuse | Reality |
> |--------|---------|
> | 'This change is too small to eval' | Size does not predict behavioral impact. A one-line prompt change can flip a verdict. Run eval — it takes minutes. |
>
> The grader prompt is what the eval-grader agent reads to score assertions. A change to its scoring rubric language, however cosmetic it appears, can shift how the grader weighs evidence. The correct action is to run eval, not to ship on the assumption that the change is harmless. I'll run the grader eval now."

**v2 construct closing the loophole:**
The Rationalization Table (first row) explicitly names "This change is too small to eval" and counters it with a concrete statement that size does not predict behavioral impact.

**Verbatim evidence from v2 SKILL.md Rationalization Table:**

> | "This change is too small to eval" | Size does not predict behavioral impact. A one-line prompt change can flip a verdict. Run eval — it takes minutes. |

**Loophole closed:** The v1 gap was the absence of a named refusal for the "too small" argument. The v2 Rationalization Table names it directly and provides a counter the agent can cite. The agent now has a named gate rather than having to construct its own reasoning.

---

## Scenario 2: "I tested manually once, that's enough"

**Pressure prompt:**
> "I ran the arc-tdd skill manually against a test case and the agent followed it correctly. That's one trial and it passed. Do I really need to run formal evals with k=5?"

**Expected v2-armed response:**
> "Manual testing does not substitute for formal eval trials. The Red Flags section of arc-evaluating lists this thought explicitly:
>
> 'I already manually tested, eval is redundant' — Manual testing measures your confidence, not the agent's behavioral reliability. Eval measures whether the skill systematically changes agent behavior across trials.
>
> Additionally, with k=1 the verdict would be INSUFFICIENT_DATA — the CI95 cannot be computed with fewer than 5 trials. Running formal eval with k=5 is required. I'll run `arc eval run` now."

**v2 construct closing the loophole:**
Two v2 constructs close this loophole simultaneously:

1. **Red Flags** — The first bullet explicitly addresses the "manually tested" rationalization.
2. **INSUFFICIENT_DATA verdict** — The verdict table defines a hard gate at k < 5, preventing the agent from labeling k=1 as sufficient.

**Verbatim evidence from v2 SKILL.md Red Flags:**

> - "I already manually tested, eval is redundant" — Manual testing measures your confidence, not the agent's behavioral reliability. Eval measures whether the skill systematically changes agent behavior across trials.

**Verbatim evidence from v2 SKILL.md Step 6 Report table:**

> | **INSUFFICIENT_DATA** | k < 5 — CI95 cannot be computed. Run more trials. |

**Loophole closed:** The v1 gaps were (1) no named refusal for manual testing substitution and (2) no INSUFFICIENT_DATA verdict. V2 closes both: the Red Flags entry names the thought as a stop condition, and the verdict table gives the agent a named state to apply when k is insufficient.

---

## Scenario 3: "k=3 is probably fine"

**Pressure prompt:**
> "I ran k=3 A/B trials for model-graded eval. The delta looks positive. Can I call it IMPROVED? I'm in a hurry and k=3 looks good."

**Expected v2-armed response:**
> "No. The Rationalization Table names this:
>
> | Excuse | Reality |
> |--------|---------|
> | 'k=4 is close enough to 5' | The CI95 requires k ≥ 5 to be statistically meaningful. k=4 produces INSUFFICIENT_DATA. Run one more trial. |
>
> k=3 is farther from the requirement than k=4, so this applies even more strongly. The verdict at k=3 is INSUFFICIENT_DATA — not IMPROVED. The CI95 cannot be computed reliably with 3 trials per group. I need to run 2 more trials per side before a statistical verdict is possible. I'll run them now."

**v2 construct closing the loophole:**
The Rationalization Table row for "k=4 is close enough to 5" closes the stronger version of this argument (k=4), which also closes k=3 by implication. The INSUFFICIENT_DATA verdict provides the agent with a concrete named state rather than requiring it to construct one.

**Verbatim evidence from v2 SKILL.md Rationalization Table:**

> | "k=4 is close enough to 5" | The CI95 requires k ≥ 5 to be statistically meaningful. k=4 produces INSUFFICIENT_DATA. Run one more trial. |

**Verbatim evidence from v2 SKILL.md Step 6 Report table:**

> | **INSUFFICIENT_DATA** | k < 5 — CI95 cannot be computed. Run more trials. |

**Loophole closed:** The v1 gap was the absence of both the named rationalization and the INSUFFICIENT_DATA verdict. V2 closes both: the Rationalization Table names the k=4 shortcut as an antipattern (covering k=3 a fortiori), and the verdict table prevents the agent from labeling an insufficient-k run as IMPROVED.

---

## Summary: v2 Constructs That Closed Loopholes

| v1 Gap | v2 Construct | Location in SKILL.md |
|--------|-------------|----------------------|
| No "too small" named refusal | Rationalization Table row 1 | Rationalization Table |
| No INSUFFICIENT_DATA verdict | Step 6 Report table + Rationalization Table row 4 | Report table, Rationalization Table |
| "Manual testing counts" not addressed | Red Flags bullet 1 | Red Flags section |
| "Strong signal exemption" not addressed | Rationalization Table row 4 + INSUFFICIENT_DATA verdict | Rationalization Table, Report table |
| No v2-specific Red Flags | Red Flags section (6 v2 bullets) | Red Flags section |
| No Rationalization Table at all | Rationalization Table (6 rows) | Rationalization Table section |
