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
const { execFileSync } = require('node:child_process');
const {
  getSessionDir,
  getTimestamp,
  getDateString,
  getProjectName,
  getSessionId,
  readFileSafe,
  writeFileSafe,
  createSessionCounter,
  log,
  readStdinSync,
  loadSession,
  saveSession,
} = require('../../scripts/lib/utils');
const {
  readCount: readUserCount,
  resetCounter: resetUserCounter,
} = require('../user-message-counter/main');
const { shouldTrigger } = require('../../scripts/lib/thresholds');
const { addPendingAction } = require('../../scripts/lib/pending-actions');

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

    const project = getProjectName();
    const date = getDateString();
    const sessionId = getSessionId();
    const timestamp = getTimestamp();

    // Update session file with compaction marker
    updateSessionFile(project, date, timestamp, sessionId);

    // Read counters
    const userCount = readUserCount();
    const toolCount = createSessionCounter('tool-count').read();

    // Check threshold for diary trigger
    if (shouldTrigger(userCount, toolCount)) {
      // Update session with current counts
      const session = loadSession();
      if (session) {
        session.userMessages = userCount;
        session.toolCalls = toolCount;
        saveSession(session);
      }

      // Generate auto-diary draft (silent, best-effort)
      try {
        const autoDiaryPath = path.join(
          __dirname,
          '../../skills/arc-journaling/scripts/auto-diary.js',
        );
        execFileSync(
          'node',
          [autoDiaryPath, 'generate', '--project', project, '--date', date, '--session', sessionId],
          { stdio: 'ignore', timeout: 5000 },
        );
      } catch {
        // Non-blocking — draft generation is best-effort
      }

      // Queue notification for next SessionStart (PreCompact stdout doesn't render systemMessage)
      addPendingAction(project, 'diary-ready', {
        trigger: 'compaction',
        userMessages: userCount,
        toolCalls: toolCount,
      });

      // Reset counters after threshold is met
      resetUserCounter();
      createSessionCounter('tool-count').reset();

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
