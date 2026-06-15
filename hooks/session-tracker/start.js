#!/usr/bin/env node
/**
 * Session Tracker - Start Hook (Async Background Tasks)
 *
 * Runs ASYNCHRONOUSLY on SessionStart to:
 * 1. Initialize new session file
 * 2. Check/start observer daemon
 * 3. Run decay cycles on instincts
 *
 * Context injection to Claude lives in inject-context.js (sync); this file
 * handles async background tasks. If you need context-related functions
 * (findRecentSessions, formatSessionContext, etc.), import them from
 * inject-context.js.
 *
 * Note: Counters accumulate until threshold is met in end.js or pre-compact/main.js.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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
  output,
  log,
} = require('../../scripts/lib/utils');

const { getInstinctsDir, migrateInstinctsToNameKey } = require('../../scripts/lib/session-utils');

const { runDecayCycle } = require('../../scripts/lib/confidence');

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
    compactions: [],
  };

  writeFileSafe(sessionFile, JSON.stringify(session, null, 2));
  return sessionFile;
}

// ─────────────────────────────────────────────
// Observer Daemon & Instinct Loading
// ─────────────────────────────────────────────

/**
 * Check if observer daemon is running, start if not.
 * The daemon uses mkdir-based locking for singleton enforcement,
 * so we can call 'start' unconditionally — it's a no-op if already running.
 */
function checkDaemon() {
  try {
    const daemonPath = path.join(
      __dirname,
      '../../skills/arc-observing/scripts/observer-daemon.sh',
    );
    if (fs.existsSync(daemonPath)) {
      execFileSync('bash', [daemonPath, 'start'], { stdio: 'ignore', timeout: 5000 });
    }
  } catch {
    // Non-blocking — daemon start is best-effort
  }
}

/**
 * One-time, idempotent migration of any stale hash-keyed instinct files into
 * the canonical name-keyed dir for this project (ICL-3). Runs before decay so
 * relocated files participate in the same session's decay cycle. Silent-catch
 * — never blocks the session.
 */
function migrateInstincts(project) {
  try {
    return migrateInstinctsToNameKey(project);
  } catch {
    return { moved: [], skipped: [] };
  }
}

/**
 * Run decay cycle on instincts.
 */
function runDecayCycles(project) {
  try {
    const instResult = runDecayCycle(getInstinctsDir(project));

    if (instResult.decayed.length > 0 || instResult.archived.length > 0) {
      output({
        systemMessage: `Decay cycle: ${instResult.decayed.length} decayed, ${instResult.archived.length} archived`,
      });
    }

    return { instResult };
  } catch {
    return { instResult: { decayed: [], archived: [] } };
  }
}

/**
 * Main entry point (async background tasks)
 */
function main() {
  const stdin = readStdinSync();
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  const project = getProjectName();

  initializeSession();
  checkDaemon();
  migrateInstincts(project);
  runDecayCycles(project);

  log('Session tracker initialized (background tasks)');
  process.exit(0);
}

// Export for testing
module.exports = {
  initializeSession,
  checkDaemon,
  migrateInstincts,
  runDecayCycles,
};

// Run if executed directly
if (require.main === module) {
  main();
}
