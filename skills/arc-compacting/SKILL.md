---
name: arc-compacting
description: Guide for strategic manual compaction timing at workflow phase boundaries
---

# arc-compacting

Guide compaction decisions at logical workflow boundaries instead of letting auto-compaction fire mid-task. Compact at the right time to preserve context quality without losing critical state.

**Core principle:** Compact between phases (when state is persisted to files), not during phases (when context holds un-persisted decisions).

## When to Use

Use this skill when:
- The compact-suggester hook fires a threshold notification
- You're transitioning between workflow phases (brainstorming → planning → implementation)
- A long session is accumulating stale context
- You've just saved deliverables to files and context is bulky

## Decision Guide

| Phase Transition | Compact? | Why |
|-----------------|----------|-----|
| Exploration → planning | **Yes** | Research context is bulky; plan is the distilled output |
| Planning → implementation | **Yes** | DAG/tasks are in files; free up context for code |
| Implementation → testing | **Maybe** | Keep if tests reference recent code changes |
| Debugging → next feature | **Yes** | Debug traces pollute context for unrelated work |
| Mid-implementation | **No** | Losing variable names, file paths, partial state is costly |
| After failed approach | **Yes** | Clear dead-end reasoning before new approach |
| After `arc-brainstorming` produces design doc | **Yes** | Design is saved to file; compact before refining |
| After `arc-planning` produces dag.yaml | **Yes** | DAG persists; free context for implementation |

## What Survives vs What's Lost

| Persists After Compact | Lost After Compact |
|------------------------|-------------------|
| CLAUDE.md + rules (auto-loaded) | Intermediate reasoning |
| Tasks (TodoWrite) | File contents previously read |
| Memory files | Conversation context |
| Git state (commits, branches) | Tool call history |
| dag.yaml, .arcforge-epic | Verbal preferences given this session |
| Skill definitions (auto-loaded) | Session-specific observations |

## Best Practices

### Before Compacting

1. **Write before compacting** — save decisions to files or memory
   - Design decisions → `docs/plans/` or memory
   - Task progress → update dag.yaml or TodoWrite
   - Observations → memory files
2. **Run `/diary`** if the session was substantial — captures session insights before they're lost
3. **Check for un-committed work** — ensure valuable changes are committed

### During Compact

Use a focused compact command to orient the post-compact session:

```
/compact Focus on implementing [next task] using arc-agent-driven
```

The summary text becomes the seed for the compressed context. Make it actionable.

### After Compact

- Run `arcforge reboot` to recover DAG context quickly
- Re-read any files you'll need for the next phase
- The agent will have CLAUDE.md, rules, and memory — but not conversation history

## Integration

**Works with:**
- **compact-suggester hook** — triggers threshold notifications that reference this skill
- **pre-compact hook** — auto-triggers diary capture before compaction
- **arc-agent-driven** — compact between task batches, not mid-task
- **arc-planning** — compact after DAG is written to disk

**Red Flags:**
- Compacting while holding un-persisted design decisions
- Compacting mid-implementation when partial state is in context only
- Ignoring compact suggestions past 75+ tool calls (context quality degrades)
- Compacting without saving observations to memory first
