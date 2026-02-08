#!/usr/bin/env node
/**
 * Session Tracker - Stop Hook
 *
 * Runs on Stop to:
 * 1. Update session file with final metrics
 * 2. Save tool call count
 * 3. Output JSON with decision: "block" to prompt Claude to fill session template
 *
 * Note: Uses Stop hook (not SessionEnd) so Claude sees and executes the prompt.
 */

const path = require('path');
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
  outputDecision
} = require('../lib/utils');
const { readCount: readToolCount, resetCounter: resetToolCounter } = require('../compact-suggester/main');
const { readCount: readUserCount, resetCounter: resetUserCounter } = require('../user-message-counter/main');
const { shouldTrigger } = require('../lib/thresholds');
const { generateMarkdownSummary, calculateDurationMinutes } = require('./summary');

/**
 * Get markdown summary file path
 */
function getMarkdownFilePath() {
  const project = getProjectName();
  const date = getDateString();
  const sessionId = getSessionId();
  return path.join(getSessionDir(project, date), `${sessionId}.md`);
}

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
    compactions: []
  };
}

/**
 * Save session JSON (always saved for tracking)
 */
function saveSessionJson(session) {
  const sessionFile = path.join(
    getSessionDir(session.project, session.date),
    `${session.sessionId}.json`
  );
  writeFileSafe(sessionFile, JSON.stringify(session, null, 2));
}

/**
 * Save session markdown (only when threshold is met)
 */
function saveSessionMarkdown(session) {
  const markdownFile = getMarkdownFilePath();
  const markdown = generateMarkdownSummary(session);
  writeFileSafe(markdownFile, markdown);
}

/**
 * Format stop reason for decision: "block" output (when threshold is met)
 * Claude will see and execute this prompt
 * @returns {string} The reason/prompt for Claude to execute
 */
function formatStopReason(session) {
  const mdPath = `~/.claude/sessions/${session.project}/${session.date}/${session.sessionId}.md`;
  const duration = calculateDurationMinutes(session.started, session.lastUpdated);

  let stats = `${session.userMessages || 0} messages, ${session.toolCalls} tool calls`;
  if (duration > 0) {
    stats = `~${duration} min, ${stats}`;
  }
  if (session.filesModified?.length > 0) {
    stats += `, ${session.filesModified.length} files modified`;
  }

  return `📝 Session ended. (${stats})

Please complete the following steps:

**Step 1: Fill in session template**
File: ${mdPath}

Based on this conversation, fill in:
- Completed: What was accomplished
- In Progress: What's still ongoing
- Notes for Next Session: What to remember next time

**Step 2: Use arc-journaling skill**

**Step 3: Use arc-learning skill**`;
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
  // Read stdin
  const stdin = readStdinSync();

  // Parse input to check for stop_hook_active flag and set session ID
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  if (input && input.stop_hook_active) {
    // Already processing stop hook - allow stop to prevent infinite loop
    process.exit(0);
    return;
  }

  // Load or create session
  const session = getOrCreateSession();

  // Read counters
  const userCount = readUserCount();
  const toolCount = readToolCount();

  // Update session with final metrics
  // Note: filesModified left empty - git status parsing was unreliable
  session.lastUpdated = getTimestamp();
  session.userMessages = userCount;
  session.toolCalls = toolCount;
  session.filesModified = [];

  // Always save JSON for tracking
  saveSessionJson(session);

  // Check threshold for diary trigger
  if (shouldTrigger(userCount, toolCount)) {
    // Generate markdown summary
    saveSessionMarkdown(session);

    // Output decision: "block" - Claude will see and execute
    outputDecision(formatStopReason(session));

    // Reset counters after threshold is met
    resetUserCounter();
    resetToolCounter();
  } else {
    // Output short message to stderr, preserve counters for next resume
    log(formatShortMessage(userCount, toolCount));
  }

  process.exit(0);
}

// Export for testing
module.exports = {
  getOrCreateSession,
  saveSessionJson,
  saveSessionMarkdown,
  formatStopReason,
  formatShortMessage,
  getMarkdownFilePath
};

// Run if executed directly
if (require.main === module) {
  main();
}
