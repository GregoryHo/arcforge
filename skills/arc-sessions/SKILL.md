---
name: arc-sessions
description: Use when user wants to save a session checkpoint, resume a previous session, list sessions, or manage session aliases
user-invocable: true
argument-hint: "save [alias] | resume [alias] | list | alias <id> <name> | aliases"
---

# Session Save & Resume

## Overview

User-controlled session checkpoints for continuity across conversations. Save what matters, resume when needed.

**Three arcforge layers — this skill handles Continuity:**
- **Continuity (this skill)** — save/resume checkpoints for session handoff
- **Learning (diary→reflect→learn)** — deliberate reflection for pattern extraction
- **Behavioral (instincts)** — auto-detected tool-usage patterns

## Quick Reference

| Task | Command |
|------|---------|
| **Save checkpoint** | `/sessions save [alias]` |
| **Resume session** | `/sessions resume [alias]` |
| **List sessions** | `/sessions list` |
| **Create alias** | `/sessions alias <id> <name>` |
| **List aliases** | `/sessions aliases` |

## Infrastructure Commands

**Set SKILL_ROOT** before running any script:
```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-sessions}"
```

## Subcommands

### `/sessions save [alias]`

Create a checkpoint from the current session.

**Process:**
1. Get current session data from `~/.claude/sessions/{project}/{date}/{sessionId}.json`
2. Use transcript data if available (user messages, tools used, files modified)
3. Enrich checkpoint with your understanding from conversation memory:
   - **Summary**: What was accomplished
   - **What Worked**: Successful approaches
   - **What Failed**: Approaches that were tried and abandoned (with reasons)
   - **Blockers**: Current blockers or open questions
   - **Next Step**: Exact next step to take
4. Save to `~/.claude/sessions/{project}/{date}/checkpoint-{alias}.md`
5. Create alias if name provided

**Infrastructure:**
```bash
node "${SKILL_ROOT}/scripts/sessions.js" save <alias> [summary] [whatWorked] [whatFailed] [blockers] [nextStep]
```

**Important**: Do NOT just run the script mechanically. First, reflect on the conversation and write the enrichment content yourself based on what actually happened. Then call the script with the enrichment values, or write the checkpoint file directly using the `generateCheckpoint` function's output as a template and fill in the `<!-- TO BE ENRICHED -->` sections.

### `/sessions resume [alias]`

Load a checkpoint and present a structured briefing.

**Process:**
1. Resolve alias → checkpoint file path
2. Read the checkpoint file completely
3. Present structured briefing using `formatSessionBriefing()`
4. **Wait for user confirmation before doing any work**

**Infrastructure:**
```bash
node "${SKILL_ROOT}/scripts/sessions.js" resume [alias]
```

**Critical**: After showing the briefing, do NOT start working automatically. Wait for the user to confirm what to do next.

### `/sessions list`

Browse sessions with metadata.

**Infrastructure:**
```bash
node "${SKILL_ROOT}/scripts/sessions.js" list
```

### `/sessions alias <id> <name>`

Create an alias for easy reference.

**Infrastructure:**
```bash
node "${SKILL_ROOT}/scripts/sessions.js" alias <checkpoint-path> <name>
```

### `/sessions aliases`

List all session aliases.

**Infrastructure:**
```bash
node "${SKILL_ROOT}/scripts/sessions.js" aliases
```

## Storage Layout

```
~/.claude/sessions/{project}/
├── aliases.json                          # Project-scoped alias registry
├── {YYYY-MM-DD}/
│   ├── {sessionId}.json                  # Auto-saved session metrics
│   ├── diary-{sessionId}.md              # Diary entry (from /diary)
│   └── checkpoint-{alias}.md             # User-saved checkpoint (from /sessions save)
```

## Key Principles

1. **User-controlled**: Checkpoints are only created when the user asks — no auto-injection of stale context
2. **Transcript + Memory**: Combine hard data (transcript parsing) with Claude's understanding (enrichment)
3. **Wait before working**: After `/sessions resume`, always wait for user confirmation
4. **No native memory overlap**: This skill handles continuity; native auto-memory handles preferences/feedback
