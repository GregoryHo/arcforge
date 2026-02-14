---
name: arc-observing
description: Use when user asks about behavioral patterns, requests instinct status, or wants to confirm/contradict a detected pattern
---

# Behavioral Observation & Instinct Management

## Overview

Manage automatically detected behavioral patterns (instincts) from tool usage observations. The observer daemon runs in the background, analyzing tool call patterns and creating instincts — atomic behavioral rules with confidence scores.

**Two knowledge tracks in arcforge:**
- **Behavioral (instincts)** — auto-detected from tool usage patterns (this skill)
- **Decisional (diary→reflect→learn)** — human-directed at session boundaries

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

1. **Capture**: `hooks/observe/main.js` records every tool call to `~/.claude/observations/{project}/observations.jsonl`
2. **Analysis**: Background daemon reads observations (10+ required), calls Haiku to detect patterns
3. **Creation**: Instincts saved as `.md` files with YAML frontmatter in `~/.claude/instincts/{project}/`
4. **Loading**: Session start loads instincts with confidence >= 0.7 into Claude context
5. **Lifecycle**: Confirm (+0.05) / Contradict (-0.10, -0.05 for manual/reflection) / Decay (-0.02/week, -0.01 for manual/reflection) / Archive (< 0.15)

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
~/.claude/
├── observations/{project}/
│   ├── observations.jsonl          # Current (append-only)
│   └── archive/                    # Processed observations
│
├── instincts/
│   ├── {project}/
│   │   ├── grep-before-edit.md     # Atomic instincts
│   │   └── archived/               # Decayed instincts
│   ├── global/                     # Cross-project (auto-promoted)
│   ├── global-index.jsonl          # Bubble-up tracking
│   ├── config.json                 # Observer configuration
│   └── .observer.pid               # Daemon PID file
```

## Confidence Lifecycle

```
Auto-detected by daemon: confidence 0.5
Confirmed → +0.05 (cap 0.9)
Contradicted → -0.10 (floor 0.1), -0.05 for manual/reflection sources
No activity → -0.02/week, -0.01/week for manual/reflection sources

>= 0.7 → Auto-loaded into Claude context
0.3-0.7 → Listed as summary
< 0.3 → Silent
< 0.15 → Archived (moved to archived/ subdir)
```

## When to Use

- User asks "what patterns have you noticed?"
- User wants to see instinct status dashboard
- User confirms or contradicts a detected pattern
- User asks about behavioral observation system
- Presenting instincts loaded at session start

## When NOT to Use

- User wants to extract reusable techniques (use /learn)
- User wants to capture session reflections (use /diary)
- User wants to analyze diary entries (use /reflect)

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

Patterns appearing in 2+ projects are auto-promoted to `~/.claude/instincts/global/`. At session start, user is notified of newly promoted global patterns.

## Common Mistakes

### Confusing Instincts with Learned Skills
**Wrong:** Manually creating instincts for techniques
**Right:** Instincts are auto-detected from behavior; techniques go to /learn

### Ignoring Low-Confidence Instincts
**Wrong:** Treating all instincts equally
**Right:** Only auto-load >= 0.7; show summaries for 0.3-0.7; hide < 0.3

### Not Updating Confidence
**Wrong:** Showing instincts without offering confirm/contradict
**Right:** Always offer user the chance to validate or reject patterns
