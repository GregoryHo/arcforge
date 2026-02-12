#!/usr/bin/env node
/**
 * Session Tracker - Stop Hook
 *
 * Runs on Stop to:
 * 1. Update session file with final metrics
 * 2. Save tool call count
 * 3. Output JSON with decision: "block" to prompt Claude to review diary draft
 *
 * Note: Uses Stop hook (not SessionEnd) so Claude sees and executes the prompt.
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
  log,
  outputDecision,
} = require('../lib/utils');
const {
  readCount: readToolCount,
  resetCounter: resetToolCounter,
} = require('../compact-suggester/main');
const {
  readCount: readUserCount,
  resetCounter: resetUserCounter,
} = require('../user-message-counter/main');
const { shouldTrigger } = require('../lib/thresholds');
const { calculateDurationMinutes } = require('./summary');

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
 * Try to generate auto-diary draft.
 * Returns draft path on success, null on failure.
 */
function tryGenerateAutoDiary(project, date, sessionId) {
  try {
    const autoDiaryPath = path.join(__dirname, '../../skills/arc-journaling/scripts/auto-diary.js');
    const result = execFileSync(
      'node',
      [autoDiaryPath, 'generate', '--project', project, '--date', date, '--session', sessionId],
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    return result || null;
  } catch {
    return null;
  }
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
 * Format stop reason for decision: "block" output (when threshold is met)
 * Claude will see and execute this prompt.
 * @returns {string} The reason/prompt for Claude to execute
 */
function formatStopReason(session, draftPath) {
  const duration = calculateDurationMinutes(session.started, session.lastUpdated);

  let stats = `${session.userMessages || 0} messages, ${session.toolCalls} tool calls`;
  if (duration > 0) {
    stats = `~${duration} min, ${stats}`;
  }
  if (session.filesModified?.length > 0) {
    stats += `, ${session.filesModified.length} files modified`;
  }

  let prompt;
  if (draftPath) {
    prompt = `Review and enrich the draft diary at ${draftPath}
Fill in the <!-- TO BE ENRICHED --> sections from conversation memory.
Use the arc-journaling skill to finalize.`;
  } else {
    prompt = `Consider creating a diary entry if this session warrants one.`;
  }
  return `Session ended. (${stats})\n\n${prompt}`;
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

  if (input?.stop_hook_active) {
    // Already processing stop hook - allow stop to prevent infinite loop
    process.exit(0);
    return;
  }

  const session = getOrCreateSession();
  const userCount = readUserCount();
  const toolCount = readToolCount();

  session.lastUpdated = getTimestamp();
  session.userMessages = userCount;
  session.toolCalls = toolCount;
  session.filesModified = [];

  saveSessionJson(session);

  if (shouldTrigger(userCount, toolCount)) {
    const draftPath = tryGenerateAutoDiary(session.project, session.date, session.sessionId);

    const reflectStatus = checkReflectReady(session.project);
    if (reflectStatus?.ready) {
      const { addPendingAction } = require('../../scripts/lib/pending-actions');
      addPendingAction(session.project, 'reflect-ready', {
        strategy: reflectStatus.strategy,
        count: reflectStatus.count,
      });
    }

    outputDecision(formatStopReason(session, draftPath));

    resetUserCounter();
    resetToolCounter();
  } else {
    log(formatShortMessage(userCount, toolCount));
  }

  process.exit(0);
}

// Export for testing
module.exports = {
  getOrCreateSession,
  saveSessionJson,
  formatStopReason,
  formatShortMessage,
  tryGenerateAutoDiary,
  checkReflectReady,
};

// Run if executed directly
if (require.main === module) {
  main();
}
