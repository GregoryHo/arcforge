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
const { execFileSync, spawn } = require('node:child_process');
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
  createSessionCounter,
  log,
} = require('../../scripts/lib/utils');
const { addPendingAction } = require('../../scripts/lib/pending-actions');
const {
  readCount: readUserCount,
  resetCounter: resetUserCounter,
} = require('../user-message-counter/main');
const { shouldTrigger } = require('../../scripts/lib/thresholds');
const { calculateDurationMinutes } = require('./summary');
const { parseTranscript } = require('../../scripts/lib/transcript');

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
 * Try to generate auto-diary draft.
 * Returns draft path on success, null on failure.
 */
function tryGenerateAutoDiary(project, date, sessionId) {
  try {
    const autoDiaryPath = path.join(__dirname, '../../skills/arc-journaling/scripts/auto-diary.js');
    const result = execFileSync(
      'node',
      [autoDiaryPath, 'generate', '--project', project, '--date', date, '--session', sessionId],
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
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
    const result = execFileSync('node', [reflectPath, 'auto-check', '--project', project], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    const [status, strategy, count] = result.split('|');
    return { ready: status === 'ready', strategy, count: parseInt(count, 10) || 0 };
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
 * Spawn a background Claude instance to enrich the diary draft.
 * Fire-and-forget: detached process, hook exits immediately.
 */
function spawnDiaryEnricher(draftPath, session) {
  try {
    const transcriptData = {
      userMessages: session.userMessageContent || [],
      toolsUsed: session.toolsUsed || [],
      filesModified: session.filesModified || [],
      stats: formatStats(session),
    };

    const prompt = [
      'Read the diary draft and fill all <!-- TO BE ENRICHED --> sections.',
      `Draft path: ${draftPath}`,
      '',
      'Session context (parsed summary):',
      JSON.stringify(transcriptData, null, 2),
      '',
      'Write the enriched diary back to the same path.',
      'Keep auto-generated metrics sections unchanged.',
      'Fill Completed, In Progress, Decisions, Challenges from the session context.',
    ].join('\n');

    const systemPrompt =
      'You are a diary enrichment agent. ' +
      'Read the draft, fill placeholder sections using provided session data, ' +
      'write the result back. Be concise and factual.';

    const child = spawn(
      'claude',
      [
        '--model',
        'haiku',
        '--max-turns',
        '2',
        '--print',
        '--system-prompt',
        systemPrompt,
        '--tools',
        'Read,Write',
        '--disable-slash-commands',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
      ],
      { detached: true, stdio: ['pipe', 'ignore', 'ignore'] },
    );

    child.stdin.write(prompt);
    child.stdin.end();
    child.unref();
  } catch {
    // Fire-and-forget — spawn failure is non-fatal
  }
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
  const stdin = readStdinSync();
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  const session = getOrCreateSession();
  const userCount = readUserCount();
  const toolCount = createSessionCounter('tool-count').read();

  session.lastUpdated = getTimestamp();
  session.userMessages = userCount;
  session.toolCalls = toolCount;

  // Enrich with transcript data if available
  const transcriptPath = input?.transcript_path;
  const transcriptData = transcriptPath ? parseTranscript(transcriptPath) : null;

  if (transcriptData) {
    session.userMessageContent = transcriptData.userMessages;
    session.toolsUsed = transcriptData.toolsUsed;
    session.filesModified = transcriptData.filesModified;
  } else {
    session.filesModified = [];
  }

  saveSessionJson(session);

  if (shouldTrigger(userCount, toolCount)) {
    const draftPath = tryGenerateAutoDiary(session.project, session.date, session.sessionId);

    if (draftPath) {
      spawnDiaryEnricher(draftPath, session);
    }

    const reflectStatus = checkReflectReady(session.project);
    if (reflectStatus?.ready) {
      addPendingAction(session.project, 'reflect-ready', {
        strategy: reflectStatus.strategy,
        count: reflectStatus.count,
      });
    }

    log(formatShortMessage(userCount, toolCount));
    resetUserCounter();
    createSessionCounter('tool-count').reset();
  } else {
    log(formatShortMessage(userCount, toolCount));
  }

  process.exit(0);
}

// Export for testing
module.exports = {
  getOrCreateSession,
  saveSessionJson,
  formatStats,
  formatShortMessage,
  spawnDiaryEnricher,
  tryGenerateAutoDiary,
  checkReflectReady,
};

// Run if executed directly
if (require.main === module) {
  main();
}
