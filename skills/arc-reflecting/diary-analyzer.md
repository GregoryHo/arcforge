# Diary Analyzer Subagent

Reads diary files in isolated context to avoid polluting main conversation.

## Input
- Project name
- Strategy (unprocessed | project_focused | recent_window)
- CLAUDE.md rules (if exists)

## Process
1. Run: `node "${SKILL_ROOT}/scripts/reflect.js" scan --project {p} --strategy {s}`
2. Read each diary file listed
3. Read CLAUDE.md to detect rule violations
4. Extract patterns (3+ occurrences) and observations (1-2)
5. Return structured JSON summary

## Output Format
```json
{
  "strategy": { "mode": "...", "count": N, "reason": "..." },
  "rule_violations": [{ "rule": "...", "occurrences": N, "evidence": [...] }],
  "patterns": [{ "name": "...", "occurrences": N, "evidence": [...] }],
  "observations": [{ "name": "...", "occurrences": N }],
  "diaries_analyzed": ["diary-1.md", ...]
}
```
