#!/usr/bin/env node
/**
 * PreCompact Hook
 *
 * Runs before context compaction to update the current session file
 * with a compaction marker.
 *
 * Non-blocking: Always exits 0 to avoid disrupting compaction flow.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  getSessionDir,
  getTimestamp,
  getDateString,
  getProjectName,
  getSessionId,
  readFileSafe,
  writeFileSafe,
  log,
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
} = require('../../scripts/lib/utils');
const { addPendingAction } = require('../../scripts/lib/pending-actions');
const {
  runDiaryCapture,
  readCounts,
  getSuggesterStatePath,
  pruneUngatedProse,
  applyTranscriptToSession,
} = require('../../scripts/lib/diary-capture');
const { shouldTrigger } = require('../../scripts/lib/thresholds');

/**
 * Reset the compact-suggester state on every compaction.
 *
 * Uses the shared getSuggesterStatePath() helper so the resetter and the
 * suggester writer always agree on one filename (S5-4) — and so it inherits the
 * stdin-derived session id resolved above. Without this, suggestion snapshots
 * from before a compaction would survive into the freshly compacted context and
 * "zero after compaction" would never land.
 */
function resetSuggesterState() {
  try {
    fs.rmSync(getSuggesterStatePath(), { force: true });
  } catch {
    // Best-effort; never block compaction.
  }
}

/**
 * Update the session file with the compaction marker and, above the diary
 * threshold, with the live metrics the draft is rendered from.
 *
 * Ordering is the point. The draft generator re-reads this file in a subprocess,
 * so anything the draft must show has to land here BEFORE runDiaryCapture runs.
 * Stamping afterwards is what produced a draft reporting the counts of whatever
 * the record last held — 0 messages / 0 tool calls on a record no Stop had
 * closed yet — while the record itself was corrected a moment later.
 *
 * @param {string} project
 * @param {string} date
 * @param {string} timestamp
 * @param {string} sessionId
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Project root whose learning opt-in governs
 *   whether carried user prose may survive this rewrite. Omitted means no
 *   consent, so the prose is pruned.
 * @param {number} [opts.userCount] - Live user-message count; stamped together
 *   with toolCount and passed as a pair. Omitted (below the threshold, where no
 *   draft is rendered) leaves the record's counts alone.
 * @param {number} [opts.toolCount] - Live tool-call count, the pair of userCount.
 * @param {string} [opts.transcriptPath] - Harness transcript to parse for the
 *   tool names and touched paths of this compaction.
 * @returns {boolean}
 */
function updateSessionFile(project, date, timestamp, sessionId, opts = {}) {
  const { projectRoot, userCount, toolCount, transcriptPath } = opts;
  const sessionFile = path.join(getSessionDir(project, date), `${sessionId}.json`);

  const content = readFileSafe(sessionFile);
  if (!content) return false;

  try {
    const session = JSON.parse(content);
    // The compaction marker rewrites the whole record, so the same opt-in that
    // governs capture governs what survives here (D-010) — and, when the
    // metrics below are stamped, whether this compaction may write prose at all.
    const learningOn = pruneUngatedProse(session, { projectRoot });

    // Counts and paths are continuity and are stamped either way; verbatim
    // prose only under the opt-in. A transcript the harness did not hand us (or
    // one that parses to nothing) leaves the record's existing paths alone —
    // blanking paths an earlier Stop wrote would make the draft worse, not
    // fresher.
    if (typeof userCount === 'number') {
      session.userMessages = userCount;
      session.toolCalls = toolCount;
      applyTranscriptToSession(session, transcriptPath, { learningOn });
    }

    session.compactions = session.compactions || [];
    session.compactions.push(timestamp);
    session.lastCompaction = timestamp;
    session.lastUpdated = timestamp;

    writeFileSafe(sessionFile, JSON.stringify(session, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Main entry point
 */
function main() {
  try {
    // Read stdin and passthrough to stdout (PreCompact stdout is the transcript channel)
    const stdin = readStdinSync();
    if (stdin) process.stdout.write(stdin);

    // Resolve session id from stdin BEFORE any counter/state access so the
    // counters we read are the live session's — not whatever CLAUDE_SESSION_ID
    // env happened to be set to (S5-4).
    const input = parseStdinJson(stdin);
    setSessionIdFromInput(input);

    const project = getProjectName();
    const date = getDateString();
    const sessionId = getSessionId();
    const timestamp = getTimestamp();

    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

    // One counter read serves the stamp, the notification and the log line.
    const { userCount, toolCount } = readCounts();

    // Above the threshold this compaction is about to render a draft, so the
    // record it renders from is refreshed first. Below it there is no draft, so
    // the transcript is not parsed at all — the compaction path keeps the same
    // "don't parse what nothing reads" discipline the Stop hook does.
    const metrics = shouldTrigger(userCount, toolCount)
      ? { userCount, toolCount, transcriptPath: input?.transcript_path }
      : undefined;

    // Update session file with compaction marker (+ metrics, above threshold)
    updateSessionFile(project, date, timestamp, sessionId, { projectRoot, ...metrics });

    // Reset the compact-suggester state on EVERY compaction (unconditional,
    // independent of the diary threshold) so suggestions don't survive the
    // context boundary.
    resetSuggesterState();

    // Shared diary-capture core: threshold gate → draft → background enricher
    // → counter reset. Enricher fires on PreCompact too (dual-path ON).
    // projectRoot is passed explicitly: runDiaryCapture reads the learning
    // opt-in from it, and the compaction cwd is not a reliable stand-in.
    const { triggered } = runDiaryCapture({
      project,
      date,
      sessionId,
      projectRoot,
    });

    if (triggered) {
      // Queue notification for next SessionStart (PreCompact stdout doesn't render systemMessage)
      addPendingAction(project, 'diary-ready', {
        trigger: 'compaction',
        userMessages: userCount,
        toolCalls: toolCount,
      });

      log(
        `[pre-compact] Diary draft generated (${userCount} msgs, ${toolCount} tools). Queued diary-ready action.`,
      );
    } else {
      log(
        `[pre-compact] Below threshold (${userCount} msgs, ${toolCount} tools). Counters preserved.`,
      );
    }
  } catch (e) {
    // Never block compaction
    log(`[pre-compact] Warning: ${e.message}`);
  }
}

// Export for testing
module.exports = { updateSessionFile, resetSuggesterState };

// Run if executed directly
if (require.main === module) {
  main();
}
