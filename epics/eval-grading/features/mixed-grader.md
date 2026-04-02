# Feature: mixed-grader

## Source
- Requirement: fr-mg-001
- Detail: mixed-grading.xml

## Dependencies
- behavioral-assertion-grader (needs behavioral scoring)

## Acceptance Criteria
- [ ] [tool_*] assertions go to code grader, [ ] assertions go to model grader
- [ ] Behavioral scores: 0 or 1 (binary)
- [ ] Model scores: >= 0.8 maps to 1, < 0.8 maps to 0
- [ ] Combined score = pass_count / total_count. Trial passes if >= 0.8
- [ ] 0 behavioral assertions → pure model grading
- [ ] 0 text assertions → pure code grading
- [ ] Per-assertion scores preserved in result for dashboard
