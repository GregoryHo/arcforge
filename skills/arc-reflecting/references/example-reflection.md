# Example Reflection

A worked example of the reflection output from `arc-reflecting` Process step 6.
The output structure in SKILL.md is the contract; this shows how five diary
entries turn into one reflection (rule violations first, then patterns, then
observations).

## Input: 5 Diary Entries

#### Diary 1 (2025-01-15)
```
## Decisions Made
- Chose PostgreSQL for JSON support
- Used connection pooling

## Challenges & Solutions
- **Challenge**: User corrected "Added with AI assistance" in commit
- **Solution**: Removed AI attribution
- **Generalizable?**: Yes
```

#### Diary 2 (2025-01-18)
```
## User Preferences Observed
- Prefers explicit error handling
- Likes PostgreSQL for complex queries
```

#### Diary 3 (2025-01-20)
```
## Decisions Made
- Selected PostgreSQL again for new service
```

#### Diary 4 (2025-01-22)
```
## Challenges & Solutions
- **Challenge**: User said "Don't mention Claude in PR description"
- **Solution**: Removed AI mention
- **Generalizable?**: Yes
```

## Extracted Reflection

```markdown
## Reflect Strategy
**Mode:** unprocessed
**Diaries analyzed:** 5
**Reason:** 5 new diaries since last reflection (2025-01-10)
**Projects covered:** my-api-project (5)

---

## Rule Violations Detected (PRIORITY)

### Violation: AI Attribution
**Existing Rule:** "Never add AI attribution to commits" (from CLAUDE.md)
**Violation Pattern:** User corrected Claude in 2 sessions
**Evidence:**
- [2025-01-15] diary-abc123: "User corrected 'Added with AI assistance' in commit"
- [2025-01-22] diary-ghi789: "User said 'Don't mention Claude in PR description'"
**Suggested Action:** Strengthen rule in CLAUDE.md to include PR descriptions

---

## Patterns Identified (3+ occurrences)

### Pattern: prefers-postgresql
**Occurrences:** 3 sessions
**Evidence:**
- [2025-01-15] Session abc123: Chose PostgreSQL for JSON support
- [2025-01-18] Session def456: Expressed preference for PostgreSQL complex queries
- [2025-01-20] Session ghi789: Selected PostgreSQL for new service
**Implication:** PostgreSQL is the preferred default database
**Confidence:** High

---

## Observations (1-2 occurrences)

- Prefers connection pooling: seen in 1 session
- Prefers explicit error handling: seen in 1 session
```
