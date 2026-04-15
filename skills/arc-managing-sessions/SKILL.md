---
name: arc-managing-sessions
description: Use when saving session state for continuity, resuming a previous session, listing session history, or managing session aliases for cross-conversation handoff
user-invocable: true
argument-hint: "save [alias] | resume [alias] | list [--limit N] [--date YYYY-MM-DD] [--query id] | alias <id> <name> | aliases"
---

# Session Save & Resume

## Overview

User-controlled session saves for continuity across conversations. Save what matters, resume when needed.

**Three arcforge layers — this skill handles Continuity:**

- **Continuity (this skill)** — save/resume sessions for handoff
- **Learning (diary→reflect→learn)** — deliberate reflection for pattern extraction
- **Behavioral (instincts)** — auto-detected tool-usage patterns

## Quick Reference

| Task                    | Command                                                       |
| ----------------------- | ------------------------------------------------------------- |
| **Save session**        | `/arc-managing-sessions save [alias]`                                      |
| **Resume session**      | `/arc-managing-sessions resume [alias]`                                    |
| **List sessions**       | `/arc-managing-sessions list [--limit N] [--date YYYY-MM-DD] [--query id]` |
| **Create alias**        | `/arc-managing-sessions alias <id> <name>`                                 |
| **List saved sessions** | `/arc-managing-sessions aliases`                                           |

## Infrastructure Commands

**Set SKILL_ROOT** before running any script:

```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-managing-sessions}"
```

## Subcommands

### `/arc-managing-sessions save [alias]`

Save the current session with enrichment.

**Process:**

1. Get current session data from `~/.arcforge/sessions/{project}/{date}/{sessionId}.json`
2. Use transcript data if available (user messages, tools used, files modified)
3. Enrich with your understanding from conversation memory:
   - **Summary**: What was accomplished
   - **What Worked**: Successful approaches
   - **What Failed**: Approaches that were tried and abandoned (with reasons)
   - **Blockers**: Current blockers or open questions
   - **Next Step**: Exact next step to take
4. Save to `~/.arcforge/sessions/{project}/{date}/session-{alias}.md`
5. Create alias if name provided

**Infrastructure:**

```bash
node "${SKILL_ROOT}/scripts/sessions.js" save <alias> [summary] [whatWorked] [whatFailed] [blockers] [nextStep]
```

**Important**: Do NOT just run the script mechanically. First, reflect on the conversation and write the enrichment content yourself based on what actually happened. Then call the script with the enrichment values, or write the session file directly using the `generateSession` function's output as a template and fill in the `<!-- TO BE ENRICHED -->` sections.

### `/arc-managing-sessions resume [alias]`

Load a saved session and present a structured briefing.

**Process:**

1. Resolve alias → session file path
2. Read the session file completely
3. Present structured briefing using `formatSessionBriefing()`
4. **Wait for user confirmation before doing any work**

**Infrastructure:**

```bash
node "${SKILL_ROOT}/scripts/sessions.js" resume [alias]
```

**Critical**: After showing the briefing, do NOT start working automatically. Wait for the user to confirm what to do next.

### `/arc-managing-sessions list`

Browse sessions with metadata. Shows both auto-tracked sessions (from hooks) and user-saved sessions.

**Options:**

- `--limit N` — show N results (default 20)
- `--date YYYY-MM-DD` — filter by date
- `--query id` — filter by session ID substring

**Infrastructure:**

```bash
node "${SKILL_ROOT}/scripts/sessions.js" list [--limit N] [--date YYYY-MM-DD] [--query id]
```

### `/arc-managing-sessions alias <id> <name>`

Create an alias for easy reference.

**Infrastructure:**

```bash
node "${SKILL_ROOT}/scripts/sessions.js" alias <session-path> <name>
```

### `/arc-managing-sessions aliases`

List all session aliases.

**Infrastructure:**

```bash
node "${SKILL_ROOT}/scripts/sessions.js" aliases
```

## Storage Layout

```
~/.arcforge/sessions/{project}/
├── aliases.json                          # Project-scoped alias registry
├── {YYYY-MM-DD}/
│   ├── {sessionId}.json                  # Auto-saved session metrics
│   ├── session-{alias}.md                # User-saved session (from /arc-managing-sessions save)
│   ├── diary-{sessionId}.md              # Diary entry (from /diary)
```

## Common Mistakes

- Running the save script without reflecting first — always write the enrichment content based on conversation context before calling the script
- Starting work after `/arc-managing-sessions resume` without waiting for user confirmation
- Saving too frequently — save at meaningful milestones, not after every exchange
- Leaving `<!-- TO BE ENRICHED -->` placeholders — always fill in all sections

## Key Principles

1. **User-controlled**: Sessions are only saved when the user asks — no auto-injection of stale context
2. **Transcript + Memory**: Combine hard data (transcript parsing) with Claude's understanding (enrichment)
3. **Wait before working**: After `/arc-managing-sessions resume`, always wait for user confirmation
4. **No native memory overlap**: This skill handles continuity; native auto-memory handles preferences/feedback
