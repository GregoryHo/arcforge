---
name: arc-reflecting
description: Use when user requests /reflect, after 5+ diary entries accumulated, or when asked to summarize preferences from past sessions
---

# Diary Reflection & Pattern Extraction

## Overview

Analyze multiple diary entries to identify recurring patterns. Save insights to `~/.claude/diaryed/` for user review.

## Quick Reference

| Task | Command |
|------|---------|
| **Determine strategy** | `node "${SKILL_ROOT}/scripts/reflect.js" strategy --project {project}` |
| **Scan diaries** | `node "${SKILL_ROOT}/scripts/reflect.js" scan --project {p} --strategy {s}` |
| **Update log** | `node "${SKILL_ROOT}/scripts/reflect.js" update-log --project {p} --diaries "{f}" --reflection "{id}"` |
| **Pattern threshold** | 3+ occurrences = Pattern, 1-2 = Observation |
| **Rule violations** | Check CLAUDE.md first, report violations with evidence |
| **Strategy modes** | unprocessed (5+ new) \| project_focused (5+ total) \| recent_window (fallback) |

## Infrastructure Commands

Node.js utilities handle diary scanning and processed.log management.

**Set SKILL_ROOT** from skill loader header (`# SKILL_ROOT: ...`):
```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-reflecting}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
```

**Determine strategy (auto-detect):**
```bash
node "${SKILL_ROOT}/scripts/reflect.js" strategy --project {project}
# Returns: unprocessed | project_focused | recent_window
```

**Scan for diaries:**
```bash
node "${SKILL_ROOT}/scripts/reflect.js" scan \
  --project {project} \
  --strategy unprocessed
# Returns: List of unprocessed diary file paths
```

**Update processed.log after reflection:**
```bash
node "${SKILL_ROOT}/scripts/reflect.js" update-log \
  --project {project} \
  --diaries "diary-1.md,diary-2.md,diary-3.md" \
  --reflection "2026-01-reflection-2.md"
```

## Subagent for Diary Analysis

For large diary sets, use the diary-analyzer subagent (see `diary-analyzer.md`) to read diaries in an isolated context without polluting the main conversation.

**Key distinction from /learn:**
- `/learn` → `~/.claude/skills/learned/` (auto-loaded by Claude)
- `/reflect` → `~/.claude/diaryed/` (user reviews manually)

**Core principle:** Patterns must appear 3+ times across diary entries to be considered "Pattern". 1-2 occurrences are labeled "Observation".

## When to Use

- User runs `/reflect`
- 5+ diary entries accumulated
- User asks "what have I learned?" or "show me patterns"
- User wants to review preferences across sessions

## When NOT to Use

- Fewer than 3 diary entries exist
- User wants patterns auto-loaded (use /learn instead)
- Single-session insights (use /diary instead)
- No meaningful patterns found

## Storage

```
~/.claude/diaryed/
├── global/                              # Cross-project patterns
│   ├── processed.log                    # Tracks which diaries were processed
│   └── prefers-explicit-errors.md
└── {project}/                           # Project-specific patterns
    ├── processed.log                    # Per-project tracking (no cross-pollution)
    └── architecture-decisions.md
```

**processed.log format:**
```
# processed.log for {project}
# Format: diary_filename | processed_date | reflection_filename

diary-abc123.md | 2025-01-24 | 2025-01-reflection-1.md
diary-def456.md | 2025-01-24 | 2025-01-reflection-1.md
```

**NOT auto-loaded by Claude.** User must manually review and optionally move to learned skills.

## Process

### 1. Smart Filter Selection (Auto)

Before reading diaries, determine the optimal filtering strategy:

```
Strategy Selection Algorithm:
┌─────────────────────────────────────────────────────────────┐
│ 1. Check processed.log for project                         │
│ 2. Count unprocessed diaries                                │
│                                                             │
│ IF unprocessed >= 5:                                        │
│   → Mode: "unprocessed" - analyze only new diaries          │
│ ELIF current_project has 5+ total diaries:                  │
│   → Mode: "project_focused" - analyze project diaries       │
│ ELSE:                                                       │
│   → Mode: "recent_window" - analyze recent 10 diaries       │
└─────────────────────────────────────────────────────────────┘
```

Output the strategy header at start of reflection:
```markdown
## Reflect Strategy
**Mode:** {unprocessed|project_focused|recent_window}
**Diaries analyzed:** {count}
**Reason:** {why this mode was selected}
**Projects covered:** {project} (count), ...
```

### 2. Locate Diary Entries

Search for diary files:
```
~/.claude/sessions/{project}/*/diary-*.md
```

Count entries. If fewer than 3:
> "Found only X diary entries. Run more sessions with /diary before reflecting."

### 3. Read CLAUDE.md Rules (if exists)

Before analyzing diaries, read the project's CLAUDE.md to:
- Extract existing rules and conventions
- Enable detection of rule violations in diary entries

This enables the skill to detect when diaries show user corrections for breaking existing rules.

### 4. Read and Analyze Diaries

Read each diary entry. Look for:
- Repeated decisions
- Consistent preferences
- Recurring challenges (and solutions if marked Generalizable)
- Common techniques
- **Rule violations:** Cases where user corrected Claude for breaking a CLAUDE.md rule

### 5. Identify Patterns and Violations

**Pattern threshold (3+ occurrences):** A pattern MUST appear in 3+ diary entries to be labeled "Pattern".

**Observation (1-2 occurrences):** Noted but not promoted to pattern status.

For each potential pattern, track:
- Which diary entries contain it
- How it manifested each time
- Whether it's a preference, technique, or decision

For rule violations, track:
- Which CLAUDE.md rule was violated
- Which diary entries show user corrections
- Specific correction quotes as evidence

### 6. Draft Reflection Output

Use this structure (with strategy header from step 1):

```markdown
## Reflect Strategy
**Mode:** {mode}
**Diaries analyzed:** {count}
**Reason:** {reason}
**Projects covered:** {list}

---

## Rule Violations Detected (PRIORITY)

### Violation: {rule-name}
**Existing Rule:** "{quoted from CLAUDE.md}"
**Violation Pattern:** User corrected Claude in N sessions
**Evidence:**
- [YYYY-MM-DD] diary-{id}: "{correction quote}"
- [YYYY-MM-DD] diary-{id}: "{correction quote}"
**Suggested Action:** Strengthen rule in CLAUDE.md (user decides)

---

## Patterns Identified (3+ occurrences)

### Pattern: {pattern-name}
**Occurrences:** N sessions
**Evidence:**
- [YYYY-MM-DD] Session {id}: {how it appeared}
- [YYYY-MM-DD] Session {id}: {how it appeared}
**Implication:** {what this suggests}
**Confidence:** High/Medium

---

## Observations (1-2 occurrences)

- {observation}: seen in {N} session(s)
```

**Note:** Rule violations appear FIRST (priority) before patterns.

### 7. Present for User Approval

**NEVER auto-save.** Present the draft and ask:

> "I found these patterns/violations across X diary entries. Should I save this reflection?"
> - **Save to diaryed/** - For patterns to review later
> - **Promote to learned/** - For patterns to auto-load (use /learn instead)
> - **Skip** - Don't save

For rule violations, additionally ask:
> "These rule violations suggest strengthening CLAUDE.md. Would you like to update those rules?"

### 8. Save and Update processed.log

If approved for diaryed:
1. Ensure `~/.claude/diaryed/{project}/` or `~/.claude/diaryed/global/` exists
2. Write the reflection markdown file (e.g., `YYYY-MM-reflection-N.md`)
3. **Update processed.log** with each diary that was analyzed:
   ```
   diary-abc123.md | 2025-01-24 | 2025-01-reflection-1.md
   ```
4. Confirm save location and processed.log update

## Key Principles

### Evidence-Based Only
Every pattern MUST cite specific diary entries as evidence. No patterns based on general assumptions.

### User Controls Output
NEVER auto-save. User reviews and approves before saving.

### Non-Prescriptive
Insights are observations, not rules. User decides how to act on them.

### Separate from Learn
Diaryed patterns are for reflection. If user wants auto-loading, redirect to /learn.

## Common Mistakes

### Extracting Patterns from Few Entries
**Wrong:** "You mentioned preferring TypeScript twice" → calling it a Pattern
**Right:** 1-2 occurrences = Observation, 3+ occurrences = Pattern

### Not Citing Evidence
**Wrong:** "You seem to prefer X"
**Right:** "Based on sessions from Jan 15 and Jan 20, you consistently chose X"

### Auto-Saving Without Approval
**Wrong:** Saving patterns automatically
**Right:** Present draft, wait for explicit approval

### Confusing with /learn
**Wrong:** Putting reusable techniques here
**Right:** Observations go to diaryed; techniques go to learned

### Making Prescriptive Rules
**Wrong:** "You should always use TypeScript"
**Right:** "Observed: Chose TypeScript in 4/5 new projects"

### Skipping processed.log Update
**Wrong:** Saving reflection but not updating processed.log
**Right:** Always append processed diary filenames to log after save

### Auto-Updating CLAUDE.md
**Wrong:** Automatically updating CLAUDE.md when violations found
**Right:** Report violations and ask user if they want to update rules

### Ignoring Strategy Header
**Wrong:** Starting reflection without showing the filtering strategy
**Right:** Always output strategy header (Mode, Diaries, Reason, Projects)

## Example Output

### Input: 5 Diary Entries

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

### Extracted Reflection

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

## Red Flags - DO NOT Extract as Pattern

- Pattern based on fewer than 3 diary entries (use "Observation" label instead)
- No specific diary citations
- Prescriptive language ("always do X")
- Already extracted in previous reflect session (check processed.log)
- Belongs in learned skills (reusable technique)
- Auto-updating CLAUDE.md without user approval
