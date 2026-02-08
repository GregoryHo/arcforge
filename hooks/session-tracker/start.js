#!/usr/bin/env node
/**
 * Session Tracker - Start Hook (Async Background Tasks)
 *
 * Runs ASYNCHRONOUSLY on SessionStart to:
 * 1. Initialize new session file
 * 2. Check/start observer daemon
 * 3. Run decay cycles on instincts and learned skills
 *
 * IMPORTANT: This file was split from the original start.js:
 * - inject-context.js (sync): Handles context injection to Claude
 * - start.js (async): Handles background tasks (this file)
 *
 * If you need context-related functions (findRecentSessions, formatSessionContext, etc.),
 * import from inject-context.js instead of this file.
 *
 * Note: Counters accumulate until threshold is met in end.js or pre-compact/main.js.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  writeFileSafe,
  getSessionDir,
  getProjectName,
  getDateString,
  getSessionId,
  getTimestamp,
  ensureDir,
  log
} = require('../lib/utils');

const {
  getInstinctsDir,
  getLearnedSkillsDir
} = require('../../scripts/lib/session-utils');

const {
  runDecayCycle
} = require('../../scripts/lib/confidence');

/**
 * Initialize new session file
 */
function initializeSession() {
  const project = getProjectName();
  const date = getDateString();
  const sessionId = getSessionId();

  const sessionDir = ensureDir(getSessionDir(project, date));
  const sessionFile = path.join(sessionDir, `${sessionId}.json`);

  const session = {
    sessionId,
    project,
    date,
    started: getTimestamp(),
    lastUpdated: getTimestamp(),
    toolCalls: 0,
    filesModified: [],
    compactions: []
  };

  writeFileSafe(sessionFile, JSON.stringify(session, null, 2));
  return sessionFile;
}

// ─────────────────────────────────────────────
// Observer Daemon & Instinct Loading
// ─────────────────────────────────────────────

const PID_FILE = path.join(require('os').homedir(), '.claude', 'instincts', '.observer.pid');

/**
 * Check if observer daemon is running, start if not.
 */
function checkDaemon() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (pid > 0) {
        try {
          process.kill(pid, 0); // Check if alive
          return; // Already running
        } catch {
          // Stale PID file
        }
      }
    }

    // Try to start daemon
    const daemonPath = path.join(__dirname, '../../skills/arc-observing/scripts/observer-daemon.sh');
    if (fs.existsSync(daemonPath)) {
      execFileSync('bash', [daemonPath, 'start'], { stdio: 'ignore', timeout: 5000 });
      log('Observer daemon started');
    }
  } catch {
    // Non-blocking — daemon start is best-effort
  }
}

/**
 * Run decay cycle on instincts and learned skills.
 */
function runDecayCycles(project) {
  try {
    const instResult = runDecayCycle(getInstinctsDir(project));
    const learnResult = runDecayCycle(getLearnedSkillsDir(project));

    const totalDecayed = instResult.decayed.length + learnResult.decayed.length;
    const totalArchived = instResult.archived.length + learnResult.archived.length;

    if (totalDecayed > 0 || totalArchived > 0) {
      log(`Decay cycle: ${totalDecayed} decayed, ${totalArchived} archived`);
    }

    return { instResult, learnResult };
  } catch {
    return { instResult: { decayed: [], archived: [] }, learnResult: { decayed: [], archived: [] } };
  }
}

/**
 * Main entry point (async background tasks)
 */
function main() {
  // Read stdin
  const stdin = readStdinSync();
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  const project = getProjectName();

  // Initialize new session file
  initializeSession();

  // ── Background observation system tasks ──

  // 1. Check/start observer daemon (best-effort, non-blocking)
  checkDaemon();

  // 2. Run decay cycle on instincts and learned skills
  runDecayCycles(project);

  // Note: Context injection is handled by inject-context.js (sync hook)
  log('Session tracker initialized (background tasks)');
  process.exit(0);
}

// Export for testing
module.exports = {
  initializeSession,
  checkDaemon,
  runDecayCycles
};

// Run if executed directly
if (require.main === module) {
  main();
}
