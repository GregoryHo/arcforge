---
name: arc-sessions
description: Use when user wants to save a session checkpoint, resume a previous session, list sessions, or manage session aliases
user-invocable: true
argument-hint: "save [alias] | resume [alias] | list | alias <id> <name> | aliases"
---

# Session Save & Resume

## Overview

User-controlled session checkpoints for continuity across conversations. Save what matters, resume when needed.

**Three arcforge pipelines — this skill handles Continuity:**
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
node -e "
const { getProjectName, getSessionId, getDateString, getSessionDir, loadSession, writeFileSafe } = require('${ARCFORGE_ROOT}/scripts/lib/utils');
const { generateCheckpoint } = require('${ARCFORGE_ROOT}/scripts/lib/session-utils');
const { setAlias } = require('${ARCFORGE_ROOT}/scripts/lib/session-aliases');

const project = getProjectName();
const date = getDateString();
const sessionId = getSessionId();
const session = loadSession() || { sessionId, project, date };
const alias = process.argv[1] || sessionId.replace('session-', '').slice(0, 8);

// Generate checkpoint — pass enrichment object with your analysis
const checkpoint = generateCheckpoint(session, null, {
  summary: process.argv[2] || '',
  whatWorked: process.argv[3] || '',
  whatFailed: process.argv[4] || '',
  blockers: process.argv[5] || '',
  nextStep: process.argv[6] || '',
});

const checkpointPath = require('path').join(getSessionDir(project, date), 'checkpoint-' + alias + '.md');
writeFileSafe(checkpointPath, checkpoint);

if (process.argv[1]) {
  const result = setAlias(project, alias, checkpointPath);
  console.log(result.success ? 'Alias created: ' + alias : 'Alias failed: ' + result.error);
}

console.log('Checkpoint saved: ' + checkpointPath);
" "$ARGUMENTS"
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
node -e "
const { getProjectName, readFileSafe } = require('${ARCFORGE_ROOT}/scripts/lib/utils');
const { formatSessionBriefing, listSessions } = require('${ARCFORGE_ROOT}/scripts/lib/session-utils');
const { resolveAlias } = require('${ARCFORGE_ROOT}/scripts/lib/session-aliases');

const project = getProjectName();
const arg = process.argv[1];

let checkpointPath;
if (arg) {
  const resolved = resolveAlias(project, arg);
  checkpointPath = resolved ? resolved.checkpointPath : arg;
} else {
  // Find most recent checkpoint
  const { sessions } = listSessions(project, { limit: 100 });
  // Look for checkpoint files in recent date dirs
  const fs = require('fs');
  const path = require('path');
  for (const s of sessions) {
    const dir = path.dirname(path.join(require('os').homedir(), '.claude', 'sessions', project, s.dateStr, s.filename));
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith('checkpoint-')) : [];
    if (files.length > 0) {
      checkpointPath = path.join(dir, files.sort().reverse()[0]);
      break;
    }
  }
}

if (!checkpointPath) {
  console.log('No checkpoint found. Use /sessions save to create one.');
  process.exit(1);
}

const content = readFileSafe(checkpointPath);
if (!content) {
  console.log('Checkpoint not found: ' + checkpointPath);
  process.exit(1);
}

console.log(formatSessionBriefing(content, checkpointPath));
" "$ARGUMENTS"
```

**Critical**: After showing the briefing, do NOT start working automatically. Wait for the user to confirm what to do next.

### `/sessions list`

Browse sessions with metadata.

**Infrastructure:**
```bash
node -e "
const { getProjectName } = require('${ARCFORGE_ROOT}/scripts/lib/utils');
const { listSessions } = require('${ARCFORGE_ROOT}/scripts/lib/session-utils');
const { listAliases } = require('${ARCFORGE_ROOT}/scripts/lib/session-aliases');

const project = getProjectName();
const { sessions, total } = listSessions(project, { limit: 20 });
const aliases = listAliases(project);
const aliasMap = {};
for (const a of aliases) aliasMap[a.checkpointPath] = a.name;

console.log('Sessions for ' + project + ' (showing ' + sessions.length + ' of ' + total + '):');
console.log('');
console.log('ID              Date        Messages  Tools   Alias');
console.log('────────────────────────────────────────────────────');

for (const s of sessions) {
  const id = (s.sessionId || '').replace('session-', '').slice(0, 12).padEnd(14);
  const date = (s.dateStr || '').padEnd(12);
  const msgs = String(s.userMessages || 0).padEnd(10);
  const tools = String(s.toolCalls || 0).padEnd(8);
  // Check if any alias points to a checkpoint for this session
  const alias = Object.entries(aliasMap).find(([p]) => p.includes(s.sessionId)) || [];
  console.log(id + date + msgs + tools + (alias[1] || ''));
}
" "$ARGUMENTS"
```

### `/sessions alias <id> <name>`

Create an alias for easy reference.

**Infrastructure:**
```bash
node -e "
const { getProjectName } = require('${ARCFORGE_ROOT}/scripts/lib/utils');
const { setAlias } = require('${ARCFORGE_ROOT}/scripts/lib/session-aliases');

const project = getProjectName();
const args = process.argv.slice(1);
const checkpointPath = args[0];
const alias = args[1];

if (!checkpointPath || !alias) {
  console.log('Usage: /sessions alias <checkpoint-path> <name>');
  process.exit(1);
}

const result = setAlias(project, alias, checkpointPath);
console.log(result.success ? 'Alias created: ' + alias + ' → ' + checkpointPath : 'Error: ' + result.error);
" "$ARGUMENTS"
```

### `/sessions aliases`

List all session aliases.

**Infrastructure:**
```bash
node -e "
const { getProjectName } = require('${ARCFORGE_ROOT}/scripts/lib/utils');
const { listAliases } = require('${ARCFORGE_ROOT}/scripts/lib/session-aliases');

const project = getProjectName();
const aliases = listAliases(project);

if (aliases.length === 0) {
  console.log('No aliases found. Use /sessions save <name> to create one.');
  process.exit(0);
}

console.log('Session Aliases (' + aliases.length + '):');
console.log('');
console.log('Name            Updated              Title');
console.log('─────────────────────────────────────────────────────');
for (const a of aliases) {
  const name = a.name.padEnd(14);
  const updated = (a.updatedAt || a.createdAt || '').slice(0, 19).padEnd(21);
  const title = a.title || '';
  console.log(name + ' ' + updated + ' ' + title);
}
" "$ARGUMENTS"
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
