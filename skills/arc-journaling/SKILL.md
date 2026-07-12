---
name: arc-journaling
description: Capture session reflections into a durable diary. Use when a significant work session ends, the user asks to journal, or the PreCompact hook fires before context is compacted and insight would be lost.
category: memory
status: promoted
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

## Infrastructure Commands

**Set SKILL_ROOT** from `ARCFORGE_ROOT` (fallback default below when unset):
```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
: "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-journaling}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
```

**Save diary to correct location:**
```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
: "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-journaling}"
node "${SKILL_ROOT}/scripts/diary.js" save \
  --project {project} \
  --date {YYYY-MM-DD} \
  --session {sessionId} \
  --content "{diary_content}"
```

**Storage:** `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`

## Pre-Diary Check (Noise Gate)

Before creating a diary entry, verify at least ONE of these criteria is met:

- **Non-trivial decision** was made (architecture, tool choice, approach)
- **Challenge was solved** (debugging, workaround found)
- **User preference was expressed** (explicit or implicit)
- **Technique was discovered** (new pattern, integration insight)

**Auto-skip these sessions** (no diary needed): pure Q&A, retrying the same operation (build failures, test reruns), pure exploration without decisions, trivial fixes (typos, formatting, single-line changes).

This is a **soft gate**: Claude judges based on conversation memory. User can always override by invoking `arc-journaling` explicitly.

## When to Use / When NOT to Use

**Use** when `/arcforge:arc-journaling` is invoked, the PreCompact hook triggers, at the end of a significant work session, after important design decisions, or when the user says "remember this" / "note this down".

**Do NOT use** for quick Q&A (< 5 tool calls), pure research without decisions, a session already captured in a previous diary entry this session, or when the Pre-Diary Check fails (unless the user explicitly requests). For reusable-pattern extraction, use arc-recalling instead.

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
   : "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
   : "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-journaling}"
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

Review the conversation from memory. **DO NOT read files to gather context.** Ask: what decisions were made and why? What preferences did the user express? What worked well, what didn't? What context would help next session?

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

Ensure the session directory exists, write to `~/.arcforge/diaries/{project}/{date}/diary-{sessionId}.md`, and confirm the save location with its path.

### 4. Offer Follow-up

After saving, briefly mention:

> "Diary saved. If you noticed reusable patterns, run `/arcforge:arc-reflecting` to extract them."

## Key Principles

- **Observation over prescription** — record what happened, not rules (rules belong in `arc-reflecting`).
- **User intent over implementation** — capture WHY, not line-by-line WHAT ("prefer const for immutability", not "changed line 42").
- **Minimal effort** — keep entries focused; for a trivial session, skip the diary or note "No significant reflections this session".
- **Always mark Generalizable?** — Yes/No on each solution helps arc-reflecting identify patterns.
- **Never auto-save** — present the draft and ask before writing.

## Template Variables

`{project}` = `CLAUDE_PROJECT_DIR` or `path.basename(process.cwd())` · `{YYYY-MM-DD}` = current date · `{sessionId}` = `CLAUDE_SESSION_ID` or generated · `{timestamp}` = ISO timestamp.

## Output Location

```
~/.arcforge/diaries/{project}/{YYYY-MM-DD}/
├── diary-{sessionId}.md          # Diary entry (from arc-journaling)
└── diary-{sessionId}-draft.md    # Auto-generated draft (PreCompact/Stop hook); promote with `finalize`, do not overwrite with `save`
```

Diary files live under `~/.arcforge/diaries/` (not `~/.claude/`) because Claude Code v2.1.78+ blocks subprocess writes to `~/.claude/`, and the Stop-hook background enricher needs to write there.

For a filled-in example, see `references/example-diary.md`.
