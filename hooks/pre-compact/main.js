#!/usr/bin/env node
/**
 * PreCompact Hook
 *
 * Runs before context compaction to:
 * 1. Log the compaction event to compaction-log.txt
 * 2. Update current session file with compaction marker
 *
 * Non-blocking: Always exits 0 to avoid disrupting compaction flow.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const {
  getProjectSessionsDir,
  getSessionDir,
  getCompactionLogPath,
  getTimestamp,
  getDateString,
  getProjectName,
  getSessionId,
  ensureDir,
  readFileSafe,
  writeFileSafe,
  log,
  readStdinSync,
  loadSession,
  saveSession
} = require('../lib/utils');
const { readCount: readToolCount, resetCounter: resetToolCounter } = require('../compact-suggester/main');
const { readCount: readUserCount, resetCounter: resetUserCounter } = require('../user-message-counter/main');
const { shouldTrigger } = require('../lib/thresholds');
const { generateMarkdownSummary } = require('../session-tracker/summary');

/**
 * Record compaction event to log file
 */
function logCompactionEvent(project, timestamp, sessionId) {
  const logPath = getCompactionLogPath(project);
  const logEntry = `[${timestamp}] Context compaction - sessionId: ${sessionId}\n`;

  ensureDir(getProjectSessionsDir(project));
  const existingLog = readFileSafe(logPath) || '';
  writeFileSafe(logPath, existingLog + logEntry);
}

/**
 * Update session file with compaction marker
 */
function updateSessionFile(project, date, timestamp, sessionId) {
  const sessionFile = path.join(
    getSessionDir(project, date),
    `${sessionId}.json`
  );

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
 * Get markdown summary file path
 */
function getMarkdownFilePath(project, date, sessionId) {
  return path.join(getSessionDir(project, date), `${sessionId}.md`);
}

/**
 * Main entry point
 */
function main() {
  try {
    // Read and pass through stdin
    const stdin = readStdinSync();
    process.stdout.write(stdin);

    const project = getProjectName();
    const date = getDateString();
    const sessionId = getSessionId();
    const timestamp = getTimestamp();

    // Log compaction event and update session file
    logCompactionEvent(project, timestamp, sessionId);
    updateSessionFile(project, date, timestamp, sessionId);

    // Read counters
    const userCount = readUserCount();
    const toolCount = readToolCount();

    // Check threshold for diary trigger
    if (shouldTrigger(userCount, toolCount)) {
      // Update session with current counts and generate markdown
      const session = loadSession();
      if (session) {
        session.userMessages = userCount;
        session.toolCalls = toolCount;
        saveSession(session);

        // Generate markdown summary
        const markdownPath = getMarkdownFilePath(project, date, sessionId);
        const markdown = generateMarkdownSummary(session);
        writeFileSafe(markdownPath, markdown);
      }

      // Generate auto-diary draft (silent, best-effort)
      try {
        const autoDiaryPath = path.join(__dirname, '../../skills/arc-journaling/scripts/auto-diary.js');
        execFileSync('node', [
          autoDiaryPath, 'generate',
          '--project', project,
          '--date', date,
          '--session', sessionId
        ], { stdio: 'ignore', timeout: 5000 });
      } catch {
        // Non-blocking — draft generation is best-effort
      }

      // Prompt to run diary skill via stderr (NOT outputDecision — preserves stdout pass-through)
      log(`
Context compaction detected. (${userCount} messages, ${toolCount} tool calls)

A diary draft has been generated. Please use /diary skill to review and finalize it before context is compacted.
`);

      // Reset counters after threshold is met
      resetUserCounter();
      resetToolCounter();
    } else {
      // Below threshold - preserve counters
      log(`
📝 Context compaction. (${userCount} messages, ${toolCount} tool calls)
   Below threshold - counters preserved.
`);
    }
  } catch (e) {
    // Never block compaction
    log(`[pre-compact] Warning: ${e.message}`);
  }
}

// Export for testing
module.exports = { logCompactionEvent, updateSessionFile, getMarkdownFilePath };

// Run if executed directly
if (require.main === module) {
  main();
}
