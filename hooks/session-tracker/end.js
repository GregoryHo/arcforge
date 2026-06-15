#!/usr/bin/env node
/**
 * Session Tracker - Stop Hook
 *
 * Runs on Stop to:
 * 1. Update session file with final metrics
 * 2. Generate diary draft and spawn background enricher
 * 3. Queue pending actions (reflect-ready)
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  writeFileSafe,
  loadSession,
  getSessionDir,
  getProjectName,
  getDateString,
  getSessionId,
  getTimestamp,
  output,
} = require('../../scripts/lib/utils');
const { addPendingAction } = require('../../scripts/lib/pending-actions');
const { runDiaryCapture, readCounts } = require('../../scripts/lib/diary-capture');
const { parseTranscript } = require('../../scripts/lib/transcript');

/**
 * Calculate duration in minutes between two ISO timestamps
 */
function calculateDurationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const durationMs = new Date(endISO) - new Date(startISO);
  return Math.round(durationMs / 60000);
}

/**
 * Create default session if none exists
 */
function getOrCreateSession() {
  const session = loadSession();
  if (session) return session;

  return {
    sessionId: getSessionId(),
    project: getProjectName(),
    date: getDateString(),
    started: getTimestamp(),
    lastUpdated: getTimestamp(),
    toolCalls: 0,
    filesModified: [],
    compactions: [],
  };
}

/**
 * Save session JSON (always saved for tracking)
 */
function saveSessionJson(session) {
  const sessionFile = path.join(
    getSessionDir(session.project, session.date),
    `${session.sessionId}.json`,
  );
  writeFileSafe(sessionFile, JSON.stringify(session, null, 2));
}

/**
 * Check if reflection is ready.
 * Returns { ready, strategy, count } or null on failure.
 */
function checkReflectReady(project) {
  try {
    const reflectPath = path.join(__dirname, '../../skills/arc-reflecting/scripts/reflect.js');
    const result = execFileSync('node', [reflectPath, 'auto-check', '--project', project], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    const [status, strategy, count] = result.split('|');
    return { ready: status === 'ready', strategy, count: parseInt(count, 10) || 0 };
  } catch {
    return null;
  }
}

/**
 * Format session stats as a one-liner.
 */
function formatStats(session) {
  const duration = calculateDurationMinutes(session.started, session.lastUpdated);

  let stats = `${session.userMessages || 0} messages, ${session.toolCalls} tool calls`;
  if (duration > 0) {
    stats = `~${duration} min, ${stats}`;
  }
  if (session.filesModified?.length > 0) {
    stats += `, ${session.filesModified.length} files modified`;
  }
  return stats;
}

/**
 * Format short message for stderr output (when threshold is not met)
 */
function formatShortMessage(userCount, toolCount) {
  return `📝 Session paused. (${userCount} messages, ${toolCount} tool calls)
   Counters preserved for next resume.`;
}

/**
 * Main entry point
 */
function main() {
  const stdin = readStdinSync();
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  const session = getOrCreateSession();
  const { userCount, toolCount } = readCounts();

  session.lastUpdated = getTimestamp();
  session.userMessages = userCount;
  session.toolCalls = toolCount;

  // Enrich with transcript data if available
  const transcriptPath = input?.transcript_path;
  const transcriptData = transcriptPath ? parseTranscript(transcriptPath) : null;

  if (transcriptData) {
    session.userMessageContent = transcriptData.userMessages;
    session.toolsUsed = transcriptData.toolsUsed;
    session.filesModified = transcriptData.filesModified;
  } else {
    session.filesModified = [];
  }

  saveSessionJson(session);

  // Shared diary-capture core: threshold gate → draft → background enricher
  // → counter reset (the sole reset path). The parsed-session summary is
  // handed to the enricher.
  const { triggered } = runDiaryCapture({
    project: session.project,
    date: session.date,
    sessionId: session.sessionId,
    transcriptData: {
      userMessages: session.userMessageContent || [],
      toolsUsed: session.toolsUsed || [],
      filesModified: session.filesModified || [],
      stats: formatStats(session),
    },
  });

  if (triggered) {
    const reflectStatus = checkReflectReady(session.project);
    if (reflectStatus?.ready) {
      addPendingAction(session.project, 'reflect-ready', {
        strategy: reflectStatus.strategy,
        count: reflectStatus.count,
      });
    }
  }

  output({ systemMessage: formatShortMessage(userCount, toolCount) });

  process.exit(0);
}

// Export for testing
module.exports = {
  calculateDurationMinutes,
  getOrCreateSession,
  saveSessionJson,
  formatStats,
  formatShortMessage,
  checkReflectReady,
};

// Run if executed directly
if (require.main === module) {
  main();
}
