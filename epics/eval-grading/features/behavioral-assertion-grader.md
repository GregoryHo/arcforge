# Feature: behavioral-assertion-grader

## Source
- Requirement: fr-ba-002
- Detail: behavioral-assertions.xml

## Dependencies
- behavioral-assertion-parser (needs parsed assertions)
- eval-core/action-parser (needs action log)

## Acceptance Criteria
- [ ] tool_called: 1 if any action matches name + args substring, 0 otherwise
- [ ] tool_not_called: 1 if NO action matches, 0 if any match found
- [ ] tool_before: compares first occurrence, 1 if A.index < B.index, 0 if A/B missing or A >= B
- [ ] tool_count: 1 if match count >= min, 0 otherwise
- [ ] tool_adjacent: 1 if A and B exist with no tool actions between them, 0 otherwise
- [ ] All grading completes without LLM API calls
