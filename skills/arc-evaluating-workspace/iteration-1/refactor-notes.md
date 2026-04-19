# Refactor Notes — Iteration 1

## Purpose

This document records any new rationalizations or Red Flags discovered during the GREEN phase that required additions or updates to the Rationalization Table or Red Flags section.

## Discoveries from GREEN Phase

### 1. "Strong signal exemption" is a distinct rationalization

During Scenario 3 analysis, we identified a rationalization that goes beyond "k=4 is close enough to 5" — the argument that a large-looking delta justifies overriding the k requirement. This is a distinct failure mode:

- The agent observes a large point estimate for delta (e.g., 0.4)
- The agent reasons: "the delta is so large it would survive any CI correction"
- This reasoning is wrong because model-graded evals have high variance, and a k=3 sample with large delta can flip on k=4 or k=5

**Judgment call:** The current Rationalization Table row for "k=4 is close enough to 5" implicitly covers this by stating that INSUFFICIENT_DATA is the verdict regardless of the delta size. No new row is needed — the existing row's counter ("k=4 produces INSUFFICIENT_DATA. Run one more trial.") does not leave room for the strong-signal exemption.

**No table update required.**

### 2. "Manual testing is a form of eval" — edge case

During Scenario 2 analysis, we considered whether to add a Rationalization Table row specifically for manual testing. The current Red Flags bullet addresses the failure thought: "I already manually tested, eval is redundant." The Rationalization Table is for structured excuses with counters; Red Flags is for failure thoughts with a stop directive. The manual testing case fits better in Red Flags because it typically surfaces as an internal thought rather than an explicit argument.

**Judgment call:** The Red Flags placement is correct. If this rationalization were to surface as an explicit argument (e.g., "manual testing counts as a trial"), a Rationalization Table row would be appropriate. For now, the Red Flags entry is sufficient.

**No table update required.** Monitoring: if this rationalization appears in eval corpus weak_assertions, add a dedicated row.

### 3. "INSUFFICIENT_DATA is advisory" — confirmed as table row

During Scenario 2 and 3 analysis, both involved the agent treating INSUFFICIENT_DATA as soft guidance rather than a hard gate. The Rationalization Table row 5 ("INSUFFICIENT_DATA is advisory, I'll ship anyway") directly closes this. The counter is "INSUFFICIENT_DATA means you have no valid statistical basis for a verdict. Shipping on INSUFFICIENT_DATA is shipping blind."

This was correctly anticipated during the v2 SKILL.md rewrite. No update needed.

**No table update required.**

## Rationalization Table Row Count

Final count: 6 rows. All 6 required v2 excuses are covered:
1. "This change is too small to eval" — row 1
2. "Time pressure, ship now eval later" — row 2
3. "Preflight blocks, just skip it once" — row 3
4. "k=4 is close enough to 5" — row 4
5. "INSUFFICIENT_DATA is advisory, I'll ship anyway" — row 5
6. "The grader raised weak_assertions but the pass rate is fine" — row 6

## Red Flags Bullet Count

Final count: 6 bullets. All 6 required v2 failure thoughts are covered:
1. "I already manually tested, eval is redundant" — bullet 1
2. "This is docs-only, no eval needed" — bullet 2
3. "The INSUFFICIENT_DATA banner is just a warning" — bullet 3
4. "I can promote the discovered claim on my own without audit" — bullet 4
5. "The blind comparator disagreed but assertions passed so it's fine" — bullet 5
6. "Preflight is new, I'll skip it this time and backfill later" — bullet 6

## Word Count Status

v2 SKILL.md: 1671 words (≤ 1800 requirement met).

The body reduction (from 2082 to 1671 words) was achieved by:
- Moving the detailed scenario validity preflight section to references/preflight.md
- Moving the full verdict semantics to references/verdict-policy.md
- Moving the "When to Step Back" section content into references guidance
- Condensing the "Question First" table from 4 columns to 4 columns but removing the "What Stays Fixed" column
- Removing the dot-graph diagram (redundant with the prose trigger conditions)
- Moving extended isolation mechanics to references/grading-and-execution.md

No functional decision-making content was lost — all externalizations went to reference files that the skill body explicitly points to.
