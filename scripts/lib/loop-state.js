/**
 * loop-state.js - Loop state persistence for the autonomous loop orchestrator.
 *
 * Owns the .arcforge-loop.json state file: load/initialize, save, error
 * recording, finalization, and state-derived safety checks (stall,
 * retry storm, stop conditions, summary). scripts/loop.js keeps the
 * orchestration flow and delegates all state handling here.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getTimestamp, readFileSafe } = require('./utils');

const LOOP_STATE_FILE = '.arcforge-loop.json';
const LOOP_ARCHIVE_DIR = '.arcforge-loop.archive';
const MAX_ERRORS_KEPT = 20;
const STALL_THRESHOLD = 2; // iterations without progress

/**
 * Load or initialize loop state
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Loop state
 */
function loadLoopState(projectRoot) {
  const statePath = path.join(projectRoot, LOOP_STATE_FILE);
  const content = readFileSafe(statePath);
  if (content) {
    try {
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to parse loop state at ${statePath}: ${err.message}`);
    }
  }
  return {
    iteration: 0,
    pattern: 'sequential',
    started_at: getTimestamp(),
    completed_tasks: [],
    failed_tasks: [],
    errors: [],
    total_cost: 0,
    last_progress_at: null,
    status: 'running',
  };
}

/**
 * Save loop state
 * @param {Object} state - Loop state
 * @param {string} projectRoot - Project root directory
 */
function saveLoopState(state, projectRoot) {
  const statePath = path.join(projectRoot, LOOP_STATE_FILE);
  try {
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  } catch (err) {
    throw new Error(`Failed to write loop state at ${statePath}: ${err.message}`);
  }
}

/**
 * Stamp the run configuration onto loaded state at the start of a run.
 * Persisting pattern/max_runs/max_cost makes a resumed loop self-describing
 * (the loop-operator can compute budget headroom without re-deriving flags).
 * A fresh run_id scopes stall/retry-storm detection to the current run so a
 * resumed loop is not condemned by a previous run's accumulated errors.
 * @param {Object} state - Loop state (mutated in place)
 * @param {Object} runConfig - Run configuration
 * @param {string} runConfig.pattern - Execution pattern
 * @param {number} runConfig.maxRuns - Maximum iterations for this run
 * @param {number|null} [runConfig.maxCost] - Cost ceiling for this run
 * @returns {Object} The same state
 */
function beginRun(state, { pattern, maxRuns, maxCost = null }) {
  state.pattern = pattern;
  state.max_runs = maxRuns;
  state.max_cost = maxCost;
  state.run_id = crypto.randomUUID();
  state.run_started_iteration = state.iteration;
  return state;
}

/**
 * Reset loop state by archiving the current state file, then return fresh
 * state. The archive lands at `.arcforge-loop.archive/<started_at>.json`
 * (timestamp colons sanitized for cross-platform filenames). Resume safety
 * (AF-2 sentinel) is unaffected: reset is a deliberate pre-run action, so
 * the only window without a state file is before the next run starts.
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Fresh loop state
 */
function resetLoopState(projectRoot) {
  const statePath = path.join(projectRoot, LOOP_STATE_FILE);
  const content = readFileSafe(statePath);
  if (content) {
    let startedAt = getTimestamp();
    try {
      startedAt = JSON.parse(content).started_at || startedAt;
    } catch {
      /* keep the fallback timestamp for unparseable archives */
    }
    const archiveDir = path.join(projectRoot, LOOP_ARCHIVE_DIR);
    const archiveName = `${startedAt.replace(/[:]/g, '-')}.json`;
    try {
      fs.mkdirSync(archiveDir, { recursive: true });
      fs.renameSync(statePath, path.join(archiveDir, archiveName));
    } catch (err) {
      throw new Error(`Failed to archive loop state at ${statePath}: ${err.message}`);
    }
  }
  return loadLoopState(projectRoot);
}

/**
 * Record an error to loop state, capping at MAX_ERRORS_KEPT
 * @param {Object} state - Loop state
 * @param {string} taskId - Failing task id
 * @param {string} errorMsg - Error output (truncated to 500 chars)
 * @param {number} attempt - Attempt number for this task
 */
function recordError(state, taskId, errorMsg, attempt) {
  const entry = {
    task_id: taskId,
    iteration: state.iteration,
    error: errorMsg.slice(0, 500),
    timestamp: getTimestamp(),
    attempt,
  };
  // Stamp the current run so stall/retry-storm detection can scope to it.
  if (state.run_id) entry.run_id = state.run_id;
  state.errors.push(entry);
  // Cap errors to prevent unbounded growth in long runs
  if (state.errors.length > MAX_ERRORS_KEPT) {
    state.errors = state.errors.slice(-MAX_ERRORS_KEPT);
  }
}

/**
 * Errors scoped to the current run when run_id is set; otherwise the full
 * list (legacy state has no run_id and keeps its original whole-state
 * semantics). Errors stamped by an earlier run are excluded once run_id is
 * present, so a resumed loop starts its safety counters from zero.
 * @param {Object} state - Loop state
 * @returns {Array} Errors belonging to the current run
 */
function currentRunErrors(state) {
  if (!state.run_id) return state.errors;
  return state.errors.filter((e) => e.run_id === state.run_id);
}

/**
 * Finalize loop state: stamp terminal status and persist.
 * @param {Object} state - Loop state
 * @param {number} maxRuns - Maximum iterations configured for the run
 * @param {string} projectRoot - Project root directory
 */
function finalizeLoop(state, maxRuns, projectRoot) {
  if (state.iteration >= maxRuns) {
    state.status = 'max_runs';
  }
  state.finished_at = getTimestamp();
  saveLoopState(state, projectRoot);
}

/**
 * Detect stall — no progress across multiple iterations.
 * Uses ISO string comparison (lexicographically sortable) to avoid Date construction.
 * @param {Object} state - Loop state
 * @returns {boolean} Whether the loop is stalled
 */
function isStalled(state) {
  const errors = currentRunErrors(state);
  if (!state.last_progress_at) {
    // Run-scoped: count iterations since this run began so a resumed loop
    // (cumulative `iteration` already high) is not flagged stalled on entry.
    const iterations = state.run_id
      ? state.iteration - (state.run_started_iteration || 0)
      : state.iteration;
    return iterations >= STALL_THRESHOLD;
  }
  const recentErrors = errors.filter((e) => e.timestamp > state.last_progress_at);
  return recentErrors.length >= STALL_THRESHOLD;
}

/**
 * Detect retry storm — same error repeated 3+ times
 * @param {Object} state - Loop state
 * @returns {boolean} Whether a retry storm is detected
 */
function isRetryStorm(state) {
  const errors = currentRunErrors(state);
  if (errors.length < 3) return false;

  const recentErrors = errors.slice(-6);
  const taskCounts = {};
  for (const err of recentErrors) {
    taskCounts[err.task_id] = (taskCounts[err.task_id] || 0) + 1;
  }
  return Object.values(taskCounts).some((count) => count >= 3);
}

/**
 * Check stop conditions common to all loop patterns.
 * @returns {string|null} Stop reason, or null to continue
 */
function checkStopConditions(state, maxCost) {
  if (maxCost && state.total_cost >= maxCost) {
    console.log(`[loop] Cost limit reached ($${state.total_cost})`);
    return 'cost_limit';
  }
  if (isStalled(state)) {
    console.log('[loop] Stall detected — no progress in recent iterations');
    return 'stalled';
  }
  if (isRetryStorm(state)) {
    console.log('[loop] Retry storm detected — same errors repeating');
    return 'retry_storm';
  }
  return null;
}

/**
 * Print loop summary
 * @param {Object} state - Loop state
 */
function printSummary(state) {
  console.log('\n--- Loop Summary ---');
  console.log(`Status: ${state.status}`);
  console.log(`Iterations: ${state.iteration}`);
  console.log(`Completed: ${state.completed_tasks.length} tasks`);
  console.log(`Failed: ${state.failed_tasks.length} tasks`);
  console.log(`Errors: ${state.errors.length} total`);
  if (state.started_at && state.finished_at) {
    const duration = new Date(state.finished_at) - new Date(state.started_at);
    console.log(`Duration: ${Math.round(duration / 1000)}s`);
  }
}

module.exports = {
  LOOP_STATE_FILE,
  LOOP_ARCHIVE_DIR,
  loadLoopState,
  saveLoopState,
  beginRun,
  resetLoopState,
  recordError,
  finalizeLoop,
  isStalled,
  isRetryStorm,
  checkStopConditions,
  printSummary,
};
