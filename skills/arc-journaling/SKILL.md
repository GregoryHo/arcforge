---
name: arc-journaling
description: Use when the user asks to journal session reflections (/arcforge:arc-journaling), when the PreCompact hook triggers, or at end of a significant work session
---

# Session Diary Capture

## Overview

Capture session reflections as structured diary entries for the **learning cycle** (diary → reflect → instincts). This is for deliberate reflection and pattern extraction — NOT for session continuity. For saving/resuming work across sessions, use `/arc-managing-sessions save` and `/arc-managing-sessions resume` instead.

## Quick Reference

| Task | Command |
|------|---------|
| **Get diary path** | `node "${SKILL_ROOT}/scripts/diary.js" path --project {p} --date {d} --session {s}` |
| **Save diary** | `node "${SKILL_ROOT}/scripts/diary.js" save --project {p} --date {d} --session {s} --content "{content}"` |
| **Finalize draft** | `node "${SKILL_ROOT}/scripts/diary.js" finalize --project {p} --date {d} --session {s}` |
| **Key principle** | Reflect from memory, NOT by reading files — **except** an existing draft (see "Draft Finalization Workflow"): read it first, never rewrite it from memory |
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
- **Evolve = instinct combination** (the dashboard Evolve action — `arcforge learn dashboard` — combines related instincts into a successor candidate)

**Storage:** `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`

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

This is a **soft gate**: Claude judges based on conversation memory. User can always override by invoking `arc-journaling` explicitly.

## When to Use

- User invokes `/arcforge:arc-journaling`
- PreCompact hook triggers (conversation getting long)
- End of significant work session
- After important design decisions
- When user says "remember this" or "note this down"

## When NOT to Use

- Quick Q&A sessions (< 5 tool calls)
- Pure research without decisions
- Already captured in previous diary entry this session
- Pattern extraction needed (use arc-recalling instead)
- **Fails Pre-Diary Check** — unless user explicitly requests

## Draft Finalization Workflow

When SessionStart shows **"📝 Diary draft ready — use /arcforge:arc-journaling to review and finalize."**, a background pipeline (PreCompact or Stop hook → `auto-diary.js generate` → detached Haiku enricher) has already written a draft to:

```
~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}-draft.md
```

Do this instead of writing a new entry from scratch:

1. **Read the draft file.** Its `## Session Metrics` section (duration, tool calls, user messages, compactions, files modified) is always deterministically filled — preserve it, never regenerate or discard it. It may also have a `## Tool Usage Summary` section. Its `<!-- TO BE ENRICHED -->` placeholder sections (Decisions Made, Challenges & Solutions, etc.) *may* already be filled by a background enricher — check, don't assume either way.
2. **If placeholders remain and you have conversation memory of that session**, edit the draft file in place to replace the `<!-- TO BE ENRICHED -->` blocks with real content — do not create a separate entry via `save`. If you do NOT have memory of the flagged session (e.g. the nudge surfaced in a later, unrelated session), leave the placeholders as-is rather than fabricating content.
3. **Promote the draft to the final diary:**
   ```bash
   node "${SKILL_ROOT}/scripts/diary.js" finalize \
     --project {project} \
     --date {YYYY-MM-DD} \
     --session {sessionId}
   ```
   `finalize` renames the draft to the final path — it does **not** merge content, so any edits from step 2 must already be written to the draft file before calling it.
4. **If `finalize` reports `No draft found at: ...`**, there is no pending draft — fall back to the normal "## Process" workflow below (reflect from memory, then `save`).

Never respond to the draft-ready nudge by reflecting from memory and calling `save` directly — that creates a duplicate final diary and leaves the auto-generated draft as an orphaned file.

## Process

### 1. Reflect on Conversation (Context-First)

(This flow is for a fresh entry with no pending draft. If a draft exists, use "Draft Finalization Workflow" above instead.)

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
- **Generalizable?**: [Yes/No - pre-flags for arc-reflecting]

## PR/Review Feedback (if any)

- [Feedback]: [Action taken]

## Context for Next Session

- [Key context to remember]

---

_Captured at {timestamp}_
```

### 3. Save to Session Directory

1. Ensure session directory exists
2. Write to `~/.arcforge/diaries/{project}/{date}/diary-{sessionId}.md`
3. Confirm save location with path

### 4. Offer Follow-up

After saving, briefly mention:

> "Diary saved. If you noticed reusable patterns, run `/arcforge:arc-reflecting` to extract them."

## Key Principles

### Observation Over Prescription

Record what happened, not rules. Patterns that should become rules belong in `arc-reflecting`.

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

**Wrong:** Same pattern in both diary and instinct
**Right:** Diary captures context; learn extracts reusable pattern

### Not Asking Permission

**Wrong:** Auto-saving without confirmation
**Right:** Present draft, ask "Should I save this diary entry?"

### Skipping the Generalizable Marker

**Wrong:** Leaving Generalizable? empty or omitting it
**Right:** Always mark solutions as Yes/No - helps arc-reflecting identify patterns

### Rewriting an Existing Draft From Scratch

**Wrong:** Seeing "Diary draft ready" and reflecting from memory into a brand-new `save` call
**Right:** Read the draft first, fill only remaining placeholders in place, then `finalize` it (see "Draft Finalization Workflow")

## Template Variables

| Variable       | Source                                                 |
| -------------- | ------------------------------------------------------ |
| `{project}`    | `CLAUDE_PROJECT_DIR` or `path.basename(process.cwd())` |
| `{YYYY-MM-DD}` | Current date                                           |
| `{sessionId}`  | `CLAUDE_SESSION_ID` or generated                       |
| `{timestamp}`  | ISO timestamp                                          |

## Output Location

```
~/.arcforge/diaries/{project}/{YYYY-MM-DD}/
├── diary-{sessionId}.md      # Diary entry (from arc-journaling)
└── diary-{sessionId}-draft.md    # Auto-generated draft (PreCompact/Stop hook); promote with `finalize`, do not overwrite with `save`

~/.arcforge/sessions/{project}/{YYYY-MM-DD}/
└── {sessionId}.json          # Session data (auto-generated)
```

Diary files live under `~/.arcforge/diaries/` (not `~/.claude/sessions/`)
because Claude Code v2.1.78+ blocks subprocess writes to `~/.claude/`.
The Stop-hook background enricher needs to be able to write there.

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
