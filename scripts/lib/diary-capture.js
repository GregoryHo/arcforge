/**
 * diary-capture.js — Shared diary-capture core for Stop and PreCompact hooks.
 *
 * Owns the threshold gating, draft generation, background enricher spawn, and
 * the counter reset that both the Stop hook (session-tracker/end.js) and the
 * PreCompact hook (pre-compact/main.js) run. Extracting it here removes the
 * divergence between the two paths and makes the enricher fire on BOTH events.
 *
 * Counter-ownership contract (single-writer per counter):
 * - user-count  — WRITTEN only by user-message-counter (UserPromptSubmit).
 * - tool-count  — INCREMENTED only by compact-suggester via incrementSharedToolCount().
 * - both        — READ and RESET only here (readCounts / resetCounters).
 *   Reset (write 0) is distinct from the increment role; "重置" lives here, the
 *   "寫" role stays with each counter's owner. No double-reset path remains.
 *
 * This module also owns the SOLE suggester-state path helper
 * (getSuggesterStatePath) so ICL-9's compaction reset re-uses one filename
 * instead of re-deriving it, and the SOLE stale-draft probe (draftIsStale)
 * imported by inject-context and the curator batch-assembler.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const {
  createSessionCounter,
  getProjectSessionsDir,
  getTempDir,
  getSessionId,
  ensureDir,
} = require('./utils');
const { shouldTrigger } = require('./thresholds');

// ---------------------------------------------------------------------------
// Counter ownership — read + reset live here exclusively
// ---------------------------------------------------------------------------

/**
 * Read the shared diary-trigger counters.
 * @returns {{ userCount: number, toolCount: number }}
 */
function readCounts() {
  return {
    userCount: createSessionCounter('user-count').read(),
    toolCount: createSessionCounter('tool-count').read(),
  };
}

/**
 * Reset both diary-trigger counters. SOLE reset path for user-count/tool-count.
 */
function resetCounters() {
  createSessionCounter('user-count').reset();
  createSessionCounter('tool-count').reset();
}

/**
 * Increment the shared tool-count. SOLE increment path — called only by
 * compact-suggester on PostToolUse so the diary threshold and the suggester
 * threshold share a single source of truth.
 */
function incrementSharedToolCount() {
  const counter = createSessionCounter('tool-count');
  counter.write(counter.read() + 1);
}

/**
 * Canonical path of the compact-suggester JSON state file.
 *
 * The SOLE owner of this filename. ICL-9 (compact-suggester consolidation) and
 * its PreCompact reset both call this helper so the writer and the resetter
 * always agree on one path. Session-scoped, mirrors createSessionCounter's
 * tmp-dir layout so it is wiped between sessions.
 *
 * @returns {string} Absolute path to the suggester state file.
 */
function getSuggesterStatePath() {
  return path.join(getTempDir(), `arcforge-suggester-state-${getSessionId()}.json`);
}

// ---------------------------------------------------------------------------
// Stale-draft probe — shared by inject-context and batch-assembler
// ---------------------------------------------------------------------------

// The TO BE ENRICHED markers always appear in the template-stub header
// region (Decisions/Challenges/etc.) within the first ~2KB of any draft.
// Bounded read keeps the SessionStart healthcheck and curator scan cheap.
const STALE_DRAFT_PROBE_BYTES = 2048;

/**
 * Probe whether a diary draft still carries the enricher's TO BE ENRICHED
 * placeholders (i.e. enrichment never ran / failed). Bounded read.
 * @param {string} filePath - Absolute path to the draft.
 * @returns {boolean} True if the stub marker is present.
 */
function draftIsStale(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(STALE_DRAFT_PROBE_BYTES);
    const n = fs.readSync(fd, buf, 0, STALE_DRAFT_PROBE_BYTES, 0);
    return buf.subarray(0, n).includes('TO BE ENRICHED');
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Draft generation + background enrichment
// ---------------------------------------------------------------------------

/**
 * Generate an auto-diary draft. Returns the draft path on success, null on
 * failure. Best-effort; never throws.
 * @param {string} project
 * @param {string} date
 * @param {string} sessionId
 * @returns {string|null}
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
 * Spawn a background Claude instance to enrich the diary draft.
 * Fire-and-forget: detached process, caller exits immediately.
 *
 * The child runs with ARCFORGE_SPAWNED=enricher so its own SessionStart
 * (inject-context) skips consuming the user's pending actions — otherwise the
 * detached enricher's session would eat diary-ready / reflect-ready /
 * ratify-pending before the user's next session sees them.
 *
 * @param {string} draftPath - Path to the draft to enrich.
 * @param {Object} transcriptData - { userMessages, toolsUsed, filesModified, stats }.
 * @param {string} project - Project name (for the enricher.log location).
 */
function spawnDiaryEnricher(draftPath, transcriptData, project) {
  try {
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

    // Capture stderr to a log file so silent failures leave a trail.
    const sessionsDir = getProjectSessionsDir(project);
    ensureDir(sessionsDir);
    const stderrFd = fs.openSync(path.join(sessionsDir, 'enricher.log'), 'a');

    const child = spawn(
      'claude',
      [
        '--model',
        'haiku',
        // Haiku needs Read + Write + thinking; 10 leaves headroom (2 hits max-turns).
        '--max-turns',
        '10',
        '--print',
        '--dangerously-skip-permissions',
        '--system-prompt',
        systemPrompt,
        '--tools',
        'Read,Write',
        '--disable-slash-commands',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
      ],
      {
        detached: true,
        stdio: ['pipe', 'ignore', stderrFd],
        env: { ...process.env, ARCFORGE_SPAWNED: 'enricher' },
      },
    );

    // spawn reports a missing binary asynchronously via 'error' (ENOENT), not a
    // sync throw — without this listener that event is unhandled and crashes the
    // process. Swallow it to honor the fire-and-forget contract below.
    child.on('error', () => {});
    child.stdin.on('error', () => {});

    child.stdin.write(prompt);
    child.stdin.end();
    child.unref();
    fs.closeSync(stderrFd);
  } catch {
    // Fire-and-forget — spawn failure is non-fatal
  }
}

/**
 * Shared diary-capture core for Stop and PreCompact.
 *
 * Reads the counters, gates on the shared threshold, and on a hit: generates a
 * draft, spawns the background enricher (BOTH event paths), then resets the
 * counters (the sole reset). Callers handle event-specific work (queuing
 * diary-ready vs reflect-ready, session-file updates).
 *
 * @param {Object} opts
 * @param {string} opts.project
 * @param {string} opts.date
 * @param {string} opts.sessionId
 * @param {Object} [opts.transcriptData] - { userMessages, toolsUsed, filesModified, stats }.
 * @returns {{ triggered: boolean, draftPath: string|null, userCount: number, toolCount: number }}
 */
function runDiaryCapture(opts) {
  const { project, date, sessionId, transcriptData = {} } = opts;
  const { userCount, toolCount } = readCounts();

  if (!shouldTrigger(userCount, toolCount)) {
    return { triggered: false, draftPath: null, userCount, toolCount };
  }

  const draftPath = tryGenerateAutoDiary(project, date, sessionId);
  if (draftPath) {
    spawnDiaryEnricher(draftPath, transcriptData, project);
  }

  resetCounters();

  return { triggered: true, draftPath, userCount, toolCount };
}

module.exports = {
  STALE_DRAFT_PROBE_BYTES,
  readCounts,
  resetCounters,
  incrementSharedToolCount,
  getSuggesterStatePath,
  draftIsStale,
  tryGenerateAutoDiary,
  spawnDiaryEnricher,
  runDiaryCapture,
};
