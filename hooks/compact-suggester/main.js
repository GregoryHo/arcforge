#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * Tracks tool calls and suggests /compact at strategic points:
 * - First suggestion at 50 tool calls
 * - Subsequent reminders every 25 calls
 * - Phase-aware messaging: references phase transitions instead of generic reminders
 * - Read/write ratio: suppresses during heavy write phases, boosts during read-heavy phases
 *
 * Triggered on PostToolUse for ALL tools.
 *
 * Dual-channel delivery (ICL-10): on a threshold hit the hook emits EXACTLY ONE
 * JSON object carrying BOTH a user-visible systemMessage (the phase-aware
 * suggestion) AND a model-visible additionalContext one-liner (the arc-compacting
 * indicator) via the RV-1 merged helper outputPostToolUseFeedback. The user line
 * is a notification; the model line is a routing indicator pointing at the
 * arc-compacting skill — never a silent model directive.
 *
 * State: a SINGLE session-scoped JSON file (getSuggesterStatePath) holds the
 * tool counter, the rolling phase window, and the suggestion snapshots — 1 read
 * + 1 write per event instead of three separate counter files. PreCompact resets
 * this file on every compaction so suggestions never survive a context boundary.
 *
 * Phase detection uses a ROLLING WINDOW of the most recent tool types, so the
 * suggested message reflects the current phase (read vs write heavy) rather than
 * the lifetime average that early reads would otherwise dominate.
 *
 * The shared diary-trigger tool-count is incremented separately via
 * incrementSharedToolCount() — that counter is owned by diary-capture and is the
 * single source of truth for the diary threshold (binding coupling, do not drop).
 */

const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  outputPostToolUseFeedback,
  readJsonFile,
  writeJsonFile,
  getTimestamp,
  loadSession,
  saveSession,
  log,
} = require('../../scripts/lib/utils');
const {
  incrementSharedToolCount,
  getSuggesterStatePath,
} = require('../../scripts/lib/diary-capture');

const THRESHOLD = 50; // First suggestion
const INTERVAL = 25; // Subsequent reminders
const MIN_PHASE_SAMPLES = 10;
const WINDOW_SIZE = 20; // Rolling phase window: most recent tool types

const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit'];
const READ_TOOLS = ['Read', 'Glob', 'Grep'];

// Empty state shape — one JSON file per session holds everything.
function emptyState() {
  return { tools: 0, reads: 0, writes: 0, window: [], suggestions: [] };
}

/**
 * Load the single suggester state file (1 read). Missing/corrupt → empty state.
 */
function readState() {
  const state = readJsonFile(getSuggesterStatePath(), null);
  if (!state || typeof state !== 'object') return emptyState();
  return {
    tools: Number(state.tools) || 0,
    reads: Number(state.reads) || 0,
    writes: Number(state.writes) || 0,
    window: Array.isArray(state.window) ? state.window : [],
    suggestions: Array.isArray(state.suggestions) ? state.suggestions : [],
  };
}

/**
 * Persist the single suggester state file (1 write).
 */
function writeState(state) {
  writeJsonFile(getSuggesterStatePath(), state);
}

/**
 * Check if we should show a suggestion
 */
function shouldSuggest(count) {
  return count >= THRESHOLD && (count - THRESHOLD) % INTERVAL === 0;
}

/**
 * Compute read/write counts from the rolling window (most recent tool types).
 * @param {string[]} window - Array of 'r'/'w' entries, oldest first.
 * @returns {{ reads: number, writes: number, total: number }}
 */
function windowRatio(window) {
  let reads = 0;
  let writes = 0;
  for (const t of window) {
    if (t === 'r') reads++;
    else if (t === 'w') writes++;
  }
  return { reads, writes, total: reads + writes };
}

/**
 * Classify a phase from a rolling window.
 * @returns {'read-heavy'|'write-heavy'|'neutral'}
 */
function phaseFromWindow(window) {
  const { reads, writes, total } = windowRatio(window);
  if (total < MIN_PHASE_SAMPLES) return 'neutral';
  if (reads / total > 0.7) return 'read-heavy';
  if (writes / total > 0.6) return 'write-heavy';
  return 'neutral';
}

/**
 * Check if a write-heavy phase should suppress non-critical reminders.
 * Suppresses at non-threshold counts below 100 during active implementation.
 */
function shouldSuppressReminder(count, window) {
  const writeHeavy = phaseFromWindow(window) === 'write-heavy';
  return writeHeavy && count !== THRESHOLD && count < 100;
}

/**
 * Build the user-visible suggestion message (systemMessage channel).
 *
 * Slimmed to a phase indicator (ICL-10): it names the current phase and the tool
 * count, then defers the actual compact/no-compact timing call to the
 * arc-compacting skill rather than inlining the decision guide. The model-visible
 * companion line (buildModelIndicator) carries the same arc-compacting pointer.
 */
function buildMessage(count, window) {
  const phase = phaseFromWindow(window);
  const label =
    phase === 'read-heavy'
      ? 'mostly reads'
      : phase === 'write-heavy'
        ? 'active implementation'
        : 'mixed work';
  return `\n📊 ${count} tool calls (${label}) — possible compaction boundary. See arc-compacting for whether to /compact now.\n`;
}

/**
 * Build the model-visible compaction-prep indicator (additionalContext channel).
 *
 * This is the ICL-10 capability: a one-line routing indicator that reaches the
 * MODEL (not just the user), pointing at the arc-compacting skill so the model
 * can make the phase-boundary timing call. It states the phase as evidence; it
 * never issues a compaction directive — the decision stays with arc-compacting.
 */
function buildModelIndicator(count, window) {
  return `arc-compacting indicator: ${count} tool calls (${phaseFromWindow(window)} phase) — at a possible compaction boundary. Consult arc-compacting to decide whether to /compact at this phase boundary.`;
}

/**
 * Record a read/write classification into the rolling window + cumulative tallies.
 * Mutates `state` in place. Returns the classification ('r'|'w'|null).
 */
function trackToolType(state, input) {
  const toolName = input?.tool_name || '';
  let kind = null;
  if (READ_TOOLS.some((t) => toolName.includes(t))) {
    kind = 'r';
    state.reads++;
  } else if (WRITE_TOOLS.some((t) => toolName.includes(t))) {
    kind = 'w';
    state.writes++;
  }
  if (kind) {
    state.window.push(kind);
    if (state.window.length > WINDOW_SIZE) {
      state.window.splice(0, state.window.length - WINDOW_SIZE);
    }
  }
  return kind;
}

/**
 * Append a suggestion snapshot to the live session JSON (best-effort).
 * Records the phase at suggestion time so ICL-12 can correlate suggestions
 * against compactions. Silently skipped when no session file exists yet.
 */
function recordSessionSuggestion(snapshot) {
  const session = loadSession();
  if (!session) return;
  session.suggestions = session.suggestions || [];
  session.suggestions.push(snapshot);
  saveSession(session);
}

/**
 * Main entry point
 */
function main() {
  try {
    const stdin = readStdinSync();
    const input = parseStdinJson(stdin);
    setSessionIdFromInput(input);

    // Single read of the consolidated state file.
    const state = readState();

    // Track read/write classification into the rolling window.
    trackToolType(state, input);

    // Increment the suggester's own tool counter.
    state.tools += 1;

    // Increment the shared diary tool-count (owned by diary-capture). This is the
    // diary threshold's source of truth — keep this call to preserve the binding.
    incrementSharedToolCount();

    // Decide whether to suggest; record the snapshot before persisting state.
    if (shouldSuggest(state.tools) && !shouldSuppressReminder(state.tools, state.window)) {
      const snapshot = {
        count: state.tools,
        phase: phaseFromWindow(state.window),
        at: getTimestamp(),
      };
      state.suggestions.push(snapshot);
      recordSessionSuggestion(snapshot);
      writeState(state);
      // Dual channel (ICL-10): ONE merged JSON object carrying the model-visible
      // additionalContext (arc-compacting indicator) AND the user-visible
      // systemMessage suggestion. The model line is never a silent directive.
      outputPostToolUseFeedback(buildModelIndicator(state.tools, state.window), {
        systemMessage: buildMessage(state.tools, state.window),
      });
      return;
    }

    // Single write of the consolidated state file.
    writeState(state);
  } catch (e) {
    // Hooks must never crash the session.
    log(`[compact-suggester] Warning: ${e.message}`);
  }
}

module.exports = {
  emptyState,
  readState,
  writeState,
  readCount: () => readState().tools,
  getStateFilePath: getSuggesterStatePath,
  shouldSuggest,
  shouldSuppressReminder,
  buildMessage,
  buildModelIndicator,
  trackToolType,
  windowRatio,
  phaseFromWindow,
};

// Run if executed directly
if (require.main === module) {
  main();
}
