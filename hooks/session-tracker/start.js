#!/usr/bin/env node
/**
 * Session Tracker - Start Hook (Async Background Tasks)
 *
 * Runs ASYNCHRONOUSLY on SessionStart to:
 * 1. Initialize new session file
 * 2. Start the observer daemon when learning is enabled
 * 3. Run decay cycles on instincts
 *
 * Context injection to Claude lives in inject-context.js (sync); this file
 * handles async background tasks. If you need context-related functions
 * (loadAutoInstincts, loadPendingActions, etc.), import them from
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
const { isLearningEnabledAnyScope, recordProjectRoot } = require('../../scripts/lib/learning');

const DAEMON_PATH = path.join(__dirname, '../../scripts/lib/learning-curator/observer-daemon.sh');

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
 * Start the observer daemon when learning is enabled here (learning B-1).
 *
 * The daemon sends observation batches to a model, so it starts only when
 * learning is enabled in some scope for the project this session is in, and
 * that project's root is put on record so the machine-wide daemon can check
 * the project-scope opt-in before it analyzes anything filed under its name.
 * The daemon uses mkdir-based locking for singleton enforcement, so 'start' is
 * a no-op if it is already running.
 *
 * @param {{ daemonPath?: string }} [options] - daemonPath overrides the script (tests)
 * @returns {'no-spawn-env'|'learning-disabled'|'missing'|'started'|'error'}
 */
function checkDaemon({ daemonPath = DAEMON_PATH } = {}) {
  try {
    // Parity with observe/main.js: both spawn the same observer daemon, so
    // both must honor ARCFORGE_OBSERVE_NO_SPAWN. Without this, setting the
    // env still spawned a daemon here on every SessionStart.
    if (process.env.ARCFORGE_OBSERVE_NO_SPAWN === '1') return 'no-spawn-env';
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    if (!isLearningEnabledAnyScope({ projectRoot })) return 'learning-disabled';
    recordProjectRoot({ projectRoot });
    if (!fs.existsSync(daemonPath)) return 'missing';
    execFileSync('bash', [daemonPath, 'start'], { stdio: 'ignore', timeout: 5000 });
    return 'started';
  } catch {
    // Non-blocking — daemon start is best-effort
    return 'error';
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

    const failed = instResult.archiveFailed || [];
    if (instResult.decayed.length > 0 || instResult.archived.length > 0 || failed.length > 0) {
      const archivedNames =
        instResult.archived.length > 0 ? ` (${instResult.archived.join(', ')})` : '';
      // An archive whose audit entry could not be written was not performed.
      const heldBack =
        failed.length > 0
          ? `; ${failed.length} not archived, audit log unwritable (${failed.map((f) => f.file).join(', ')})`
          : '';
      output({
        systemMessage: `Decay cycle: ${instResult.decayed.length} decayed, ${instResult.archived.length} archived${archivedNames}${heldBack}`,
      });
    }

    return { instResult };
  } catch {
    return { instResult: { decayed: [], archived: [], archiveFailed: [] } };
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
