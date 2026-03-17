#!/usr/bin/env node
/**
 * loop.js - Autonomous loop orchestrator for arcforge
 *
 * Runs arcforge workflows overnight without human intervention.
 * Each iteration spawns a fresh Claude session via `claude -p`.
 * DAG + git persist state across sessions.
 *
 * Usage:
 *   node scripts/loop.js [--pattern sequential|dag] [--max-runs N] [--max-cost $N]
 *
 * Patterns:
 *   sequential - One task at a time, stop on failure (safest)
 *   dag        - Use parallelTasks() for independent tasks in parallel
 *
 * State: .arcforge-loop.json tracks current iteration, costs, errors.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Coordinator } = require('./lib/coordinator');
const { Feature } = require('./lib/models');
const { execCommand, getTimestamp, readFileSafe } = require('./lib/utils');

const LOOP_STATE_FILE = '.arcforge-loop.json';
const MAX_RETRIES = 1;
const STALL_THRESHOLD = 2; // iterations without progress
const MAX_ERRORS_KEPT = 20;

/**
 * Parse loop CLI arguments
 * @param {string[]} args - Process arguments
 * @returns {Object} Parsed options
 */
function parseLoopArgs(args) {
  const options = {
    pattern: 'sequential',
    maxRuns: 50,
    maxCost: null,
    projectRoot: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pattern':
        options.pattern = args[++i];
        if (!['sequential', 'dag'].includes(options.pattern)) {
          console.error(`Error: Invalid pattern "${options.pattern}". Use "sequential" or "dag".`);
          process.exit(1);
        }
        break;
      case '--max-runs':
        options.maxRuns = parseInt(args[++i], 10);
        if (Number.isNaN(options.maxRuns) || options.maxRuns < 1) {
          console.error('Error: --max-runs must be a positive integer');
          process.exit(1);
        }
        break;
      case '--max-cost':
        options.maxCost = parseFloat(args[++i]);
        if (Number.isNaN(options.maxCost) || options.maxCost <= 0) {
          console.error('Error: --max-cost must be a positive number');
          process.exit(1);
        }
        break;
      case '--help':
      case '-h':
        printLoopHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printLoopHelp();
        process.exit(1);
    }
  }

  return options;
}

/**
 * Print loop help
 */
function printLoopHelp() {
  console.log(`
arcforge loop - Autonomous cross-session execution

USAGE:
  node scripts/loop.js [options]

OPTIONS:
  --pattern sequential|dag   Execution pattern (default: sequential)
  --max-runs N               Maximum iterations (default: 50)
  --max-cost N               Maximum cost in dollars (default: unlimited)
  --help, -h                 Show this help

PATTERNS:
  sequential   One task at a time, stop on failure (safest)
  dag          Run independent tasks in parallel sessions

STATE:
  Loop state is tracked in .arcforge-loop.json
  Errors are logged with timestamps for monitoring

MONITORING:
  Use the loop-operator agent to monitor a running loop.
`);
}

/**
 * Load or initialize loop state
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Loop state
 */
function loadLoopState(projectRoot) {
  const content = readFileSafe(path.join(projectRoot, LOOP_STATE_FILE));
  if (content) {
    return JSON.parse(content);
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
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Build a task context prompt for a spawned Claude session.
 * Uses coordinator.taskContext() for enriched task data.
 * @param {Object} task - Task from coordinator
 * @param {Coordinator} coord - Coordinator instance
 * @param {string} projectRoot - Project root directory
 * @returns {string} Prompt for the spawned session
 */
function buildTaskPrompt(task, coord, projectRoot) {
  const taskType = task instanceof Feature ? 'feature' : 'epic';
  const parts = [`# Task: ${task.name}`, ``, `## Task ID: ${task.id}`, `## Type: ${taskType}`];

  // Enrich with coordinator context (dependencies, parent epic, siblings)
  try {
    const ctx = coord.taskContext(task.id);
    if (ctx.parent_epic) {
      parts.push(
        `## Parent Epic: ${ctx.parent_epic.name} (${Math.round(ctx.parent_epic.progress)}% complete)`,
      );
    }
    if (ctx.dependencies && ctx.dependencies.length > 0) {
      parts.push(
        `## Dependencies: ${ctx.dependencies.map((d) => `${d.name} [${d.status}]`).join(', ')}`,
      );
    }
    if (ctx.sibling_tasks) {
      const remaining = ctx.sibling_tasks.filter((s) => s.status !== 'completed');
      parts.push(`## Remaining siblings: ${remaining.length}`);
    }
  } catch {
    // taskContext may fail for epics without features — continue with basic info
  }

  parts.push(
    ``,
    `## Instructions`,
    ``,
    `Implement this task following the project conventions.`,
    `Use TDD: write failing test first, then implement, then refactor.`,
    `Commit your changes with a conventional commit message.`,
    ``,
    `## Project Root: ${projectRoot}`,
    ``,
    `## Verification`,
    ``,
    `After implementation:`,
    `1. Run \`npm test\` and verify all tests pass`,
    `2. Run \`npm run lint\` and fix any issues`,
    `3. Commit with format: type(scope): description`,
  );

  // Try to read the epic/feature spec if available
  const epicDir = path.join(projectRoot, 'epics');
  if (fs.existsSync(epicDir)) {
    parts.push(``, `## Specs`, `Read specs from: ${epicDir}`);
  }

  return parts.join('\n');
}

/**
 * Spawn a Claude session for a task
 * @param {string} prompt - Task prompt
 * @param {string} projectRoot - Project root directory
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function spawnSession(prompt, projectRoot) {
  return execCommand('claude', ['-p', '--output-format', 'text'], {
    input: prompt,
    cwd: projectRoot,
    timeout: 600000, // 10 minute timeout per task
  });
}

/**
 * Record an error to loop state, capping at MAX_ERRORS_KEPT
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
 * Run a single task iteration
 * @param {Object} task - Task from coordinator
 * @param {Coordinator} coord - Coordinator instance
 * @param {Object} state - Loop state
 * @param {string} projectRoot - Project root directory
 * @returns {boolean} Whether the task succeeded
 */
function runTask(task, coord, state, projectRoot) {
  const taskType = task instanceof Feature ? 'feature' : 'epic';
  console.log(`[loop] Iteration ${state.iteration}: Running ${taskType} ${task.id} — ${task.name}`);

  const prompt = buildTaskPrompt(task, coord, projectRoot);
  let result = spawnSession(prompt, projectRoot);

  if (result.exitCode !== 0) {
    console.log(`[loop] Task ${task.id} failed, retrying once...`);
    recordError(state, task.id, result.stderr, 1);

    // Retry once
    result = spawnSession(prompt, projectRoot);
    if (result.exitCode !== 0) {
      console.log(`[loop] Task ${task.id} failed after retry — blocking`);
      recordError(state, task.id, result.stderr, 2);
      state.failed_tasks.push(task.id);

      try {
        coord.blockTask(task.id, `Loop: failed after ${MAX_RETRIES + 1} attempts`);
      } catch (err) {
        console.error(`[loop] Warning: could not block task ${task.id}: ${err.message}`);
      }
      return false;
    }
  }

  // Success — update DAG before recording in state
  try {
    coord.completeTask(task.id);
    state.completed_tasks.push(task.id);
    state.last_progress_at = getTimestamp();
    console.log(`[loop] Task ${task.id} completed successfully`);
  } catch (err) {
    console.error(`[loop] Warning: DAG update failed for ${task.id}: ${err.message}`);
    // Don't record as completed since DAG wasn't updated
    return false;
  }
  return true;
}

/**
 * Detect stall — no progress across multiple iterations.
 * Uses ISO string comparison (lexicographically sortable) to avoid Date construction.
 * @param {Object} state - Loop state
 * @returns {boolean} Whether the loop is stalled
 */
function isStalled(state) {
  if (!state.last_progress_at) {
    return state.iteration >= STALL_THRESHOLD;
  }
  const recentErrors = state.errors.filter((e) => e.timestamp > state.last_progress_at);
  return recentErrors.length >= STALL_THRESHOLD;
}

/**
 * Detect retry storm — same error repeated 3+ times
 * @param {Object} state - Loop state
 * @returns {boolean} Whether a retry storm is detected
 */
function isRetryStorm(state) {
  if (state.errors.length < 3) return false;

  const recentErrors = state.errors.slice(-6);
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
 * Try to create a Coordinator, returning null on failure.
 */
function tryCreateCoordinator(projectRoot, state) {
  try {
    return new Coordinator(projectRoot);
  } catch {
    console.log('[loop] No dag.yaml found — nothing to do');
    state.status = 'no_dag';
    return null;
  }
}

/**
 * Finalize loop state and print summary.
 */
function finalizeLoop(state, maxRuns, projectRoot) {
  if (state.iteration >= maxRuns) {
    state.status = 'max_runs';
  }
  state.finished_at = getTimestamp();
  saveLoopState(state, projectRoot);
  printSummary(state);
}

/**
 * Run sequential loop pattern
 * @param {Object} options - Loop options
 */
function runSequential(options) {
  const { projectRoot, maxRuns, maxCost } = options;
  const state = loadLoopState(projectRoot);
  state.pattern = 'sequential';

  console.log(`[loop] Starting sequential loop (max ${maxRuns} runs)`);

  while (state.iteration < maxRuns) {
    state.iteration++;

    const stopReason = checkStopConditions(state, maxCost);
    if (stopReason) {
      state.status = stopReason;
      break;
    }

    const coord = tryCreateCoordinator(projectRoot, state);
    if (!coord) break;

    const task = coord.nextTask();
    if (!task) {
      console.log('[loop] All tasks complete!');
      state.status = 'complete';
      break;
    }

    const success = runTask(task, coord, state, projectRoot);
    saveLoopState(state, projectRoot);

    if (!success) {
      console.log('[loop] Task failed — stopping sequential loop');
      state.status = 'failed';
      break;
    }
  }

  finalizeLoop(state, maxRuns, projectRoot);
}

/**
 * Run DAG-parallel loop pattern
 * @param {Object} options - Loop options
 */
function runDag(options) {
  const { projectRoot, maxRuns, maxCost } = options;
  const state = loadLoopState(projectRoot);
  state.pattern = 'dag';

  console.log(`[loop] Starting DAG loop (max ${maxRuns} runs)`);

  while (state.iteration < maxRuns) {
    state.iteration++;

    const stopReason = checkStopConditions(state, maxCost);
    if (stopReason) {
      state.status = stopReason;
      break;
    }

    const coord = tryCreateCoordinator(projectRoot, state);
    if (!coord) break;

    // Try parallel tasks first
    const parallelEpics = coord.parallelTasks();
    if (parallelEpics.length > 1) {
      console.log(`[loop] Found ${parallelEpics.length} parallel epics`);

      let anySuccess = false;
      for (const epic of parallelEpics) {
        const success = runTask(epic, coord, state, projectRoot);
        saveLoopState(state, projectRoot);
        if (success) anySuccess = true;
      }

      if (!anySuccess) {
        console.log('[loop] No parallel tasks succeeded');
        state.status = 'failed';
        break;
      }
      continue;
    }

    // Fall back to next task
    const task = coord.nextTask();
    if (!task) {
      console.log('[loop] All tasks complete!');
      state.status = 'complete';
      break;
    }

    const success = runTask(task, coord, state, projectRoot);
    saveLoopState(state, projectRoot);

    if (!success) {
      // In DAG mode, try to continue with other tasks
      const nextTask = coord.nextTask();
      if (!nextTask) {
        console.log('[loop] No more tasks available after failure');
        state.status = 'failed';
        break;
      }
    }
  }

  finalizeLoop(state, maxRuns, projectRoot);
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

/**
 * Main entry point
 */
function main() {
  const options = parseLoopArgs(process.argv.slice(2));

  if (options.pattern === 'dag') {
    runDag(options);
  } else {
    runSequential(options);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseLoopArgs,
  loadLoopState,
  saveLoopState,
  buildTaskPrompt,
  spawnSession,
  runTask,
  isStalled,
  isRetryStorm,
  checkStopConditions,
  runSequential,
  runDag,
};
