#!/usr/bin/env node
/**
 * Auto-Diary — Generate diary draft from session metrics + observations
 *
 * Commands:
 *   generate --project X --date Y --session Z   Generate draft diary
 *   finalize --project X --date Y --session Z    Promote draft to final
 */

const fs = require('fs');
const path = require('path');

const {
  getDiaryPath,
  getObservationsPath,
  CLAUDE_DIR
} = require('../../../scripts/lib/session-utils');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return { command, flags };
}

/**
 * Load session JSON for a given project/date/session.
 */
function loadSessionJson(project, date, sessionId) {
  const sessionFile = path.join(CLAUDE_DIR, 'sessions', project, date, `${sessionId}.json`);
  if (!fs.existsSync(sessionFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Summarize recent observations for a project.
 * Returns tool usage counts and common patterns.
 */
function summarizeObservations(project) {
  const obsPath = getObservationsPath(project);
  if (!fs.existsSync(obsPath)) return null;

  try {
    const content = fs.readFileSync(obsPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    if (lines.length === 0) return null;

    const toolCounts = {};
    const toolSequences = [];
    let lastTool = null;

    for (const line of lines) {
      try {
        const obs = JSON.parse(line);
        if (obs.event === 'tool_start') {
          const tool = obs.tool || 'unknown';
          toolCounts[tool] = (toolCounts[tool] || 0) + 1;

          if (lastTool) {
            toolSequences.push(`${lastTool} → ${tool}`);
          }
          lastTool = tool;
        }
      } catch {
        // Skip invalid lines
      }
    }

    // Find top tools
    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => `${tool} (${count}x)`);

    // Find repeated sequences
    const seqCounts = {};
    for (const seq of toolSequences) {
      seqCounts[seq] = (seqCounts[seq] || 0) + 1;
    }
    const topSeqs = Object.entries(seqCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([seq, count]) => `${seq} (${count}x)`);

    return {
      totalObservations: lines.length,
      topTools,
      topSequences: topSeqs
    };
  } catch {
    return null;
  }
}

/**
 * Get draft diary path.
 */
function getDraftPath(project, date, sessionId) {
  return path.join(CLAUDE_DIR, 'sessions', project, date, `diary-${sessionId}-draft.md`);
}

/**
 * Generate a diary draft enriched with metrics and observation data.
 */
function generateDraft(project, date, sessionId) {
  const session = loadSessionJson(project, date, sessionId);
  const observations = summarizeObservations(project);

  const timestamp = new Date().toISOString();
  const duration = session
    ? Math.round((new Date(session.lastUpdated) - new Date(session.started)) / 60000)
    : 0;

  const lines = [
    `# Session Diary: ${project}`,
    '',
    `**Date:** ${date}`,
    `**Session ID:** ${sessionId}`,
    ''
  ];

  // Metrics section (auto-filled)
  lines.push('## Session Metrics');
  lines.push('');
  if (session) {
    lines.push(`- **Duration**: ~${duration > 0 ? duration : '?'} minutes`);
    lines.push(`- **Tool calls**: ${session.toolCalls || 0}`);
    lines.push(`- **User messages**: ${session.userMessages || 0}`);
    lines.push(`- **Compactions**: ${(session.compactions || []).length}`);
    if (session.filesModified?.length > 0) {
      lines.push(`- **Files modified**: ${session.filesModified.join(', ')}`);
    }
  } else {
    lines.push('- _No session data available_');
  }

  // Observation summary (auto-filled)
  if (observations) {
    lines.push('');
    lines.push('## Tool Usage Summary');
    lines.push('');
    lines.push(`- **Total observations**: ${observations.totalObservations}`);
    if (observations.topTools.length > 0) {
      lines.push(`- **Most used**: ${observations.topTools.join(', ')}`);
    }
    if (observations.topSequences.length > 0) {
      lines.push(`- **Common sequences**: ${observations.topSequences.join(', ')}`);
    }
  }

  // Template sections (to be enriched by Claude)
  lines.push('');
  lines.push('## Decisions Made');
  lines.push('');
  lines.push('<!-- TO BE ENRICHED — Fill from conversation memory -->');
  lines.push('- ');
  lines.push('');
  lines.push('## User Preferences Observed');
  lines.push('');
  lines.push('<!-- TO BE ENRICHED — What preferences did the user express? -->');
  lines.push('- ');
  lines.push('');
  lines.push('## What Worked Well');
  lines.push('');
  lines.push('<!-- TO BE ENRICHED — What techniques or approaches succeeded? -->');
  lines.push('- ');
  lines.push('');
  lines.push('## Challenges & Solutions');
  lines.push('');
  lines.push('<!-- TO BE ENRICHED — What went wrong and how was it resolved? -->');
  lines.push('- **Challenge**: ');
  lines.push('- **Solution**: ');
  lines.push('- **Generalizable?**: Yes/No');
  lines.push('');
  lines.push('## Completed');
  lines.push('');
  lines.push('<!-- TO BE ENRICHED — What was accomplished this session? -->');
  lines.push('- ');
  lines.push('');
  lines.push('## In Progress');
  lines.push('');
  lines.push('<!-- TO BE ENRICHED — What\'s still ongoing? -->');
  lines.push('- ');
  lines.push('');
  lines.push('## Context for Next Session');
  lines.push('');
  lines.push('<!-- TO BE ENRICHED — What context would help next time? -->');
  lines.push('- ');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`_Draft generated at ${timestamp}_`);
  lines.push('');

  return lines.join('\n');
}

// ─────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────

function cmdGenerate(project, date, sessionId) {
  const draft = generateDraft(project, date, sessionId);
  const draftPath = getDraftPath(project, date, sessionId);

  // Ensure directory exists
  const dir = path.dirname(draftPath);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(draftPath, draft, 'utf-8');
  console.log(draftPath);
}

function cmdFinalize(project, date, sessionId) {
  const draftPath = getDraftPath(project, date, sessionId);
  const finalPath = getDiaryPath(project, date, sessionId);

  if (!fs.existsSync(draftPath)) {
    console.error(`No draft found at: ${draftPath}`);
    process.exit(1);
  }

  // Ensure directory exists
  const dir = path.dirname(finalPath);
  fs.mkdirSync(dir, { recursive: true });

  fs.renameSync(draftPath, finalPath);
  console.log(`Finalized: ${finalPath}`);
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

function main() {
  const { command, flags } = parseArgs(process.argv);
  const { project, date, session } = flags;

  if (!project || !date || !session) {
    console.error('Usage: auto-diary.js <generate|finalize> --project X --date Y --session Z');
    process.exit(1);
  }

  switch (command) {
    case 'generate':
      cmdGenerate(project, date, session);
      break;
    case 'finalize':
      cmdFinalize(project, date, session);
      break;
    default:
      console.error('Usage: auto-diary.js <generate|finalize> --project X --date Y --session Z');
      process.exit(1);
  }
}

// Export for testing
module.exports = {
  loadSessionJson,
  summarizeObservations,
  generateDraft,
  getDraftPath,
  parseArgs
};

if (require.main === module) {
  main();
}
