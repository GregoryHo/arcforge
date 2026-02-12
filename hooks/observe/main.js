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

const os = require('node:os');

const { getProjectName, readStdinSync } = require('../lib/utils');
const { getObservationsPath } = require('../../scripts/lib/session-utils');

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const MAX_INPUT_LENGTH = 5000;
const MAX_OUTPUT_LENGTH = 5000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Get observations archive directory for a project.
 */
function getArchiveDir(project) {
  return `${path.dirname(getObservationsPath(project))}/archive`;
}

function getPidFile() {
  return path.join(os.homedir(), '.claude', 'instincts', '.observer.pid');
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
 * Signal the observer daemon via SIGUSR1.
 */
function signalDaemon() {
  try {
    const pidFile = getPidFile();
    if (!fs.existsSync(pidFile)) return;
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    if (pid > 0) {
      process.kill(pid, 'SIGUSR1');
    }
  } catch {
    // Daemon not running or signal failed — silently ignore
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
    let input;
    try {
      input = JSON.parse(stdin);
    } catch {
      process.exit(0);
      return;
    }

    const project = getProjectName();
    const sessionId =
      input.session_id || process.env.CLAUDE_SESSION_ID || `session-${process.ppid || 'default'}`;

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
    };

    // Add input/output based on phase
    if (phase === 'pre' && input.tool_input) {
      const inputStr =
        typeof input.tool_input === 'string' ? input.tool_input : JSON.stringify(input.tool_input);
      observation.input = truncate(inputStr, MAX_INPUT_LENGTH);
    }

    if (phase === 'post' && input.tool_output) {
      const outputStr =
        typeof input.tool_output === 'string'
          ? input.tool_output
          : JSON.stringify(input.tool_output);
      observation.output = truncate(outputStr, MAX_OUTPUT_LENGTH);
    }

    // Ensure directory exists
    const obsPath = getObservationsPath(project);
    fs.mkdirSync(path.dirname(obsPath), { recursive: true });

    // Archive if file is too large
    archiveIfNeeded(obsPath, project);

    // Append observation
    fs.appendFileSync(obsPath, `${JSON.stringify(observation)}\n`, 'utf-8');

    // Signal daemon
    signalDaemon();
  } catch {
    // Non-blocking — never fail the hook
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { truncate, getArchiveDir, getPidFile };
