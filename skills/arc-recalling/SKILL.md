---
name: arc-recalling
description: Use when the user wants to manually save a pattern or insight as an instinct from the current session context. Use when the user says /recall followed by a description. Use when the user identifies a reusable technique worth preserving.
---

# Manual Instinct Creation

## Overview

Save patterns and insights from the current session as instincts. This skill bridges the gap between automatic instinct detection (arc-observing) and structured reflection (arc-reflecting) — it handles ad-hoc "I want to remember this" moments.

## Quick Reference

| Task | Command |
|------|---------|
| **Save instinct** | `node "${SKILL_ROOT}/scripts/recall.js" save --id {id} --trigger "..." --action "..." --domain {d} --project {p}` |
| **Check duplicate** | `node "${SKILL_ROOT}/scripts/recall.js" check-duplicate --id {id} --project {p}` |

## Infrastructure Commands

**Set SKILL_ROOT** from skill loader header (`# SKILL_ROOT: ...`):
```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-recalling}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
```

## Workflow

1. **Receive** user's natural language description of the pattern
2. **Infer** structured fields from the description:
   - `id`: kebab-case identifier (e.g., `always-run-tests-first`)
   - `trigger`: When does this apply? (e.g., "when starting a new feature")
   - `action`: What to do? (e.g., "run existing tests before making changes")
   - `domain`: Category (e.g., `testing`, `debugging`, `workflow`)
   - `evidence`: Supporting context from the session
3. **Preview** the complete instinct for user confirmation
4. **Check duplicate** before saving
5. **Save** via instinct-writer with:
   - `source: 'manual'`
   - `confidence: 0.50` (starting confidence for manual instincts)
   - `maxConfidence: 0.90` (manual instincts use full MAX_CONFIDENCE)

## When to Use

- User explicitly says "/recall" or "remember this"
- User identifies a reusable technique during work
- User wants to preserve a pattern without waiting for automatic detection
- User wants to save an insight from the current conversation

## When NOT to Use

- Pattern was already auto-detected by arc-observing (use confirm instead)
- User wants to analyze multiple diaries for patterns (use /reflect)
- User wants to cluster instincts into higher-level skills (use /learn)
- User is just discussing patterns without wanting to save them

## Key Principles

- **User confirmation required**: Always show preview before saving
- **Single instinct per invocation**: Don't batch-create multiple instincts
- **Duplicate awareness**: Always check-duplicate before saving
- **Accurate inference**: Ask clarifying questions if trigger/action are ambiguous
