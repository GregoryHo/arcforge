#!/usr/bin/env node
/**
 * Session Tracker - Start Hook
 *
 * Runs on SessionStart to:
 * 1. Find and load recent session files for this project
 * 2. Output session context to additionalContext
 * 3. Initialize new session file
 *
 * Note: Counters accumulate until threshold is met in end.js or pre-compact/main.js.
 */

const fs = require('fs');
const path = require('path');
const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  readFileSafe,
  writeFileSafe,
  getProjectSessionsDir,
  getSessionDir,
  getProjectName,
  getDateString,
  getSessionId,
  getTimestamp,
  ensureDir,
  log
} = require('../lib/utils');

const MAX_SESSIONS = 5;
const MAX_MD_FILES = 3;

/**
 * Get all date directories sorted by date descending
 * @param {string} projectDir - Project sessions directory
 * @returns {string[]} Array of date strings sorted descending (most recent first)
 */
function getDateDirs(projectDir) {
  return fs.readdirSync(projectDir)
    .filter(entry => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) return false;
      return fs.statSync(path.join(projectDir, entry)).isDirectory();
    })
    .sort((a, b) => new Date(b) - new Date(a));
}

/**
 * Find recent session files for current project
 * Returns top MAX_SESSIONS valid sessions (no date limit)
 * Valid = userMessages >= 1 OR toolCalls >= 1
 */
function findRecentSessions() {
  const projectDir = getProjectSessionsDir(getProjectName());
  if (!fs.existsSync(projectDir)) return [];

  const sessions = [];
  const dateDirs = getDateDirs(projectDir);

  for (const dateStr of dateDirs) {
    const dateDir = path.join(projectDir, dateStr);
    const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const content = readFileSafe(path.join(dateDir, file));
      if (!content) continue;

      try {
        sessions.push({ ...JSON.parse(content), dateStr });
      } catch {
        // Skip invalid JSON
      }
    }
  }

  // Filter valid sessions (has user interaction) and sort by lastUpdated descending
  return sessions
    .filter(s => (s.userMessages || 0) >= 1 || (s.toolCalls || 0) >= 1)
    .sort((a, b) => new Date(b.lastUpdated || b.dateStr) - new Date(a.lastUpdated || a.dateStr))
    .slice(0, MAX_SESSIONS);
}

/**
 * Pluralize a word based on count
 */
function pluralize(count, word) {
  return `${count} ${word}${count !== 1 ? 's' : ''}`;
}

/**
 * Format relative time string
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'unknown';

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${pluralize(days, 'day')} ago`;
  if (hours > 0) return `${pluralize(hours, 'hour')} ago`;
  if (mins > 0) return `${pluralize(mins, 'minute')} ago`;
  return 'just now';
}

/**
 * Calculate session duration in minutes
 */
function calcDuration(session) {
  if (!session.started || !session.lastUpdated) return 0;
  return Math.round((new Date(session.lastUpdated) - new Date(session.started)) / 60000);
}

/**
 * Format session context for output
 * Latest session: detailed info
 * Older sessions: summary stats
 */
function formatSessionContext(sessions) {
  if (sessions.length === 0) return null;

  const [latest, ...older] = sessions;
  const lines = ['## Previous Session Context\n'];

  // Latest session details
  lines.push('### Last Session');
  lines.push(`- **Time**: ${formatRelativeTime(latest.lastUpdated)}`);

  const duration = calcDuration(latest);
  if (duration > 0) {
    lines.push(`- **Duration**: ~${duration} minutes`);
  }

  lines.push(`- **Tool calls**: ${latest.toolCalls || 0}`);
  lines.push(`- **User messages**: ${latest.userMessages || 0}`);

  const files = latest.filesModified || [];
  if (files.length > 0) {
    const displayed = files.slice(0, 5);
    const remaining = files.length - displayed.length;
    lines.push(`- **Files modified**: ${displayed.join(', ')}${remaining > 0 ? ` ... and ${remaining} more` : ''}`);
  }

  // Older sessions summary
  if (older.length > 0) {
    const totalToolCalls = older.reduce((sum, s) => sum + (s.toolCalls || 0), 0);
    const totalUserMsgs = older.reduce((sum, s) => sum + (s.userMessages || 0), 0);
    lines.push(`\n**Recent activity**: ${pluralize(older.length, 'other session')}, ${totalToolCalls} tool calls, ${totalUserMsgs} user messages`);
  }

  return lines.join('\n');
}

/**
 * Find recent markdown session files for current project
 * Only reads MD files from the latest session's date directory
 * @param {Object[]} sessions - Array of sessions (needs at least one)
 * @returns {string[]} Array of MD file contents
 */
function findRecentMarkdownFiles(sessions) {
  if (!sessions?.length) return [];

  const latestDateStr = sessions[0].dateStr;
  if (!latestDateStr) return [];

  const dateDir = path.join(getProjectSessionsDir(getProjectName()), latestDateStr);
  if (!fs.existsSync(dateDir)) return [];

  return fs.readdirSync(dateDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('diary-'))
    .sort()
    .reverse()
    .slice(0, MAX_MD_FILES)
    .map(file => {
      const content = readFileSafe(path.join(dateDir, file));
      return content?.trim() ? `### ${latestDateStr}/${file}\n${content.trim()}` : null;
    })
    .filter(Boolean);
}

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

/**
 * Main entry point
 */
function main() {
  // Read stdin (not passed through for SessionStart)
  const stdin = readStdinSync();

  // Parse stdin and set session ID from input
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  // Find recent sessions and MD files (only from latest session's date)
  const sessions = findRecentSessions();
  const mdContents = findRecentMarkdownFiles(sessions);

  // Initialize new session file
  initializeSession();

  // Build context for Claude (stdout) and also show to user (stderr)
  const sessionContext = formatSessionContext(sessions);
  const parts = [];

  if (sessionContext) {
    parts.push(sessionContext);
    log(sessionContext); // Also show in terminal
  }

  if (mdContents.length > 0) {
    parts.push('--- Previous Session Notes ---');
    parts.push(mdContents.join('\n---\n'));
    log('\n--- Previous Session Notes ---');
    log(mdContents.join('\n---\n'));
  }

  // Send full context to Claude via stdout
  // const fullContext = parts.length > 0
  //   ? parts.join('\n\n')
  //   : 'Session tracker initialized.';
  // outputContext(fullContext, 'SessionStart');
  process.exit(0);
}

// Export for testing
module.exports = { getDateDirs, findRecentSessions, formatSessionContext, findRecentMarkdownFiles, initializeSession, formatRelativeTime, calcDuration, pluralize };

// Run if executed directly
if (require.main === module) {
  main();
}
