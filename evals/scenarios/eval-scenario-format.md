# Eval: eval-scenario-format

## Scope
skill

## Scenario
Here is a skill that teaches AI agents to follow a specific code review methodology:

```markdown
# Code Review Skill

When reviewing code, follow these steps:
1. Read the diff completely before commenting
2. Categorize issues: bug, style, performance, security
3. Prioritize: only flag issues with confidence > 80%
4. For each issue, suggest a concrete fix
5. Never nitpick formatting if a linter is configured
```

Design an eval to measure whether this skill actually changes agent behavior. Produce a complete eval scenario file that could be used to run the evaluation.

## Context
**Eval type: comprehension** — Respond using only the information provided here. No file system access is needed.

## Assertions
- [ ] Task concreteness: the eval gives the tested agent a specific, unambiguous task (e.g., a real diff to review with planted issues, not just "review some code")
- [ ] Criteria measurability: success criteria are specific enough to judge pass/fail without subjective interpretation (e.g., "identifies the SQL injection" vs "finds important issues")
- [ ] Discriminative power: the eval is designed so that an agent WITH the skill would behave differently from one WITHOUT — there are traps or challenges that specifically test the skill's rules
- [ ] Coverage: the eval tests multiple rules from the skill, not just one aspect
- [ ] Grading precision: scoring criteria distinguish degrees of quality, not just binary pass/fail (e.g., partial credit for identifying an issue but missing the category)
- [ ] Operational completeness: the eval is self-contained enough that someone could actually run it (has the test material, criteria, and method — not just an abstract description)

## Grader
model

## Grader Config
Score each assertion on a normalized 0.0-1.0 scale. Prefer these anchors:
- `0.0` = not met
- `0.25` = weak / minimal evidence
- `0.5` = partially met
- `0.75` = mostly met
- `1.0` = fully met

1. Task concreteness: `0.0` = no concrete task, `0.25` = mentions "review code" but no specific input, `0.5` = provides a diff but issues are not specifically planted, `0.75` = provides a diff with deliberately planted issues, `1.0` = diff has issues carefully mapped to each skill rule with clear expected vs naive behavior.

2. Criteria measurability: `0.0` = no criteria, `0.25` = vague ("does a good job"), `0.5` = somewhat specific but still subjective ("provides helpful feedback"), `0.75` = specific and verifiable ("identifies the SQL injection"), `1.0` = each criterion has explicit pass and fail conditions with examples.

3. Discriminative power: `0.0` = tests generic ability unrelated to skill, `0.25` = tests code review but doesn't target specific skill rules, `0.5` = targets some skill rules but without traps, `0.75` = has traps where non-skill agent would fail (e.g., formatting bait when linter is configured), `1.0` = every scenario is a deliberate trap mapping to a specific skill rule.

4. Coverage: `0.0` = tests nothing from the skill, `0.25` = tests 1 of 5 rules, `0.5` = tests 2-3 rules, `0.75` = tests 4 rules, `1.0` = tests all 5 rules.

5. Grading precision: `0.0` = no scoring criteria, `0.25` = binary pass/fail only, `0.5` = has partial credit but criteria are vague, `0.75` = clear multi-level scoring with defined thresholds, `1.0` = per-assertion scoring with explicit examples for each level.

6. Operational completeness: `0.0` = abstract description only, `0.25` = describes what to test but no test materials, `0.5` = has test materials but missing grading method or trial count, `0.75` = mostly runnable but missing some details, `1.0` = fully self-contained — someone could copy-paste and run it immediately.

Report the final score as the average of the 6 normalized scores. Set passed=true only if average >= 0.8.

## Trials
2
