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
 *
 * Consent split (D-009 / D-010): the draft is continuity and is written either
 * way, from the session record's counts, tool names and modified paths.
 * ENRICHMENT is not — it hands a session summary to a
 * model — so it runs only when learning is enabled in some scope. With learning
 * off the draft therefore keeps its `TO BE ENRICHED` stubs permanently; that is
 * the contract, not a failure.
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
// Consent gate
// ---------------------------------------------------------------------------

/**
 * Whether the learning opt-in authorizes handing session content to a model.
 *
 * `./learning` is required LAZILY on purpose: compact-suggester imports this
 * module on the synchronous PostToolUse path (hooks B-7), and that path must
 * not pay learning.js's module-load cost on every tool call. The gate is only
 * ever consulted from the Stop/PreCompact paths, which are already off it.
 *
 * Fails CLOSED on a missing projectRoot rather than falling back to
 * process.cwd(): consent belongs to a project the caller named, and a cwd is
 * whatever directory the host happened to start the hook in. Answering from it
 * would let an unrelated project's opt-in authorize this one's capture. A
 * caller that forgets the argument gets "no consent", never a guess.
 *
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Project root whose scoped config to
 *   read. Omitted or blank means no consent.
 * @returns {boolean}
 */
function learningCaptureEnabled({ projectRoot } = {}) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') return false;
  try {
    const { isLearningEnabledAnyScope } = require('./learning');
    return isLearningEnabledAnyScope({ projectRoot });
  } catch {
    // Unreadable config is not consent.
    return false;
  }
}

/**
 * D-010's retention half: verbatim user prose lives in the session record only
 * while the learning opt-in is on. The record outlives a single event — Stop
 * fires once per turn and PreCompact once per compaction, both reloading and
 * rewriting the whole record — so a gate that only skipped the write would keep
 * re-serializing prose captured before the user opted out.
 *
 * Mutates `session` in place and returns whether capture is currently allowed,
 * so a caller that also writes prose reuses this one gate read.
 *
 * @param {Object|null} session - Session record, mutated in place.
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Omitted or blank means no consent
 *   (learningCaptureEnabled fails closed), which prunes.
 * @returns {boolean} true when the opt-in allows verbatim prose.
 */
function pruneUngatedProse(session, { projectRoot } = {}) {
  const allowed = learningCaptureEnabled({ projectRoot });
  if (!allowed && session && session.userMessageContent !== undefined) {
    delete session.userMessageContent;
  }
  return allowed;
}

/**
 * Stamp a parsed harness transcript's summary onto a session record.
 *
 * Shared by the two hooks that write the record above the diary threshold —
 * Stop (session-tracker/end.js) and PreCompact (pre-compact/main.js) — so both
 * render their draft from the same fields instead of one path re-deriving them.
 *
 * `./transcript` is required LAZILY for the same reason `./learning` is:
 * compact-suggester imports this module on the synchronous PostToolUse path
 * (hooks B-7), and only the Stop/PreCompact paths ever parse a transcript.
 *
 * The consent split (D-010) is the caller's: counts, tool names and paths are
 * continuity and are stamped either way, verbatim prose only under the opt-in.
 * The caller has already read that gate (pruneUngatedProse returns it), so it is
 * passed in rather than read a second time here.
 *
 * A missing or unparseable transcript leaves the record's existing fields
 * untouched and reports false. Refreshing what can be read is this function's
 * job; CLEARING what cannot is the caller's call, and the two callers differ —
 * Stop clears the paths, a compaction keeps the ones an earlier Stop wrote
 * rather than blanking a record it cannot refresh.
 *
 * @param {Object} session - Session record, mutated in place.
 * @param {string} [transcriptPath] - Harness transcript to parse.
 * @param {Object} [opts]
 * @param {boolean} [opts.learningOn=false] - Whether verbatim prose may be written.
 * @returns {boolean} true when a transcript was parsed and stamped.
 */
function applyTranscriptToSession(session, transcriptPath, { learningOn = false } = {}) {
  if (!session || !transcriptPath) return false;

  const { parseTranscript } = require('./transcript');
  const data = parseTranscript(transcriptPath);
  if (!data) return false;

  if (learningOn) session.userMessageContent = data.userMessages;
  session.toolsUsed = data.toolsUsed;
  session.filesModified = data.filesModified;
  return true;
}

// ---------------------------------------------------------------------------
// The enricher's session summary — built once, from the record both hooks write
// ---------------------------------------------------------------------------

/**
 * Duration in minutes between two ISO timestamps, or null if either is missing.
 * Moved here verbatim from the Stop hook when PreCompact needed the same stats
 * line; it is a pure function of the record, never Stop-specific.
 *
 * @param {string} startISO
 * @param {string} endISO
 * @returns {number|null}
 */
function calculateDurationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const durationMs = new Date(endISO) - new Date(startISO);
  return Math.round(durationMs / 60000);
}

/**
 * Format the session's activity as the one-liner the enricher prompt carries.
 * @param {Object} session
 * @returns {string}
 */
function formatSessionStats(session) {
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
 * Build the session summary handed to the background enricher — the shape
 * spawnDiaryEnricher serializes into its prompt and runDiaryCapture documents.
 *
 * Both event paths build it from the same place: Stop from the record it just
 * closed, PreCompact from the record it just stamped. A compaction used to hand
 * the enricher `{}`, so the draft's prose sections were enriched from nothing
 * even after its metrics were correct.
 *
 * The opt-in needs no check here and deliberately gets none: `userMessageContent`
 * is only ever in the record while learning is on (pruneUngatedProse removes it
 * otherwise, and applyTranscriptToSession never writes it), so with learning off
 * this yields `userMessages: []` by construction — and runDiaryCapture does not
 * spawn the enricher at all in that state.
 *
 * @param {Object} session - Session record.
 * @returns {{ userMessages: string[], toolsUsed: string[], filesModified: string[], stats: string }}
 */
function buildSessionSummary(session) {
  return {
    userMessages: session.userMessageContent || [],
    toolsUsed: session.toolsUsed || [],
    filesModified: session.filesModified || [],
    stats: formatSessionStats(session),
  };
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
    const autoDiaryPath = path.join(__dirname, 'auto-diary.js');
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
 * Permissions (D-009). The run used to pass --dangerously-skip-permissions,
 * which bypasses every check in the child. It now carries the narrowest set
 * that still enriches, verified by spike against the real CLI:
 *   --tools Read,Write        the only tools that exist in the child at all.
 *   --add-dir <draft dir>     the draft lives outside the spawning cwd, so
 *                             without this the write is refused outright.
 *   --permission-mode acceptEdits
 *                             auto-approves file edits inside those
 *                             directories, replacing the blanket bypass. It is
 *                             required, not a convenience: a detached run has
 *                             nobody to answer a permission prompt, so without
 *                             it the write simply hangs and the draft is never
 *                             filled in.
 *
 * A per-file --allowed-tools allowlist was tried and deliberately left out: it
 * pre-approves, it does not deny, so it changed nothing here and would have
 * read like a confinement it does not provide.
 *
 * What this is NOT, so no caller or doc overstates it: no `cwd` is passed, so
 * the child inherits this process's working directory — the user's project —
 * and --add-dir ADDS the draft's directory alongside it rather than restricting
 * the run to it. Together with acceptEdits that means edits are auto-approved
 * across both. This is a narrowing of the old blanket bypass, not a sandbox.
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
        '--add-dir',
        path.dirname(draftPath),
        '--permission-mode',
        'acceptEdits',
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
 * draft, spawns the background enricher when the learning opt-in allows it
 * (BOTH event paths), then resets the counters (the sole reset). Callers handle
 * event-specific work (queuing diary-ready vs reflect-ready, session-file
 * updates).
 *
 * `projectRoot` carries the consent gate and is deliberately explicit: it is
 * never defaulted to process.cwd(), which would make the answer depend on
 * wherever the caller happened to be running from. Omit it and the gate reads
 * as "no consent" (learningCaptureEnabled fails closed) — the draft is still
 * written, the enricher is not spawned. That is a degraded call, not an error:
 * hooks silently catch, so throwing here would take the draft down with it.
 *
 * @param {Object} opts
 * @param {string} opts.project
 * @param {string} opts.date
 * @param {string} opts.sessionId
 * @param {string} opts.projectRoot - Project root the learning opt-in is read
 *   from. Omitted means no consent: draft yes, enrichment no.
 * @param {Object} [opts.transcriptData] - { userMessages, toolsUsed, filesModified, stats }.
 * @returns {{ triggered: boolean, draftPath: string|null, enriched: boolean,
 *   userCount: number, toolCount: number }}
 */
function runDiaryCapture(opts) {
  const { project, date, sessionId, projectRoot, transcriptData = {} } = opts;
  const { userCount, toolCount } = readCounts();

  if (!shouldTrigger(userCount, toolCount)) {
    return { triggered: false, draftPath: null, enriched: false, userCount, toolCount };
  }

  const draftPath = tryGenerateAutoDiary(project, date, sessionId);

  // The draft is continuity and is always written; enrichment sends a session
  // summary to a model, so it waits for the opt-in (D-009).
  const enriched = Boolean(draftPath) && learningCaptureEnabled({ projectRoot });
  if (enriched) {
    spawnDiaryEnricher(draftPath, transcriptData, project);
  }

  resetCounters();

  return { triggered: true, draftPath, enriched, userCount, toolCount };
}

module.exports = {
  STALE_DRAFT_PROBE_BYTES,
  readCounts,
  resetCounters,
  incrementSharedToolCount,
  getSuggesterStatePath,
  draftIsStale,
  learningCaptureEnabled,
  pruneUngatedProse,
  applyTranscriptToSession,
  calculateDurationMinutes,
  buildSessionSummary,
  tryGenerateAutoDiary,
  spawnDiaryEnricher,
  runDiaryCapture,
};
