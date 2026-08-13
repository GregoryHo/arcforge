## Summary

<!-- What does this PR do and why? -->

## Type

- [ ] Skill
- [ ] CLI Engine
- [ ] Hook
- [ ] Template
- [ ] Command
- [ ] Agent
- [ ] Test
- [ ] Docs

## Iron Law Compliance (Skills Only)

<!-- If this PR adds or modifies a skill, you MUST complete this section. -->

**RED (Baseline):**
<!-- What behavior did you observe without the skill? What rationalizations did agents use? -->

**GREEN (Skill Applied):**
<!-- How does the skill address those specific failures? -->

**REFACTOR (Loopholes Closed):**
<!-- What new rationalizations did you find and counter? -->

**Baseline provenance:**
<!-- Where was the RED baseline observed? A baseline can go stale when the model or harness changes, so record it. -->
- Model + version:
- Harness + version:
- Eval scenario ID + k (if an A/B eval was run):

## Testing

- [ ] `npm test` passes (all 5 runners)
- [ ] New tests added for new functionality
- [ ] Tested on Claude Code (primary platform)

## Conventions

- [ ] Follows naming conventions (`arc-<gerund>[-<object>]` for skills)
- [ ] No sensitive information (API keys, tokens, local paths)
- [ ] Description starts with "Use when..." (skills only)
- [ ] No workflow summary in description field (skills only)
- [ ] Cross-references use `**REQUIRED BACKGROUND:**` syntax (not @-file)
