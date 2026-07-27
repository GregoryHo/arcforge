---
name: arc-reflecting
description: Analyze accumulated diary entries for recurring patterns and preferences. Use when 5+ diaries have accumulated, the user asks to summarize learnings from past sessions, or inject-context flags that reflection is due.
category: memory
status: promoted
---

# Diary Reflection & Pattern Extraction

## Overview

Analyze multiple diary entries to identify recurring patterns. Save insights to `~/.arcforge/diaryed/` for user review. A pattern MUST appear in **3+ diary entries** to be labeled "Pattern"; 1-2 occurrences are "Observation".

## Quick Reference

| Task | Command |
|------|---------|
| **Determine strategy** | `node "${SKILL_ROOT}/scripts/reflect.js" strategy --project {project}` |
| **Scan diaries** | `node "${SKILL_ROOT}/scripts/reflect.js" scan --project {p} --strategy {s}` |
| **Update log** | `node "${SKILL_ROOT}/scripts/reflect.js" update-log --project {p} --diaries "{f}" --reflection "{id}"` |
| **Pattern threshold** | 3+ occurrences = Pattern, 1-2 = Observation |
| **Rule violations** | Check CLAUDE.md first, report violations with evidence |
| **Save instinct** | `node "${SKILL_ROOT}/scripts/reflect.js" save-instinct --project {p} --id {id} --trigger "..." --action "..." [--domain D] [--evidence "..."] [--evidence-count N]` |
| **Save record** | `node "${SKILL_ROOT}/scripts/reflect.js" save-record --project {p} --reflect-id reflect-{id} [--diaries "a,b,c"] [--summary "..."]` |
| **Strategy modes** | unprocessed (5+ new) \| project_focused (5+ total) \| recent_window (fallback) |

## Infrastructure Commands

**Set SKILL_ROOT** from `ARCFORGE_ROOT` (fallback default below when unset):
```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
: "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-reflecting}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
```

Run the `strategy`, `scan`, and `update-log` subcommands from the Quick Reference table (each after setting `SKILL_ROOT`). `strategy` returns `unprocessed | project_focused | recent_window`; `scan` returns the list of diary file paths; `update-log` records which diaries a reflection consumed.

For large diary sets, use the diary-analyzer subagent (see `diary-analyzer.md`) to read diaries in an isolated context without polluting the main conversation.

**Integration:** `arc-reflecting` writes reflections to `~/.arcforge/diaryed/` plus instincts via `save-instinct`; `arc-recalling` retrieves instincts and learned patterns.

## When to Use

- User invokes `/arcforge:arc-reflecting`, or asks "what have I learned?" / "show me patterns"
- 5+ diary entries accumulated, or the user wants to review preferences across sessions

## When NOT to Use

- Fewer than 3 diary entries exist, or no meaningful patterns found
- User wants patterns auto-loaded (use arc-recalling) or single-session insights (use arc-journaling)

## Storage

```
~/.arcforge/diaryed/
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

**NOT auto-loaded by Claude.** User must manually review.

## Process

### 1. Smart Filter Selection (Auto)

Determine the strategy via the `strategy` subcommand (see Quick Reference): `unprocessed` when 5+ unprocessed diaries exist, else `project_focused` when the project has 5+ total, else `recent_window` (recent 10). Output the strategy header at the start of the reflection:

```markdown
## Reflect Strategy
**Mode:** {unprocessed|project_focused|recent_window}
**Diaries analyzed:** {count}
**Reason:** {why this mode was selected}
**Projects covered:** {project} (count), ...
```

### 2. Locate Diary Entries

Search `~/.arcforge/diaries/{project}/*/diary-*.md`. If fewer than 3:
> "Found only X diary entries. Run more sessions with arc-journaling before reflecting."

### 3. Read CLAUDE.md Rules (if exists)

Read the project's CLAUDE.md to extract existing rules, so you can detect when diaries show user corrections for breaking an existing rule.

### 4. Read and Analyze Diaries

Read each diary entry. Look for repeated decisions, consistent preferences, recurring challenges (and solutions if marked Generalizable), common techniques, and **rule violations** (user corrected Claude for breaking a CLAUDE.md rule).

**Observation Cross-Reference:** When `~/.arcforge/observations/{project}/observations.jsonl` is available, cross-reference diary patterns with tool-call data for stronger evidence (e.g. a diary claim "always grep before editing" backed by Grep→Read→Edit sequences).

### 5. Identify Patterns and Violations

A pattern MUST appear in 3+ diary entries to be a "Pattern"; 1-2 occurrences stay "Observation". For each pattern track which diaries contain it, how it manifested, and whether it's a preference, technique, or decision. For rule violations track the violated CLAUDE.md rule, the correcting diaries, and specific correction quotes as evidence.

### 6. Draft Reflection Output

Use this structure (with the strategy header from step 1):

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

Rule violations appear FIRST (priority) before patterns. For each pattern, also note an instinct to create (ID, Trigger, Action, Domain, Evidence count).

### 7. Auto-Save and Inform

Reflections and instincts are auto-saved. Inform the user of what was saved:
> "I found these patterns/violations across X diary entries. Saving reflection and instincts."

For rule violations, additionally:
> "These rule violations suggest strengthening CLAUDE.md. Would you like to update those rules?"

### 8. Save Reflections and Instincts

1. Ensure `~/.arcforge/diaryed/{project}/` or `~/.arcforge/diaryed/global/` exists.
2. Write the reflection markdown file (e.g., `YYYY-MM-reflection-N.md`).
3. **Update processed.log** with each analyzed diary (`diary-abc123.md | 2025-01-24 | 2025-01-reflection-1.md`).
4. For each Pattern, save an instinct:
   ```bash
   : "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
   : "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-reflecting}"
   node "${SKILL_ROOT}/scripts/reflect.js" save-instinct \
     --project {project} \
     --id {pattern-name} \
     --trigger "{when this applies}" \
     --action "{what to do}" \
     --domain {category} \
     --evidence "{source diary references}" \
     --evidence-count {N}
   ```
5. **Save a reflection record** so the learning curator has evidence that this reflection happened:
   ```bash
   : "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
   : "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-reflecting}"
   node "${SKILL_ROOT}/scripts/reflect.js" save-record \
     --project {project} \
     --reflect-id reflect-{id} \
     --diaries "{analyzed diary filenames}" \
     --summary "{one-line summary of the reflection}"
   ```
   The `--reflect-id` MUST start with `reflect-` (the curator batch-assembler only matches `reflect-*.md` records).
6. Confirm save location, processed.log update, and instincts saved.

## Key Principles

- **Evidence-based only** — every pattern MUST cite specific diary entries; no assumptions.
- **Non-prescriptive** — insights are observations, not rules ("Observed: chose TypeScript in 4/5 projects", not "always use TypeScript"). The user decides how to act.
- **Separate from recall** — diaryed patterns are for reflection; if the user wants auto-loading, redirect to arc-recalling.
- **Never auto-update CLAUDE.md** — report rule violations and ask before changing rules.
- **Always update processed.log** after saving, so diaries are not re-extracted next time.

## Red Flags — DO NOT Extract as Pattern

- Fewer than 3 diary entries (use "Observation") · no specific diary citations · prescriptive language
- Already extracted in a previous reflect session (check processed.log) or already captured as an instinct

For a worked five-diary example, see `references/example-reflection.md`.
