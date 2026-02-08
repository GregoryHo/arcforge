---
name: arc-journaling
description: Use when user explicitly requests /diary, when PreCompact hook triggers, or at end of significant work session
---

# Session Diary Capture

## Overview

Capture session reflections as structured diary entries for future reference.

## Quick Reference

| Task | Command |
|------|---------|
| **Get diary path** | `node "${SKILL_ROOT}/scripts/diary.js" path --project {p} --date {d} --session {s}` |
| **Save diary** | `node "${SKILL_ROOT}/scripts/diary.js" save --project {p} --date {d} --session {s} --content "{content}"` |
| **Key principle** | Reflect from memory, NOT by reading files |
| **Permission** | NEVER auto-save - always ask first |
| **Template location** | See "Template" section below |

## Infrastructure Commands

Node.js utilities handle file paths and directory creation. Optional but recommended.

**Set SKILL_ROOT** from skill loader header (`# SKILL_ROOT: ...`):
```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-journaling}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
```

**Save diary to correct location:**
```bash
node "${SKILL_ROOT}/scripts/diary.js" save \
  --project {project} \
  --date {YYYY-MM-DD} \
  --session {sessionId} \
  --content "{diary_content}"
```

**Verify path (for debugging):**
```bash
node "${SKILL_ROOT}/scripts/diary.js" path \
  --project {project} \
  --date {YYYY-MM-DD} \
  --session {sessionId}
```

**Core distinction:**

- **Diary = observations, context, decisions made** (stored in session directory)
- **Learn = reusable patterns** (stored in learned skills)

**Storage:** `~/.claude/sessions/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`

## Pre-Diary Check (Noise Gate)

Before creating a diary entry, verify at least ONE of these criteria is met:

- **Non-trivial decision** was made (architecture, tool choice, approach)
- **Challenge was solved** (debugging, workaround found)
- **User preference was expressed** (explicit or implicit)
- **Technique was discovered** (new pattern, integration insight)

**Auto-skip these sessions** (no diary needed):
- Pure Q&A (answering questions without making changes)
- Retrying the same operation (build failures, test reruns)
- Pure exploration (reading files without decisions)
- Trivial fixes (typos, formatting, single-line changes)

This is a **soft gate**: Claude judges based on conversation memory. User can always override with explicit `/diary`.

## When to Use

- User runs `/diary`
- PreCompact hook triggers (conversation getting long)
- End of significant work session
- After important design decisions
- When user says "remember this" or "note this down"

## When NOT to Use

- Quick Q&A sessions (< 5 tool calls)
- Pure research without decisions
- Already captured in previous diary entry this session
- Pattern extraction needed (use /learn instead)
- **Fails Pre-Diary Check** — unless user explicitly requests

## Process

### 1. Reflect on Conversation (Context-First)

Review the conversation from memory. **DO NOT read files to gather context.**

Ask yourself:

- What decisions were made and why?
- What preferences did the user express?
- What worked well? What didn't?
- What context would help next session?

### 2. Fill Template Sections

Use this diary template:

```markdown
# Session Diary: {project}

**Date:** {YYYY-MM-DD}
**Session ID:** {sessionId}

## Decisions Made

- [Decision]: [Rationale]

## User Preferences Observed

- [Preference observed]

## What Worked Well

- [Technique or approach that succeeded]

## Challenges & Solutions

- **Challenge**: [What went wrong]
- **Solution**: [How resolved]
- **Generalizable?**: [Yes/No - pre-flags for /learn]

## PR/Review Feedback (if any)

- [Feedback]: [Action taken]

## Context for Next Session

- [Key context to remember]

---

_Captured at {timestamp}_
```

### 3. Save to Session Directory

1. Ensure session directory exists
2. Write to `~/.claude/sessions/{project}/{date}/diary-{sessionId}.md`
3. Confirm save location with path

### 4. Offer Follow-up

After saving, briefly mention:

> "Diary saved. If you noticed reusable patterns, run `/learn` to extract them."

## Key Principles

### Observation Over Prescription

Record what happened, not rules. Patterns that should become rules belong in `/learn`.

### User Intent Over Implementation

Focus on WHY decisions were made, not just WHAT was done.

### Minimal Effort

Keep entries focused. Don't over-document routine work.

## Common Mistakes

### Reading Files for Context

**Wrong:** Reading project files to "understand" what to write
**Right:** Reflect on conversation memory only

### Capturing Implementation Details

**Wrong:** "Changed line 42 of app.js to use const"
**Right:** "Decided to prefer const over let for immutability"

### Creating Diary for Trivial Sessions

**Wrong:** Diary for "fixed a typo" session
**Right:** Skip diary, or note "No significant reflections this session"

### Duplicating Learn Content

**Wrong:** Same pattern in both diary and learned skill
**Right:** Diary captures context; learn extracts reusable pattern

### Not Asking Permission

**Wrong:** Auto-saving without confirmation
**Right:** Present draft, ask "Should I save this diary entry?"

### Skipping the Generalizable Marker

**Wrong:** Leaving Generalizable? empty or omitting it
**Right:** Always mark solutions as Yes/No - helps /learn prioritize patterns

## Template Variables

| Variable       | Source                                                 |
| -------------- | ------------------------------------------------------ |
| `{project}`    | `CLAUDE_PROJECT_DIR` or `path.basename(process.cwd())` |
| `{YYYY-MM-DD}` | Current date                                           |
| `{sessionId}`  | `CLAUDE_SESSION_ID` or generated                       |
| `{timestamp}`  | ISO timestamp                                          |

## Output Location

```
~/.claude/sessions/{project}/{YYYY-MM-DD}/
├── {sessionId}.json          # Session data (auto-generated)
├── {sessionId}.md            # Session summary (auto-generated)
└── diary-{sessionId}.md      # Diary entry (from /diary)
```

## Example Diary Entry

```markdown
# Session Diary: my-api-project

**Date:** 2025-01-24
**Session ID:** abc123-def456

## Decisions Made

- Chose PostgreSQL over MySQL: JSON column support needed for flexible schema
- Connection pooling with PgBouncer: scalability requirement for multi-tenant

## User Preferences Observed

- Prefers explicit error handling over try-catch blocks
- Likes detailed commit messages with context

## What Worked Well

- TDD approach helped catch edge case early
- Breaking large migration into smaller steps

## Challenges & Solutions

- **Challenge**: Docker networking issues blocked local development
- **Solution**: Used host network mode instead of bridge
- **Generalizable?**: Yes - applies to any Docker-based local dev

- **Challenge**: Prisma limitation with composite keys
- **Solution**: Workaround using @@id directive with custom naming
- **Generalizable?**: No - specific to this Prisma version

## PR/Review Feedback (if any)

- "Add rollback logic to migration": Added down() method to all migration files

## Context for Next Session

- Migration is half-complete; start with users table
- Test database needs to be reset before next run

---

_Captured at 2025-01-24T15:30:00Z_
```
