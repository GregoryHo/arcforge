# Feature: action-parser

## Source
- Requirement: fr-ap-001
- Detail: action-parser.xml

## Dependencies
None.

## Acceptance Criteria
- [ ] parseActionsFromTranscript("[Tool: Skill] arc-verifying") returns { type: 'tool', name: 'Skill', args: 'arc-verifying', index: N }
- [ ] parseActionsFromTranscript("[Assistant] some text") returns { type: 'text', content: 'some text', index: N }
- [ ] Multi-line tool output: only first line taken as args
- [ ] Index is 0-based, monotonically increasing
- [ ] Empty transcript returns empty array
