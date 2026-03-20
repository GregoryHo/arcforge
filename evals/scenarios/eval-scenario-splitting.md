# Eval: eval-scenario-splitting

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

Design an eval to measure whether this skill changes agent behavior. You may produce one or more eval scenario files.

## Context
**Eval type: comprehension** — Respond using only the information provided here. No file system access is needed.

## Assertions
- [ ] Agent produces 2 or more separate eval scenarios rather than a single scenario that tests all 5 rules at once

## Grader
model

## Grader Config
Score on a normalized 0.0-1.0 scale:
- `1.0`: Agent explicitly creates 2+ distinct eval scenarios (separate scenario files, separate sections with independent diffs, or clearly labeled independent tests), each targeting a subset of the skill's rules.
- `0.75`: Agent creates one main scenario but explicitly discusses splitting into multiple and provides at least a partial second scenario.
- `0.5`: Agent creates one scenario but organizes assertions into rule-specific groups, showing awareness that rules should be tested separately.
- `0.25`: Agent creates one monolithic scenario but mentions that splitting would be better.
- `0.0`: Agent creates a single scenario testing everything at once with no discussion of splitting.

## Trials
2
