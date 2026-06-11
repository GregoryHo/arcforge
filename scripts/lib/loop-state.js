/**
 * loop-state.js - Loop state persistence for the autonomous loop orchestrator.
 *
 * Owns the .arcforge-loop.json state file: load/initialize, save, error
 * recording, and finalization. scripts/loop.js keeps the orchestration
 * flow and delegates all state-file IO here.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getTimestamp, readFileSafe } = require('./utils');

const LOOP_STATE_FILE = '.arcforge-loop.json';
const MAX_ERRORS_KEPT = 20;

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
 * Record an error to loop state, capping at MAX_ERRORS_KEPT
 * @param {Object} state - Loop state
 * @param {string} taskId - Failing task id
 * @param {string} errorMsg - Error output (truncated to 500 chars)
 * @param {number} attempt - Attempt number for this task
 */
function recordError(state, taskId, errorMsg, attempt) {
  state.errors.push({
    task_id: taskId,
    iteration: state.iteration,
    error: errorMsg.slice(0, 500),
    timestamp: getTimestamp(),
    attempt,
  });
  // Cap errors to prevent unbounded growth in long runs
  if (state.errors.length > MAX_ERRORS_KEPT) {
    state.errors = state.errors.slice(-MAX_ERRORS_KEPT);
  }
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

module.exports = {
  loadLoopState,
  saveLoopState,
  recordError,
  finalizeLoop,
};
