# Feature: behavioral-assertion-parser

## Source
- Requirement: fr-ba-001
- Detail: behavioral-assertions.xml

## Dependencies
None (parsing only, no action log needed).

## Acceptance Criteria
- [ ] "[tool_called] Skill:arc-verifying" → { operator: 'tool_called', name: 'Skill', pattern: 'arc-verifying' }
- [ ] "[tool_before] Skill:arc-verifying < Skill:arc-finishing-epic" → { operator: 'tool_before', a: {...}, b: {...} }
- [ ] "[tool_count] Bash:npm test >= 2" → { operator: 'tool_count', name: 'Bash', pattern: 'npm test', min: 2 }
- [ ] "[tool_not_called] Bash:git push" → { operator: 'tool_not_called', name: 'Bash', pattern: 'git push' }
- [ ] "[tool_adjacent] A ~ B" → { operator: 'tool_adjacent', a: {...}, b: {...} }
- [ ] "[ ] text assertion" → classified as text (not behavioral)
