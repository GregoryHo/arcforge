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
const { execFileSync } = require('child_process');
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
 * Try to generate auto-diary draft.
 * Returns draft path on success, null on failure.
 */
function tryGenerateAutoDiary(project, date, sessionId) {
  try {
    const autoDiaryPath = path.join(__dirname, '../../skills/arc-journaling/scripts/auto-diary.js');
    const result = execFileSync('node', [
      autoDiaryPath, 'generate',
      '--project', project,
      '--date', date,
      '--session', sessionId
    ], { encoding: 'utf-8', timeout: 5000 }).trim();
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Check if reflection is ready.
 * Returns { ready, strategy, count } or null on failure.
 */
function checkReflectReady(project) {
  try {
    const reflectPath = path.join(__dirname, '../../skills/arc-reflecting/scripts/reflect.js');
    const result = execFileSync('node', [
      reflectPath, 'auto-check',
      '--project', project
    ], { encoding: 'utf-8', timeout: 5000 }).trim();

    const [status, strategy, count] = result.split('|');
    return { ready: status === 'ready', strategy, count: parseInt(count, 10) || 0 };
  } catch {
    return null;
  }
}

/**
 * Format stop reason for decision: "block" output (when threshold is met)
 * Claude will see and execute this prompt.
 * Absorbs session-evaluator functionality into unified pipeline.
 * @returns {string} The reason/prompt for Claude to execute
 */
function formatStopReason(session, draftPath, reflectStatus) {
  const mdPath = `~/.claude/sessions/${session.project}/${session.date}/${session.sessionId}.md`;
  const duration = calculateDurationMinutes(session.started, session.lastUpdated);

  let stats = `${session.userMessages || 0} messages, ${session.toolCalls} tool calls`;
  if (duration > 0) {
    stats = `~${duration} min, ${stats}`;
  }
  if (session.filesModified?.length > 0) {
    stats += `, ${session.filesModified.length} files modified`;
  }

  const steps = [];
  let stepNum = 1;

  steps.push(`**Step ${stepNum++}: Fill in session template**
File: ${mdPath}

Based on this conversation, fill in:
- Completed: What was accomplished
- In Progress: What's still ongoing
- Notes for Next Session: What to remember next time`);

  if (draftPath) {
    steps.push(`**Step ${stepNum++}: Review and finalize diary**
A draft diary has been generated at: ${draftPath}
Review the draft, enrich the <!-- TO BE ENRICHED --> sections from conversation memory, then use the arc-journaling skill to finalize it.`);
  } else {
    steps.push(`**Step ${stepNum++}: Use arc-journaling skill**
Consider whether this session warrants a diary entry (check Pre-Diary gate).`);
  }

  if (reflectStatus?.ready) {
    steps.push(`**Step ${stepNum++}: Run /reflect** (${reflectStatus.count} diaries ready, strategy: ${reflectStatus.strategy})`);
  }

  // Unified pattern extraction (merged from session-evaluator)
  steps.push(`**Step ${stepNum++}: Pattern Extraction** (while session context is fresh)

Evaluate if there are extractable patterns from this session:
- Repeated error resolution methods
- User correction habits
- Effective workarounds or debugging techniques
- Cross-project reusable patterns

Apply the Transferability Test before saving:
1. Would this help in a **different** project?
2. Would another developer find this useful?
3. Has this pattern appeared more than once?

If patterns found, use /learn to extract them.
New patterns start at confidence 0.50 and need confirmations to reach auto-load threshold (0.70).`);

  return `Session ended. (${stats})

Please complete the following steps:

${steps.join('\n\n')}`;
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

    // Auto-diary: generate draft enriched with metrics + observations
    const draftPath = tryGenerateAutoDiary(session.project, session.date, session.sessionId);

    // Auto-reflect check: is reflection ready?
    const reflectStatus = checkReflectReady(session.project);

    // Output decision: "block" - Claude will see and execute (unified pipeline)
    outputDecision(formatStopReason(session, draftPath, reflectStatus));

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
  getMarkdownFilePath,
  tryGenerateAutoDiary,
  checkReflectReady
};

// Run if executed directly
if (require.main === module) {
  main();
}
