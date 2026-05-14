---
name: arc-managing-sessions
description: Use when ending a session and handing off to a future session, summarizing recent context, continuing from where the last turn left off, archiving a session for durable reference, or resuming/listing/aliasing saved sessions
---

# Managing Sessions

## Overview

Two operations:

- **`handover`** — light, frequent. Produces a markdown file whose content **is** the next session's opening prompt. One command, no modes.
- **`save`** — heavy, rare. Produces a durable archive with full enrichment for re-reading weeks later.

**Default = handover, not archive.** Most cross-session continuity is `handover` material. Reach for `save` only when the work has lasting value (see Archive Recommendation below).

**Handover is for immediate continuity** — the next session needs to pick up work currently in flight. Cheap to produce. Frequent.

**Archive is for durable future reference** — the session contains decisions, playbooks, or patterns worth preserving and re-reading later. Heavy enrichment. Rare.

For trivial wrap-ups (pure Q&A, read-only inspection, no concrete next step), neither command is appropriate — just respond inline.

## Handover

The handover command writes a file whose content is the next session's opening prompt. The user pastes it in, or a future SessionStart hook auto-injects it.

### Command

```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-managing-sessions}"

node "${SKILL_ROOT}/scripts/sessions.js" handover \
  --next-step "Concrete first action for the next session" \
  [--focus "what the next session should focus on"] \
  [--context "background needed to act on next step"] \
  [--pointers "files / paths / commits to point at"] \
  [--dont-redo "abandoned approaches to avoid"]
```

`--next-step` is required — refusing skeleton output is what kills the placeholder failure mode. Optional sections are omitted entirely when empty.

### Artifact

```markdown
# Handover: {focus or "continue from where we left off"}

**From:** {date} / {sessionId}
**Branch:** {git branch — line omitted if not in a repo}
**Cwd:** {process.cwd()}

## What to do next
{nextStep}

## Context        ← only if provided
## Pointers       ← only if provided
## Don't redo     ← only if provided
```

File path: `~/.arcforge/sessions/{project}/{date}/handover-{slug}.md`. Slug is kebab-case from `--focus` (truncated to 30 chars), or `HHMMSS` timestamp when no focus.

### Two worked examples

**Case A — continuing a multi-phase plan.** Did 3 of 5 phases of a runtime plan; next session does 4–5.

```bash
node "${SKILL_ROOT}/scripts/sessions.js" handover \
  --focus "phases 4-5 of runtime plan" \
  --next-step "Continue at docs/plans/X.md from Phase 4 (data layer)" \
  --pointers "docs/plans/X.md:80-160; commits abc123, def456, ghi789" \
  --dont-redo "Phase 3 tried approach Z and failed because of W; Phases 4-5 should not revisit Z."
```

**Case B — clean follow-up after finishing a phase.** Done with phase 5; a new follow-up surfaced; next session focuses only on the follow-up.

```bash
node "${SKILL_ROOT}/scripts/sessions.js" handover \
  --focus "extract Y from cache layer" \
  --next-step "Refactor Y out of src/cache/index.js into its own module" \
  --context "Discovered during phase 5 wrap-up that Y is used in 3 places — warrants extraction." \
  --pointers "src/cache/index.js:120-180; usage in src/handler.js, src/worker.js, src/api.js"
```

Case B's handover deliberately omits everything about phase 5 — the focus IS the follow-up, and the new session only needs what it will act on.

### Reflection over mechanics

Don't run `handover` mechanically. Before invoking:

1. Decide what the new session genuinely needs to know to act — strip everything else.
2. Make `--next-step` concrete: a path, a line, a command, an exact first action.
3. Only fill `--context`, `--pointers`, `--dont-redo` when they're load-bearing for the next step.

If there is nothing concrete for next-step (pure Q&A, read-only investigation), do not invoke the command at all — respond inline with a brief wrap and note that archive (`save`) is not recommended.

## Archive — save / resume / list / alias

Heavier path for durable archive. Use only when at least one Archive Recommendation heuristic holds.

Set `SKILL_ROOT` before running scripts:

```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-managing-sessions}"
```

### Archive Recommendation

Default = handover, not archive. Only escalate to archive when at least one of these holds.

**Archive when:**

- The user explicitly asks to archive, save, snapshot, or "remember this session for later."
- **High decision density** — multiple non-obvious decisions, tradeoffs, or rejected alternatives that future sessions will want to look up.
- **High operational value** — playbooks, recovery steps, migration procedures, or one-off operations that other sessions or contributors will need to replay.
- **Long-running multi-session work** — the same epic or feature has spanned several sessions and is likely to span more.
- **Learning value** — the session surfaced a reusable pattern, antipattern, or insight worth reflecting on later.

**Do not archive when:**

- The session was pure Q&A or read-only inspection.
- The session was a trivial fix (typo, format, one-line bug) with nothing to learn from.
- The next step is just immediate tail continuity ("continue what we were doing 5 minutes ago") — use `handover` instead.
- The user has explicitly asked for short context only.

In all "do not archive" cases, do a handover (or for trivial wrap-ups, respond inline).

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

**Important:** Do NOT just run the script mechanically. Reflect on the conversation and write the enrichment content first, then call the script with those values (or write the session file directly and fill in every `<!-- TO BE ENRICHED -->` placeholder).

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

**Critical:** After showing the briefing, do NOT start working automatically. Wait for the user to confirm what to do next.

Handover files (`handover-*.md`) are NOT resumable through `resume` — they're meant to be pasted into a new session as the opening prompt.

### `list`

Browse sessions with metadata. Shows auto-tracked sessions (from hooks) and user-archived sessions. Handover files are not listed.

Options:

- `--limit N` — show N results (default 20)
- `--date YYYY-MM-DD` — filter by date
- `--query id` — filter by session ID substring

```bash
node "${SKILL_ROOT}/scripts/sessions.js" list [--limit N] [--date YYYY-MM-DD] [--query id]
```

### `alias <id> <name>` / `aliases`

Create an alias for easy reference to a saved session, or list all aliases. Handover files are not registered in the alias system.

```bash
node "${SKILL_ROOT}/scripts/sessions.js" alias <session-path> <name>
node "${SKILL_ROOT}/scripts/sessions.js" aliases
```

## Storage Layout

```
~/.arcforge/sessions/{project}/
├── aliases.json                         # Project-scoped alias registry (save only)
├── {YYYY-MM-DD}/
│   ├── {sessionId}.json                 # Auto-tracked session metrics
│   ├── handover-{slug}.md               # Lightweight handover (frequent)
│   ├── session-{alias}.md               # User-archived session via save (rare)
│   ├── diary-{sessionId}.md             # Diary entry (from /diary)
```

## Common Mistakes

- **Reaching for `save` when `handover` will do** — most cross-session pickups are handover material, not archive material.
- **Running `handover` or `save` without reflecting** — both require thinking about session content, not template-fill.
- **Leaving `<!-- TO BE ENRICHED -->` placeholders** in saved sessions — fill every section before considering done.
- **Starting work after `resume` without waiting for user confirmation.**
- **Invoking `handover` for trivial Q&A wrap-ups** — no concrete next step means no command; just respond inline.

## Key Principles

1. **Default to handover.** Archive (save) is the rare case — only when Archive Recommendation says so.
2. **User-controlled.** Sessions are saved or handed over only when asked — no auto-injection of stale context.
3. **Reflection over mechanics.** Both handover and save require thinking about session content, not template-fill.
4. **Wait before working.** After `resume`, always wait for user confirmation.
5. **No native memory overlap.** This skill handles continuity; auto-memory handles preferences and feedback.
