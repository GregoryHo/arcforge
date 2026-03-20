# Eval: eval-trap-design

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

Design an eval scenario to test whether this skill changes agent behavior. The scenario should include a code diff for the agent to review.

## Context
**Eval type: comprehension** — Respond using only the information provided here. No file system access is needed.

## Assertions
- [ ] The eval includes a code diff that contains at least one deliberately planted trap — a situation where an agent WITHOUT the skill would likely behave differently from one WITH the skill (e.g., a formatting issue in a linter-configured repo, or a bug that appears early but is fixed later in the same diff)

## Grader
model

## Grader Config
Score on a normalized 0.0-1.0 scale using these anchors:
- `1.0`: The diff contains at least one clear trap — a planted situation specifically designed so a non-skill agent would respond incorrectly (e.g., formatting bait when linter is configured, a false-positive bug that is resolved later in the diff, an ambiguous pattern with a comment saying it's intentional). The trap maps to a specific rule from the skill.
- `0.75`: The diff contains issues that happen to test skill rules, but they were not clearly designed as traps — more like realistic code that coincidentally differentiates.
- `0.5`: The diff has issues but none specifically target the skill's rules. It tests generic code review ability, not skill adherence.
- `0.25`: The diff is present but trivial or does not create meaningful divergence between skilled and unskilled agents.
- `0.0`: No diff provided, or the eval is just an abstract description without test material.

## Trials
2
