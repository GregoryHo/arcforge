#!/usr/bin/env node
/**
 * Observation Hook — PreToolUse/PostToolUse (async)
 *
 * Captures tool calls to observations.jsonl for behavioral pattern detection.
 * Registered with async: true to avoid blocking tool execution.
 *
 * Adapted from: continuous-learning-v2/hooks/observe.sh
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  getProjectName,
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  getSessionId,
} = require('../../scripts/lib/utils');
const {
  getObservationsPath,
  getObserverSignalFile,
  getObserverPidFile,
} = require('../../scripts/lib/session-utils');
const {
  getProjectId,
  isLearningEnabled,
  triggerAutomaticLearning,
} = require('../../scripts/lib/learning');

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const MAX_INPUT_LENGTH = 5000;
const MAX_OUTPUT_LENGTH = 5000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SIGNAL_COOLDOWN_MS = 30000; // 30 seconds between SIGUSR1 signals
const SIGNAL_TIMESTAMP_FILE = getObserverSignalFile();

/**
 * Get observations archive directory for a project.
 */
function getArchiveDir(project) {
  return `${path.dirname(getObservationsPath(project))}/archive`;
}

const getPidFile = getObserverPidFile;

function shouldObserve({
  projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  homeDir,
} = {}) {
  try {
    return (
      isLearningEnabled({ scope: 'project', projectRoot, homeDir }) ||
      isLearningEnabled({ scope: 'global', projectRoot, homeDir })
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────

/**
 * Truncate string to max length with indicator.
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return `${str.substring(0, maxLen)}...[truncated]`;
}

function redactObservationText(value) {
  return String(value || '')
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*"[^"]*"/gi, '$1="[REDACTED]"')
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*'[^']*'/gi, "$1='[REDACTED]'")
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*[^\s,}]+/gi, '$1=[REDACTED]')
    .replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,}]+/gi, 'Authorization: Bearer [REDACTED]');
}

function sanitizeObservationPayload(value, maxLen) {
  return truncate(redactObservationText(value), maxLen);
}

/**
 * Archive observations file if it exceeds MAX_FILE_SIZE.
 */
function archiveIfNeeded(obsPath, project) {
  try {
    if (!fs.existsSync(obsPath)) return;
    const stats = fs.statSync(obsPath);
    if (stats.size < MAX_FILE_SIZE) return;

    const archiveDir = getArchiveDir(project);
    fs.mkdirSync(archiveDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(archiveDir, `observations-${timestamp}.jsonl`);

    fs.renameSync(obsPath, archivePath);
  } catch {
    // Non-blocking — never fail the hook
  }
}

/**
 * Signal the observer daemon via SIGUSR1 with file-based cooldown.
 * Each hook invocation is a separate process — timestamp file coordinates cooldown.
 */
function signalDaemon() {
  try {
    // Check cooldown via timestamp file
    if (fs.existsSync(SIGNAL_TIMESTAMP_FILE)) {
      const lastSignal = fs.statSync(SIGNAL_TIMESTAMP_FILE).mtimeMs;
      if (Date.now() - lastSignal < SIGNAL_COOLDOWN_MS) return;
    }

    const pidFile = getPidFile();
    if (!fs.existsSync(pidFile)) return;
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    if (pid > 0) {
      process.kill(pid, 'SIGUSR1');
      // Touch timestamp file (write updates mtime)
      fs.writeFileSync(SIGNAL_TIMESTAMP_FILE, String(Date.now()), 'utf-8');
    }
  } catch {
    // Daemon not running or signal failed — silently ignore
  }
}

function runAutomaticLearningTrigger(
  projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd(),
) {
  try {
    triggerAutomaticLearning({ projectRoot });
  } catch {
    // Learning analysis is best-effort and must never block tool execution.
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

function main() {
  try {
    const phase = process.argv[2]; // 'pre' or 'post'
    const stdin = readStdinSync();

    // Parse hook input
    const input = parseStdinJson(stdin);
    if (!input) {
      process.exit(0);
      return;
    }

    const project = getProjectName();
    if (!shouldObserve()) {
      process.exit(0);
      return;
    }
    setSessionIdFromInput(input);
    const sessionId = getSessionId();

    // Extract tool information
    const toolName = input.tool_name || input.tool || 'unknown';
    const event = phase === 'pre' ? 'tool_start' : 'tool_end';

    // Build observation entry
    const observation = {
      ts: new Date().toISOString(),
      event,
      tool: toolName,
      session: sessionId,
      project,
      project_id: getProjectId(process.env.CLAUDE_PROJECT_DIR || process.cwd()),
    };

    // Add input/output based on phase
    if (phase === 'pre' && input.tool_input) {
      const inputStr =
        typeof input.tool_input === 'string' ? input.tool_input : JSON.stringify(input.tool_input);
      observation.input = sanitizeObservationPayload(inputStr, MAX_INPUT_LENGTH);
    }

    if (phase === 'post' && input.tool_output) {
      const outputStr =
        typeof input.tool_output === 'string'
          ? input.tool_output
          : JSON.stringify(input.tool_output);
      observation.output = sanitizeObservationPayload(outputStr, MAX_OUTPUT_LENGTH);
    }

    // Ensure directory exists
    const obsPath = getObservationsPath(project);
    fs.mkdirSync(path.dirname(obsPath), { recursive: true });

    // Archive if file is too large
    archiveIfNeeded(obsPath, project);

    // Append observation
    fs.appendFileSync(obsPath, `${JSON.stringify(observation)}\n`, 'utf-8');

    // Signal daemon and run the lightweight automatic analyzer. The analyzer only
    // appends pending candidates; it never materializes or activates artifacts.
    signalDaemon();
    runAutomaticLearningTrigger(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  } catch {
    // Non-blocking — never fail the hook
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  truncate,
  redactObservationText,
  getArchiveDir,
  getPidFile,
  shouldObserve,
  runAutomaticLearningTrigger,
};
