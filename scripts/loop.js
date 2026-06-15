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
const { spawnSession, spawnSessionAsync } = require('./lib/loop-session');
const {
  loadLoopState,
  saveLoopState,
  beginRun,
  recordError,
  finalizeLoop,
} = require('./lib/loop-state');
const { isStalled, isRetryStorm, checkStopConditions, printSummary } = require('./lib/loop-state');
const { Feature } = require('./lib/models');
const {
  detectPackageManager,
  getDefaultTestCommand,
  getPmRunCommand,
  hasScript,
} = require('./lib/package-manager');
const { getTimestamp, readFileSafe } = require('./lib/utils');

const MAX_RETRIES = 1;

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
    epic: null,
    taskTimeoutMs: null,
    permissionMode: null,
    allowedTools: null,
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
      case '--epic':
        options.epic = args[++i];
        break;
      case '--task-timeout': {
        const seconds = parseInt(args[++i], 10);
        if (Number.isNaN(seconds) || seconds < 1) {
          console.error('Error: --task-timeout must be a positive integer (seconds)');
          process.exit(1);
        }
        options.taskTimeoutMs = seconds * 1000;
        break;
      }
      case '--permission-mode':
        options.permissionMode = args[++i];
        break;
      case '--allowed-tools':
        options.allowedTools = args[++i];
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
  --epic <id>                Scope loop to a single epic (safe for parallel loops)
  --task-timeout N           Per-session timeout in seconds (default: 600)
  --permission-mode <mode>   Pass --permission-mode through to spawned claude sessions
  --allowed-tools <tools>    Pass --allowed-tools through to spawned claude sessions
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
 * Detect if running inside a worktree by checking for .arcforge-epic marker.
 * @param {string} projectRoot - Current project root
 * @returns {{ inWorktree: boolean, epicId: string|null, basePath: string|null }}
 */
function detectWorktree(projectRoot) {
  const content = readFileSafe(path.join(projectRoot, '.arcforge-epic'));
  if (!content) {
    return { inWorktree: false, epicId: null, basePath: null };
  }
  try {
    const { parseDagYaml } = require('./lib/yaml-parser');
    const data = parseDagYaml(content);
    return {
      inWorktree: true,
      epicId: data.epic || null,
      basePath: data.base_worktree || null,
    };
  } catch {
    return { inWorktree: true, epicId: null, basePath: null };
  }
}

/**
 * Resolve epic scope from explicit flag or worktree auto-detection.
 * @param {string|null} epic - Explicit epic ID from --epic flag
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Resolved epic scope
 */
function resolveEpicScope(epic, projectRoot) {
  const scope = epic || detectWorktree(projectRoot).epicId;
  if (!epic && scope) {
    console.log(`[loop] Detected worktree for epic ${scope} — auto-scoping`);
  }
  return scope;
}

/**
 * Resolve an epic's spec_path to a spawn-cwd-relative path.
 * Resolution order: spec-dir-relative (`specs/<specId>/<spec_path>`, the
 * sdd-v2 planner convention) first, then project-root-relative. Only paths
 * that exist on disk are emitted — a path the spawned session cannot
 * resolve from its cwd is worse than no path at all.
 * @param {string} specPath - Raw spec_path value from dag.yaml
 * @param {string} projectRoot - Spawn cwd for loop sessions
 * @param {string|null} specId - Spec id for spec-dir-relative resolution
 * @returns {string|null} Spawn-cwd-relative path, or null when unresolvable
 */
function resolveSpecPath(specPath, projectRoot, specId) {
  if (!specPath || typeof specPath !== 'string') return null;
  const candidates = [];
  if (specId) {
    candidates.push(path.resolve(projectRoot, 'specs', specId, specPath));
  }
  candidates.push(path.resolve(projectRoot, specPath));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.relative(projectRoot, candidate);
  }
  return null;
}

/**
 * Build the `## Specs` lines for a task's epic.
 * Emits the epic's spec document and the spec epic directory when they
 * exist on disk; legacy dags without spec_path gracefully omit both.
 * @param {Object|null} epic - Epic carrying spec_path (null → no lines)
 * @param {Coordinator} coord - Coordinator instance (provides specId)
 * @param {string} projectRoot - Spawn cwd for loop sessions
 * @returns {string[]} Lines for the Specs section (may be empty)
 */
function buildSpecLines(epic, coord, projectRoot) {
  if (!epic) return [];
  const lines = [];
  const specId = coord.specId || null;
  const specDoc = resolveSpecPath(epic.spec_path, projectRoot, specId);
  if (specDoc) {
    lines.push(`Spec: ${specDoc}`);
  }
  if (specId) {
    const epicDir = path.join('specs', specId, 'epics', epic.id);
    if (fs.existsSync(path.join(projectRoot, epicDir))) {
      lines.push(`Epic docs: ${epicDir}${path.sep}`);
    }
  }
  return lines;
}

/**
 * Build verification instructions from detected project commands.
 * Returns [] when the project type is unknown (no package.json or
 * pyproject.toml) — the verification block is omitted rather than
 * prescribing commands that don't exist.
 * @param {string} projectRoot - Project root directory
 * @returns {string[]} Ordered instruction lines (numbering added by caller)
 */
function buildVerificationLines(projectRoot) {
  let testCommand;
  try {
    testCommand = getDefaultTestCommand(projectRoot).join(' ');
  } catch {
    return [];
  }
  const lines = [`Run \`${testCommand}\` and verify all tests pass`];
  if (hasScript('lint', projectRoot)) {
    const pmName = detectPackageManager(projectRoot) || 'npm';
    lines.push(`Run \`${getPmRunCommand('lint', pmName).join(' ')}\` and fix any issues`);
  }
  lines.push('Commit with format: type(scope): description');
  return lines;
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

  // Enrich with coordinator context (dependencies, parent epic, siblings).
  // The epic resolved here also carries spec_path for the Specs section.
  let specEpic = taskType === 'epic' ? task : null;
  try {
    const ctx = coord.taskContext(task.id);
    if (ctx.parent_epic) {
      if (!specEpic) specEpic = coord.dag.getTask(ctx.parent_epic.id);
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
  );

  const verification = buildVerificationLines(projectRoot);
  if (verification.length > 0) {
    parts.push(``, `## Verification`, ``, `After implementation:`);
    parts.push(...verification.map((line, idx) => `${idx + 1}. ${line}`));
  }

  const specLines = buildSpecLines(specEpic, coord, projectRoot);
  if (specLines.length > 0) {
    parts.push(``, `## Specs`, ...specLines);
  }

  return parts.join('\n');
}

/**
 * Run a single task iteration
 * @param {Object} task - Task from coordinator
 * @param {Coordinator} coord - Coordinator instance
 * @param {Object} state - Loop state
 * @param {Object} options - Loop options (projectRoot + spawn pass-through)
 * @returns {boolean} Whether the task succeeded
 */
function runTask(task, coord, state, options) {
  const { projectRoot } = options;
  const taskType = task instanceof Feature ? 'feature' : 'epic';
  console.log(`[loop] Iteration ${state.iteration}: Running ${taskType} ${task.id} — ${task.name}`);

  const prompt = buildTaskPrompt(task, coord, projectRoot);
  let result = spawnSession(prompt, projectRoot, options);
  state.total_cost += result.costUsd;

  if (result.exitCode !== 0) {
    console.log(`[loop] Task ${task.id} failed, retrying once...`);
    recordError(state, task.id, result.stderr, 1);

    // Retry once
    result = spawnSession(prompt, projectRoot, options);
    state.total_cost += result.costUsd;
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
 * Try to create a Coordinator, returning null on failure.
 *
 * @param {string} projectRoot
 * @param {Object} state
 * @param {string|null} [specId] - spec id (CLI `arcforge loop` resolves
 *   this up front and passes it through loopOptions.specId).
 */
function tryCreateCoordinator(projectRoot, state, specId = null) {
  try {
    const coord = new Coordinator(projectRoot, specId);
    // Force eager spec/DAG resolution inside this try so unresolved-spec
    // errors from lazy `dagPath` / `dag` getters become a clean `no_dag`
    // status instead of an uncaught throw later in the loop. Accessing
    // `dag` covers both the specId check and DAG file readability.
    const _probe = coord.dag;
    if (coord.syncEpicStatusesFromBase()) {
      console.log('[loop] Synced epic statuses from base DAG');
    }
    return coord;
  } catch {
    console.log('[loop] No dag.yaml found — nothing to do');
    state.status = 'no_dag';
    return null;
  }
}

/**
 * Run sequential loop pattern
 * @param {Object} options - Loop options
 */
function runSequential(options) {
  const { projectRoot, maxRuns, maxCost, epic } = options;
  const state = loadLoopState(projectRoot);
  beginRun(state, { pattern: 'sequential', maxRuns, maxCost });
  const epicScope = resolveEpicScope(epic, projectRoot);

  console.log(`[loop] Starting sequential loop (max ${maxRuns} runs)`);

  while (state.iteration < maxRuns) {
    state.iteration++;

    const stopReason = checkStopConditions(state, maxCost);
    if (stopReason) {
      state.status = stopReason;
      break;
    }

    const coord = tryCreateCoordinator(projectRoot, state, options.specId);
    if (!coord) break;

    const task = coord.nextTask(epicScope);
    if (!task) {
      console.log('[loop] All tasks complete!');
      state.status = 'complete';
      break;
    }

    const success = runTask(task, coord, state, options);
    saveLoopState(state, projectRoot);

    if (!success) {
      console.log('[loop] Task failed — stopping sequential loop');
      state.status = 'failed';
      break;
    }
  }

  finalizeLoop(state, maxRuns, projectRoot);
  printSummary(state);
}

/**
 * Run DAG-parallel loop pattern.
 * Independent tasks are spawned concurrently via spawnSessionAsync.
 * @param {Object} options - Loop options
 */
async function runDag(options) {
  const { projectRoot, maxRuns, maxCost, epic } = options;
  const state = loadLoopState(projectRoot);
  beginRun(state, { pattern: 'dag', maxRuns, maxCost });
  const epicScope = resolveEpicScope(epic, projectRoot);

  console.log(`[loop] Starting DAG loop (max ${maxRuns} runs)`);

  while (state.iteration < maxRuns) {
    state.iteration++;

    const stopReason = checkStopConditions(state, maxCost);
    if (stopReason) {
      state.status = stopReason;
      break;
    }

    const coord = tryCreateCoordinator(projectRoot, state, options.specId);
    if (!coord) break;

    // Try parallel tasks first
    const parallelEpics = coord.parallelTasks(epicScope);
    if (parallelEpics.length > 1) {
      console.log(`[loop] Found ${parallelEpics.length} parallel epics — running concurrently`);

      // Spawn all sessions concurrently
      const taskEntries = parallelEpics.map((epicItem) => ({
        epic: epicItem,
        prompt: buildTaskPrompt(epicItem, coord, projectRoot),
      }));
      const spawnResults = await Promise.all(
        taskEntries.map((entry) => spawnSessionAsync(entry.prompt, projectRoot, options)),
      );

      // Process results sequentially (state + DAG updates are not concurrent-safe)
      let anySuccess = false;
      for (let i = 0; i < parallelEpics.length; i++) {
        const epicItem = parallelEpics[i];
        const result = spawnResults[i];
        state.total_cost += result.costUsd;

        if (result.exitCode !== 0) {
          console.log(`[loop] Task ${epicItem.id} failed`);
          recordError(state, epicItem.id, result.stderr, 1);
          state.failed_tasks.push(epicItem.id);
          try {
            coord.blockTask(epicItem.id, 'Loop: failed in parallel batch');
          } catch (err) {
            console.error(`[loop] Warning: could not block task ${epicItem.id}: ${err.message}`);
          }
        } else {
          try {
            coord.completeTask(epicItem.id);
            state.completed_tasks.push(epicItem.id);
            state.last_progress_at = getTimestamp();
            console.log(`[loop] Task ${epicItem.id} completed successfully`);
            anySuccess = true;
          } catch (err) {
            console.error(`[loop] Warning: DAG update failed for ${epicItem.id}: ${err.message}`);
          }
        }
      }
      saveLoopState(state, projectRoot);

      if (!anySuccess) {
        console.log('[loop] No parallel tasks succeeded');
        state.status = 'failed';
        break;
      }
      continue;
    }

    // Fall back to next task
    const task = coord.nextTask(epicScope);
    if (!task) {
      console.log('[loop] All tasks complete!');
      state.status = 'complete';
      break;
    }

    const success = runTask(task, coord, state, options);
    saveLoopState(state, projectRoot);

    if (!success) {
      // In DAG mode, try to continue with other tasks
      const nextTask = coord.nextTask(epicScope);
      if (!nextTask) {
        console.log('[loop] No more tasks available after failure');
        state.status = 'failed';
        break;
      }
    }
  }

  finalizeLoop(state, maxRuns, projectRoot);
  printSummary(state);
}

/**
 * Main entry point
 */
async function main() {
  const options = parseLoopArgs(process.argv.slice(2));

  if (options.pattern === 'dag') {
    await runDag(options);
  } else {
    runSequential(options);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseLoopArgs,
  buildTaskPrompt,
  spawnSession,
  spawnSessionAsync,
  runTask,
  isStalled,
  isRetryStorm,
  checkStopConditions,
  detectWorktree,
  runSequential,
  runDag,
};
