---
name: arc-managing-sessions
description: Hand off, save, or resume session state across turns. Use when ending a session and handing to a future one, summarizing recent context to continue, or archiving, resuming, or aliasing a saved session for durable reference.
category: memory
status: promoted
argument-hint: "handover [--mode quick|full|tail] | save [alias] | resume [alias] | list [--limit N] [--date YYYY-MM-DD] [--query id] | alias <session-path> <name> | aliases"
---

# Managing Sessions

## Overview

Lightweight, user-controlled session continuity. **Default = handover, not archive.** Most handoffs need a short handover for immediate continuity — the next session (often the next day, or a context-window restart) needs to pick up where this one left off. Reach for an archive only when the work has durable value worth re-reading weeks or months later. If unsure, do a handover — it can be promoted to an archive later.

## Handover Modes

Pick the lightest mode that gets the next session unstuck.

- **Quick (default)** — a 5–10 line bullet list: current goal, last concrete step taken, what's next, any open blocker. No file written by default — paste into the next session, or save as `handover-{slug}.md` if asked. Use for "pick this up next time" / "wrap up" / "end session".
- **Full Context Summary** — a structured paragraph-plus-bullets summary: goal, decisions made so far, open questions, files touched, next step. Use when a different person or agent picks up, or the goal has multiple moving parts.
- **Tail / Continue-From-Here** — the lightest mode: only the last few exchanges and the immediate next step, a "you are here" marker. Use when the user wants short context only, or the turn was clearly mid-task and we just need to resume that exact task.
- **Archive Snapshot** — a full session save with enrichment (see `save` below). Produces a durable Markdown file under `~/.arcforge/sessions/...`. Heaviest mode; use only when the Archive Recommendation below applies.

## Archive Recommendation

Escalate to archive only when at least one holds:

- The user explicitly asks to archive, save, snapshot, or "remember this session for later."
- **High decision density** — multiple non-obvious decisions, tradeoffs, or rejected alternatives future sessions will want to look up.
- **High operational value** — playbooks, recovery steps, migration procedures other sessions or contributors will need to replay.
- **Long-running multi-session work** — the same epic or feature has spanned several sessions and is likely to span more.
- **Learning value** — a reusable pattern, antipattern, or insight worth reflecting on later.

Otherwise produce a handover. Pure Q&A or read-only inspection, trivial fixes with nothing to learn, immediate tail continuity, or an explicit "short context only" request do NOT warrant an archive.

## Quick Reference

| Task                         | Command                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Quick handover**           | `/arc-managing-sessions handover [--mode quick\|full\|tail]`               |
| **Archive (save) session**   | `/arc-managing-sessions save [alias]`                                      |
| **Resume archived session**  | `/arc-managing-sessions resume [alias]`                                    |
| **List sessions**            | `/arc-managing-sessions list [--limit N] [--date YYYY-MM-DD] [--query id]` |
| **Create alias**             | `/arc-managing-sessions alias <session-path> <name>`                       |
| **List aliases**             | `/arc-managing-sessions aliases`                                           |

## Handover Workflow

1. Decide the mode (quick / full / tail). Default to quick.
2. Reflect on the conversation — write the handover content yourself. Mechanical templating without reflection produces useless handovers.
3. Output the handover inline. Only write a file if the user asks ("save this handover" or `--save`).
4. If the user asks to escalate to an archive, fall through to `save` below.

## Archive (Advanced) — save / resume / list / alias

Set `SKILL_ROOT` before running scripts:

```bash
: "${SKILL_ROOT:=${CLAUDE_PLUGIN_ROOT}/skills/arc-managing-sessions}"
```

### `save [alias]`

Archive the current session with enrichment. Get session data from `~/.arcforge/sessions/{project}/{date}/{sessionId}.json`, use transcript data if available (user messages, tools used, files modified), then enrich from the conversation — **Summary** (what was accomplished), **What Worked**, **What Failed** (approaches abandoned, with reasons), **Blockers**, **Next Step**. Save to `~/.arcforge/sessions/{project}/{date}/session-{alias}.md` and create the alias if a name is given.

```bash
: "${SKILL_ROOT:=${CLAUDE_PLUGIN_ROOT}/skills/arc-managing-sessions}"
node "${SKILL_ROOT}/scripts/sessions.js" save <alias> [summary] [whatWorked] [whatFailed] [blockers] [nextStep]
```

**Important:** Do NOT run the script mechanically. Reflect on the conversation and write the enrichment first, then call the script (or write the session file directly and fill in every `<!-- TO BE ENRICHED -->` placeholder).

### `resume [alias]`

Resolve alias → session file path, read the session file completely, present the structured briefing, then **wait for user confirmation before doing any work.**

```bash
: "${SKILL_ROOT:=${CLAUDE_PLUGIN_ROOT}/skills/arc-managing-sessions}"
node "${SKILL_ROOT}/scripts/sessions.js" resume [alias]
```

**Critical:** After showing the briefing, do NOT start working automatically. Wait for the user to confirm what to do next.

### `list`

Browse sessions with metadata — both auto-tracked (from hooks) and user-archived. Options: `--limit N` (default 20), `--date YYYY-MM-DD`, `--query id` (session ID substring).

```bash
: "${SKILL_ROOT:=${CLAUDE_PLUGIN_ROOT}/skills/arc-managing-sessions}"
node "${SKILL_ROOT}/scripts/sessions.js" list [--limit N] [--date YYYY-MM-DD] [--query id]
```

### `alias <session-path> <name>` / `aliases`

Create an alias for easy reference, or list all aliases.

```bash
: "${SKILL_ROOT:=${CLAUDE_PLUGIN_ROOT}/skills/arc-managing-sessions}"
node "${SKILL_ROOT}/scripts/sessions.js" alias <session-path> <name>
node "${SKILL_ROOT}/scripts/sessions.js" aliases
```

## Storage Layout

```
~/.arcforge/sessions/{project}/
├── aliases.json                          # Project-scoped alias registry
├── {YYYY-MM-DD}/
│   ├── {sessionId}.json                  # Auto-saved session metrics
│   ├── session-{alias}.md                # User-archived session (from save)
│   ├── handover-{slug}.md                # Optional handover file (from handover --save)
```

Diary entries (from `arc-journaling`) live under a separate tree: `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`.

## Key Principles

- **Default to handover.** Archive only when the heuristics say so — archiving every session is the most common mistake.
- **User-controlled.** Sessions are saved or archived only when asked — no auto-injection of stale context.
- **Reflection over mechanics.** Both handover and archive require thinking about the session, not template-fill; fill every `<!-- TO BE ENRICHED -->` placeholder, and never pass off a transcript dump as a "handover".
- **Wait before working.** After `resume`, always wait for user confirmation.
- **No native memory overlap.** This skill handles continuity; auto-memory handles preferences and feedback.
