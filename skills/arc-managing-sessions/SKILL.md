---
name: arc-managing-sessions
description: Use when ending a session and handing off to a future session, summarizing recent context, continuing from where the last turn left off, archiving a session for durable reference, or resuming/listing/aliasing saved sessions
---

# Managing Sessions

## Overview

Lightweight, user-controlled session continuity. Most handoffs need a short
handover, not a durable archive. Reach for archive only when the work has
lasting value beyond the next session.

**Default = handover, not archive.** Archives are heavier, take more
enrichment, and are intended as durable knowledge — most session endings do
not warrant one.

## Handover vs Archive

- **Handover is for immediate continuity** — the next session (often the
  next day, or a context-window restart) needs to pick up where this one
  left off. Cheap to produce, short-lived.
- **Archive is for durable future reference** — the session contains
  decisions, patterns, or operational knowledge worth preserving and
  re-reading weeks or months later.

If you are unsure, do a handover. Handovers can always be promoted into an
archive later.

## Handover Modes

Pick the lightest mode that gets the next session unstuck.

### Quick Handover (default)

A 5–10 line bullet list covering: current goal, last concrete step taken,
what's next, and any open blocker. No file written by default — just paste
into the next session, or save as `handover-{slug}.md` if asked.

Use when the user says "let's pick this up next time," "wrap up," "end
session," or asks for a brief handoff.

### Full Context Summary

A structured paragraph-plus-bullets summary: goal, decisions made so far,
open questions, files touched, next step. Longer than a quick handover,
but still a summary — not a transcript.

Use when the next session will be picked up by a different person or
agent, or when the goal has multiple moving parts.

### Tail Handover / Continue-From-Here

The lightest mode. Capture only the last few exchanges and the immediate
next step — a "you are here" marker. No goal recap, no decision log.

Use when the user explicitly wants short context only, or when the
current turn was clearly the middle of one task and we just need to
resume that exact task.

### Archive Snapshot

A full session save with enrichment (see `save` below). Produces a
durable Markdown file under `~/.arcforge/sessions/...`. Heaviest mode.

Use when the archive recommendation heuristics below say the work is
worth preserving.

## Archive Recommendation

Default = handover, not archive. Only escalate to archive when at least
one of these holds.

**Archive when:**

- The user explicitly asks to archive, save, snapshot, or "remember this
  session for later."
- **High decision density** — multiple non-obvious decisions, tradeoffs,
  or rejected alternatives that future sessions will want to look up.
- **High operational value** — playbooks, recovery steps, migration
  procedures, or one-off operations that other sessions or contributors
  will need to replay.
- **Long-running multi-session work** — the same epic or feature has
  spanned several sessions and is likely to span more.
- **Learning value** — the session surfaced a reusable pattern, antipattern,
  or insight worth reflecting on later.

**Do not archive when:**

- The session was pure Q&A or read-only inspection.
- The session was a trivial fix (typo, format, one-line bug) with nothing
  to learn from.
- The next step is just immediate tail continuity ("continue what we were
  doing 5 minutes ago").
- The user has explicitly asked for short context only or a quick wrap.

In all "do not archive" cases, produce a handover instead.

## Quick Reference

| Task                         | Command                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Quick handover**           | `/arc-managing-sessions handover [--mode quick\|full\|tail]`               |
| **Archive (save) session**   | `/arc-managing-sessions save [alias]`                                      |
| **Resume archived session**  | `/arc-managing-sessions resume [alias]`                                    |
| **List sessions**            | `/arc-managing-sessions list [--limit N] [--date YYYY-MM-DD] [--query id]` |
| **Create alias**             | `/arc-managing-sessions alias <id> <name>`                                 |
| **List aliases**             | `/arc-managing-sessions aliases`                                           |

## Handover Workflow

1. Decide the mode (quick / full / tail). Default to quick.
2. Reflect on the conversation — write the handover content yourself.
   Mechanical templating without reflection produces useless handovers.
3. Output the handover inline. Only write a file if the user asks
   ("save this handover" or `--save`).
4. If the user asks to escalate to an archive, fall through to `save`
   below.

## Archive (Advanced) — save / resume / list / alias

These remain available for the durable archive path. Set `SKILL_ROOT`
before running scripts:

```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-managing-sessions}"
```

### `save [alias]`

Archive the current session with enrichment.

**Process:**

1. Get current session data from `~/.arcforge/sessions/{project}/{date}/{sessionId}.json`.
2. Use transcript data if available (user messages, tools used, files modified).
3. Enrich with your understanding from the conversation:
   - **Summary**: What was accomplished
   - **What Worked**: Successful approaches
   - **What Failed**: Approaches that were tried and abandoned (with reasons)
   - **Blockers**: Current blockers or open questions
   - **Next Step**: Exact next step to take
4. Save to `~/.arcforge/sessions/{project}/{date}/session-{alias}.md`.
5. Create alias if name provided.

```bash
node "${SKILL_ROOT}/scripts/sessions.js" save <alias> [summary] [whatWorked] [whatFailed] [blockers] [nextStep]
```

**Important:** Do NOT just run the script mechanically. Reflect on the
conversation and write the enrichment content first, then call the script
with those values (or write the session file directly and fill in every
`<!-- TO BE ENRICHED -->` placeholder).

### `resume [alias]`

Load an archived session and present a structured briefing.

**Process:**

1. Resolve alias → session file path.
2. Read the session file completely.
3. Present the structured briefing.
4. **Wait for user confirmation before doing any work.**

```bash
node "${SKILL_ROOT}/scripts/sessions.js" resume [alias]
```

**Critical:** After showing the briefing, do NOT start working
automatically. Wait for the user to confirm what to do next.

### `list`

Browse sessions with metadata. Shows both auto-tracked sessions (from
hooks) and user-archived sessions.

Options:

- `--limit N` — show N results (default 20)
- `--date YYYY-MM-DD` — filter by date
- `--query id` — filter by session ID substring

```bash
node "${SKILL_ROOT}/scripts/sessions.js" list [--limit N] [--date YYYY-MM-DD] [--query id]
```

### `alias <id> <name>` / `aliases`

Create an alias for easy reference, or list all aliases.

```bash
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
│   ├── diary-{sessionId}.md              # Diary entry (from /diary)
```

## Common Mistakes

- Archiving every session by default — most endings only need a handover.
- Running `save` without reflecting first — always write enrichment based
  on conversation context before invoking the script.
- Starting work after `resume` without waiting for user confirmation.
- Leaving `<!-- TO BE ENRICHED -->` placeholders — fill in every section.
- Producing a "handover" that is actually a transcript dump — handovers
  are summaries, not logs.

## Key Principles

1. **Default to handover.** Archive only when the heuristics say so.
2. **User-controlled.** Sessions are saved or archived only when asked —
   no auto-injection of stale context.
3. **Reflection over mechanics.** Both handover and archive require the
   agent to think about the session, not just template-fill.
4. **Wait before working.** After `resume`, always wait for user
   confirmation.
5. **No native memory overlap.** This skill handles continuity; auto-
   memory handles preferences and feedback.
