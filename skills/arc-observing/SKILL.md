---
name: arc-observing
description: Use when user asks about behavioral patterns, requests instinct status, or wants to confirm/contradict a detected pattern
---

# Behavioral Observation & Instinct Management

## Overview

Manage automatically detected behavioral patterns (instincts) from tool usage observations. The observer daemon runs in the background as an orchestrator: it captures tool-call observations, assembles batches, calls the LLM curator to generate candidate proposals, and ingests those proposals into the learning queue. Confirmed instincts are loaded as behavioral guidance at session start.

**Three layers in arcforge — this skill handles Behavioral:**
- **Behavioral (instincts)** — auto-detected from tool usage patterns (this skill). Focuses on tool-usage workflow patterns only. User preferences and project context are handled by Claude Code's native auto-memory.
- **Continuity (sessions)** — user-controlled save/resume for session handoff
- **Learning (diary→reflect→learn)** — deliberate reflection for pattern extraction

## Quick Reference

| Task | Command |
|------|---------|
| **View instincts** | `node "${SKILL_ROOT}/scripts/instinct.js" status --project {p}` |
| **Confirm pattern** | `node "${SKILL_ROOT}/scripts/instinct.js" confirm {id} --project {p}` |
| **Contradict pattern** | `node "${SKILL_ROOT}/scripts/instinct.js" contradict {id} --project {p}` |
| **Daemon status** | `bash "${SKILL_ROOT}/scripts/observer-daemon.sh" status` |
| **Start daemon** | `bash "${SKILL_ROOT}/scripts/observer-daemon.sh" start` |
| **Stop daemon** | `bash "${SKILL_ROOT}/scripts/observer-daemon.sh" stop` |

## Infrastructure Commands

**Set SKILL_ROOT** from skill loader header (`# SKILL_ROOT: ...`):
```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-observing}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
```

## How Observations Work

The observer daemon is a four-layer orchestrator:

1. **Capture**: `hooks/observe/main.js` records every tool call to `~/.arcforge/observations/{project}/observations.jsonl`
2. **Batch assembly** (Layer 3): Daemon calls `node $CURATOR_CLI assemble-batch --project` to gather recent observation windows into a structured batch
3. **LLM curation** (Layer 4): Daemon invokes `claude --model haiku --max-turns 15 --print --output-format json --json-schema` with the batch. The LLM curator produces structured candidate proposals rather than direct instinct file writes
4. **Ingestion** (Layer 5): Daemon calls `node $CURATOR_CLI ingest-proposal --batch-id --response-file` to parse the LLM response and append candidates to the review queue at `~/.arcforge/learning/candidates/queue.jsonl`

The daemon never writes instinct `.md` files directly, and SessionStart never auto-loads instinct bodies into Claude context. All candidate proposals flow through the LLM curator into the review queue; human review via `arcforge learn dashboard` is the only path that produces active instinct files (Layer 8 activation), and activated instincts are surfaced through dashboard / history / evolve flows rather than runtime auto-injection.

## Instinct Format

```markdown
---
id: grep-before-edit
trigger: "when modifying code in a file"
confidence: 0.65
domain: workflow
source: session-observation
project: my-api
last_confirmed: 2026-02-08
confirmations: 8
contradictions: 0
---

# Grep Before Edit

## Action
Always use Grep to find the exact location before using Edit.

## Evidence
- Observed 8 times in session abc123 (2026-02-08)
- Pattern: Grep → Read → Edit sequence
```

## Storage

```
~/.arcforge/
├── observations/{project}/
│   ├── observations.jsonl          # Current (append-only)
│   └── archive/                    # Processed observations
│
├── instincts/
│   ├── {project}/
│   │   ├── grep-before-edit.md     # Atomic instincts
│   │   └── archived/               # Decayed instincts
│   ├── global/                     # Cross-project (promoted via dashboard)
│   ├── global-index.jsonl          # Bubble-up tracking
│   ├── config.json                 # Observer configuration
│   └── .observer.pid               # Daemon PID file
│
└── learning/
    ├── candidates/
    │   └── queue.jsonl             # LLM curator output (pending review)
    └── dashboard/
        └── actions.jsonl           # Dashboard action audit log
```

## Confidence Lifecycle

Confidence is metadata stored on the candidate / activated instinct record. It does **not** drive runtime auto-loading. It informs which records to surface in dashboard / `arc-recalling` / history views.

```
Auto-detected by daemon: confidence 0.5
Confirmed → +0.05 (cap 0.9)
Contradicted → -0.10 (floor 0.1), -0.05 for manual/reflection sources
No activity → -0.02/week, -0.01/week for manual/reflection sources

>= 0.7 → Surfaced prominently in dashboard / arc-recalling
0.3-0.7 → Listed as summary
< 0.3 → Silent
< 0.15 → Archived (moved to archived/ subdir)
```

## Daemon Safety

- **Re-entrancy guard**: The daemon checks for a `.analyzing.lock` file with a 30-minute stale TTL before running the LLM curator. Concurrent daemon runs are blocked automatically.
- **Watchdog**: A `OBSERVER_DAEMON_WATCHDOG_SECS` (default 120s) timeout prevents hung LLM curator calls from blocking subsequent runs.
- **Skip filter**: `ARCFORGE_OBSERVE_SKIP_PATHS` and `.eval-trials/` paths are excluded from observation capture to prevent eval noise from polluting the learning queue.

## When to Use

- User asks "what patterns have you noticed?"
- User wants to see instinct status dashboard
- User confirms or contradicts a detected pattern
- User asks about behavioral observation system
- Presenting instincts loaded at session start

## When NOT to Use

- User wants to extract reusable techniques (use /learn)
- User wants to capture session reflections (use arc-journaling)
- User wants to analyze diary entries (use arc-reflecting)

## Process

### Presenting Instincts

When showing instincts to users, group by domain and show confidence bars:

```
## WORKFLOW (3)

  ████████░░  80%  grep-before-edit
            trigger: when modifying code
            action: Always grep first

  ██████░░░░  60%  read-before-write
            trigger: when creating files
            action: Check if file exists first
```

### Confirming/Contradicting

When user agrees or disagrees with a pattern:
1. Run confirm/contradict CLI command
2. Show updated confidence
3. Explain the change

### Bubble-up to Global

Patterns appearing in 2+ projects can be promoted to `~/.arcforge/instincts/global/` via the dashboard Promote action. The Promote action requires explicit user authorization — silent auto-promotion is not supported.

## Common Mistakes

### Confusing Instincts with Learned Skills
**Wrong:** Manually creating instincts for techniques
**Right:** Instincts are auto-detected from behavior; techniques go to /learn

### Ignoring Low-Confidence Instincts
**Wrong:** Treating all instincts equally
**Right:** Surface >= 0.7 prominently in dashboard / `arc-recalling`; summaries for 0.3-0.7; hide < 0.3. Confidence informs surfacing, not runtime auto-loading.

### Not Updating Confidence
**Wrong:** Showing instincts without offering confirm/contradict
**Right:** Always offer user the chance to validate or reject patterns
