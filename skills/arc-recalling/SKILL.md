---
name: arc-recalling
description: Manually save a pattern or insight from the current session as a reusable instinct.
category: memory
status: promoted
disable-model-invocation: true
argument-hint: "<description of the pattern to remember>"
---

# Manual Instinct Creation

## Overview

Save patterns and insights from the current session as instincts. This skill bridges the gap between automatic instinct detection (arc-learning) and structured reflection (arc-reflecting) — it handles ad-hoc "I want to remember this" moments.

## Quick Reference

| Task | Command |
|------|---------|
| **Save instinct** | `node "${SKILL_ROOT}/scripts/recall.js" save --id {id} --trigger "..." --action "..." --domain {d} --project {p} [--evidence "..."] [--evidence-count N]` |
| **Check duplicate** | `node "${SKILL_ROOT}/scripts/recall.js" check-duplicate --id {id} --project {p}` |
| **Save record** | `node "${SKILL_ROOT}/scripts/recall.js" save-record --project {p} --recall-id recall-{id} [--query "..."] [--instinct-ids "a,b,c"] [--summary "..."]` |

## Infrastructure Commands

**Set SKILL_ROOT** from `ARCFORGE_ROOT` (fallback default below when unset):
```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
: "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-recalling}"
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
   - `confidence: min(0.9, 0.5 + 0.05 * evidence_count)` (default evidence-count is 1, giving 0.55)
   - `maxConfidence: 0.90` (manual instincts use full MAX_CONFIDENCE)
6. **Save record** of the recall operation so the learning curator has evidence
   that this recall happened:
   ```bash
   : "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
   : "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-recalling}"
   node "${SKILL_ROOT}/scripts/recall.js" save-record \
     --project {project} \
     --recall-id recall-{id} \
     --query "{what the user wanted to remember}" \
     --instinct-ids "{saved-instinct-id}" \
     --summary "{one-line summary}"
   ```
   The `--recall-id` MUST start with `recall-` (the curator batch-assembler only
   matches `recall-*.md` records).

## When to Use

- User explicitly says "remember this" or invokes /arcforge:arc-recalling
- User identifies a reusable technique during work
- User wants to preserve a pattern without waiting for automatic detection
- User wants to save an insight from the current conversation

## When NOT to Use

- Pattern was already auto-detected by arc-learning (use confirm instead)
- User wants to analyze multiple diaries for patterns (use arc-reflecting)
- User wants to combine related instincts into a higher-level candidate (use the dashboard Evolve action: `arcforge learn dashboard`)
- User is just discussing patterns without wanting to save them

## Key Principles

- **User confirmation required**: Always show preview before saving
- **Single instinct per invocation**: Don't batch-create multiple instincts
- **Duplicate awareness**: Always check-duplicate before saving
- **Accurate inference**: Ask clarifying questions if trigger/action are ambiguous
