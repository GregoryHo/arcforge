#!/usr/bin/env node
/**
 * Session Tracker - Stop Hook
 *
 * Runs on Stop to:
 * 1. Update session file with final metrics
 * 2. Generate diary draft and spawn background enricher
 * 3. Queue pending actions (reflect-ready)
 */

const path = require('node:path');
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
  output,
  log,
} = require('../../scripts/lib/utils');
const { addPendingAction } = require('../../scripts/lib/pending-actions');
const {
  runDiaryCapture,
  readCounts,
  learningCaptureEnabled,
} = require('../../scripts/lib/diary-capture');
const { shouldTrigger } = require('../../scripts/lib/thresholds');
const { parseTranscript } = require('../../scripts/lib/transcript');
const { checkReflectReady: reflectReady } = require('../../scripts/lib/learning-workflow');

/**
 * Calculate duration in minutes between two ISO timestamps
 */
function calculateDurationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const durationMs = new Date(endISO) - new Date(startISO);
  return Math.round(durationMs / 60000);
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
    compactions: [],
  };
}

/**
 * Save session JSON (always saved for tracking)
 */
function saveSessionJson(session) {
  const sessionFile = path.join(
    getSessionDir(session.project, session.date),
    `${session.sessionId}.json`,
  );
  writeFileSafe(sessionFile, JSON.stringify(session, null, 2));
}

/**
 * Check if reflection is ready.
 *
 * Reads the canonical engine directly (hooks → scripts/lib is the legal
 * direction). This used to shell out to a script that lived inside a skill
 * directory, which was the last D8 reverse reference — the engine reaching back
 * into a skill, which made that skill undeletable.
 *
 * Returns { ready, strategy, count } or null on failure.
 */
function checkReflectReady(project) {
  try {
    return reflectReady(project);
  } catch {
    return null;
  }
}

/**
 * Format session stats as a one-liner.
 */
function formatStats(session) {
  const duration = calculateDurationMinutes(session.started, session.lastUpdated);

  let stats = `${session.userMessages || 0} messages, ${session.toolCalls} tool calls`;
  if (duration > 0) {
    stats = `~${duration} min, ${stats}`;
  }
  if (session.filesModified?.length > 0) {
    stats += `, ${session.filesModified.length} files modified`;
  }
  return stats;
}

/**
 * Format the below-threshold session-paused message. Logged to stderr only —
 * counters are genuinely preserved because the diary threshold did not fire.
 */
function formatShortMessage(userCount, toolCount) {
  return `📝 Session paused. (${userCount} messages, ${toolCount} tool calls)
   Counters preserved for next resume.`;
}

/**
 * Format the triggered session-paused message. Surfaced to the user
 * (systemMessage) when the diary threshold fired — a diary draft was captured
 * and the counters were reset for the next session.
 */
function formatTriggeredMessage(userCount, toolCount) {
  return `📝 Session paused. (${userCount} messages, ${toolCount} tool calls)
   Diary captured; counters reset for next session.`;
}

/**
 * Main entry point
 */
function main() {
  const stdin = readStdinSync();
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  const session = getOrCreateSession();
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const { userCount, toolCount } = readCounts();

  session.lastUpdated = getTimestamp();
  session.userMessages = userCount;
  session.toolCalls = toolCount;

  // Enrich with transcript data ONLY when the diary threshold fired. Below
  // threshold, parsing the transcript is wasted work (the diary won't capture),
  // so it is skipped entirely (documented delta: below-threshold session JSON
  // loses userMessageContent/toolsUsed/filesModified enrichment).
  const transcriptPath = input?.transcript_path;
  const transcriptData =
    shouldTrigger(userCount, toolCount) && transcriptPath ? parseTranscript(transcriptPath) : null;

  if (transcriptData) {
    // Counts, tool names and paths are the continuity record and are kept
    // either way. Verbatim user prose is not — it only lands in the session
    // file once the learning opt-in is on (D-010).
    if (learningCaptureEnabled({ projectRoot })) {
      session.userMessageContent = transcriptData.userMessages;
    }
    session.toolsUsed = transcriptData.toolsUsed;
    session.filesModified = transcriptData.filesModified;
  } else {
    session.filesModified = [];
  }

  saveSessionJson(session);

  // Shared diary-capture core: threshold gate → draft → background enricher
  // → counter reset (the sole reset path). The parsed-session summary is
  // handed to the enricher.
  const { triggered } = runDiaryCapture({
    project: session.project,
    date: session.date,
    sessionId: session.sessionId,
    projectRoot,
    transcriptData: {
      userMessages: session.userMessageContent || [],
      toolsUsed: session.toolsUsed || [],
      filesModified: session.filesModified || [],
      stats: formatStats(session),
    },
  });

  const systemMessages = [];
  if (triggered) {
    // The reflection nudge is behind the same opt-in as the enrichment it
    // follows (D-009). Reflection IS the learning loop — learning.md B-1 says
    // that loop does not run when learning is off — and the diaries it counts
    // are permanent stubs in that state, so an ungated nudge would recur at
    // every Stop above the threshold, forever, about work the user declined.
    if (learningCaptureEnabled({ projectRoot })) {
      const reflectStatus = checkReflectReady(session.project);
      if (reflectStatus?.ready) {
        addPendingAction(session.project, 'reflect-ready', {
          strategy: reflectStatus.strategy,
          count: reflectStatus.count,
        });
      }
    }
    // Only surface the 'Session paused' notification when the diary threshold
    // actually fired — a Stop worth telling the user about. Below threshold a
    // per-Stop user message is noise, so it is downgraded to a stderr log.
    systemMessages.push(formatTriggeredMessage(userCount, toolCount));
  } else {
    log(formatShortMessage(userCount, toolCount));
  }

  if (systemMessages.length > 0) {
    output({ systemMessage: systemMessages.join('\n\n') });
  }

  process.exit(0);
}

// Export for testing
module.exports = {
  calculateDurationMinutes,
  getOrCreateSession,
  saveSessionJson,
  formatStats,
  formatShortMessage,
  formatTriggeredMessage,
  checkReflectReady,
};

// Run if executed directly
if (require.main === module) {
  main();
}
