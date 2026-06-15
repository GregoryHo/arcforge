#!/usr/bin/env node
/**
 * PreCompact Hook
 *
 * Runs before context compaction to update the current session file
 * with a compaction marker.
 *
 * Non-blocking: Always exits 0 to avoid disrupting compaction flow.
 */

const path = require('node:path');
const {
  getSessionDir,
  getTimestamp,
  getDateString,
  getProjectName,
  getSessionId,
  readFileSafe,
  writeFileSafe,
  log,
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  loadSession,
  saveSession,
} = require('../../scripts/lib/utils');
const { addPendingAction } = require('../../scripts/lib/pending-actions');
const { runDiaryCapture } = require('../../scripts/lib/diary-capture');

/**
 * Update session file with compaction marker
 */
function updateSessionFile(project, date, timestamp, sessionId) {
  const sessionFile = path.join(getSessionDir(project, date), `${sessionId}.json`);

  const content = readFileSafe(sessionFile);
  if (!content) return false;

  try {
    const session = JSON.parse(content);
    session.compactions = session.compactions || [];
    session.compactions.push(timestamp);
    session.lastCompaction = timestamp;
    session.lastUpdated = timestamp;

    writeFileSafe(sessionFile, JSON.stringify(session, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Main entry point
 */
function main() {
  try {
    // Read stdin and passthrough to stdout (PreCompact stdout is the transcript channel)
    const stdin = readStdinSync();
    if (stdin) process.stdout.write(stdin);

    // Resolve session id from stdin BEFORE any counter/state access so the
    // counters we read are the live session's — not whatever CLAUDE_SESSION_ID
    // env happened to be set to (S5-4).
    const input = parseStdinJson(stdin);
    setSessionIdFromInput(input);

    const project = getProjectName();
    const date = getDateString();
    const sessionId = getSessionId();
    const timestamp = getTimestamp();

    // Update session file with compaction marker
    updateSessionFile(project, date, timestamp, sessionId);

    // Shared diary-capture core: threshold gate → draft → background enricher
    // → counter reset. Enricher fires on PreCompact too (dual-path ON).
    const { triggered, userCount, toolCount } = runDiaryCapture({ project, date, sessionId });

    if (triggered) {
      // Stamp the current counts onto the session file.
      const session = loadSession();
      if (session) {
        session.userMessages = userCount;
        session.toolCalls = toolCount;
        saveSession(session);
      }

      // Queue notification for next SessionStart (PreCompact stdout doesn't render systemMessage)
      addPendingAction(project, 'diary-ready', {
        trigger: 'compaction',
        userMessages: userCount,
        toolCalls: toolCount,
      });

      log(
        `[pre-compact] Diary draft generated (${userCount} msgs, ${toolCount} tools). Queued diary-ready action.`,
      );
    } else {
      log(
        `[pre-compact] Below threshold (${userCount} msgs, ${toolCount} tools). Counters preserved.`,
      );
    }
  } catch (e) {
    // Never block compaction
    log(`[pre-compact] Warning: ${e.message}`);
  }
}

// Export for testing
module.exports = { updateSessionFile };

// Run if executed directly
if (require.main === module) {
  main();
}
